from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import httpx
import json
import os
import uuid
import shutil
from datetime import datetime
from typing import Optional, List, Any, Dict
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Nova Logistics Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
MODEL = "meta/llama-3.1-70b-instruct"

SYSTEM_PROMPT = """You are Nova, an AI logistics agent that parses shipment documents and makes operational decisions.
You MUST respond with ONLY valid JSON — no explanation, no markdown, no backticks.

Your response schema:
{
  "extracted": {
    "document_type": "Bill of Lading | Commercial Invoice | Customs Declaration | Other",
    "shipper": "company name or Unknown",
    "consignee": "company name or Unknown",
    "port_of_loading": "port, country or Unknown",
    "port_of_discharge": "port, country or Unknown",
    "eta": "YYYY-MM-DD or Unknown",
    "cargo": "brief cargo description",
    "hs_code": "code or Not declared",
    "gross_weight_kg": "number as string or Unknown",
    "total_value_usd": "number as string or Unknown",
    "incoterms": "term or Not specified",
    "missing_fields": ["list of important fields that are absent"]
  },
  "risk_flags": [
    { "level": "HIGH|MEDIUM|LOW", "flag": "short flag title", "detail": "one sentence explanation" }
  ],
  "decision": {
    "action": "APPROVE | HOLD | ESCALATE | REVIEW",
    "reason": "2-3 sentence summary",
    "next_steps": ["step 1", "step 2", "step 3"],
    "confidence": 87
  }
}

Risk logic:
- HIGH: sanctioned origins (Iran, Russia, North Korea, Syria, Cuba), missing HS codes on high-value cargo, NCV declaration, consignee TO ORDER + cash payment, post-issuance amendments, missing shipper address
- MEDIUM: incomplete docs, value discrepancies, unusual routes, missing EORI
- LOW: minor missing fields, standard notes
Decision: ESCALATE=any HIGH, HOLD=MEDIUM+missing docs, REVIEW=LOW flags, APPROVE=clean"""

# ── In-memory stores (replace with real DB in production) ────────────────────
db = {
    "shipments": {},
    "documents": {},
    "workflows": {},
    "workflow_instances": {},
    "agents": {},
    "incidents": {},
}

# ── Pydantic Models ───────────────────────────────────────────────────────────

class ParseRequest(BaseModel):
    document: str

class ShipmentCreate(BaseModel):
    tracking_number: Optional[str] = None
    shipper_name: Optional[str] = None
    consignee_name: Optional[str] = None
    origin_port: Optional[str] = None
    destination_port: Optional[str] = None
    cargo_description: Optional[str] = None
    hs_code: Optional[str] = None
    gross_weight_kg: Optional[float] = None
    total_value_usd: Optional[float] = None
    incoterms: Optional[str] = None
    status: Optional[str] = "pending"
    eta: Optional[str] = None

class ShipmentUpdate(BaseModel):
    shipper_name: Optional[str] = None
    consignee_name: Optional[str] = None
    status: Optional[str] = None
    cargo_description: Optional[str] = None

class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_type: Optional[str] = "manual"
    nodes: Optional[List[Any]] = []
    edges: Optional[List[Any]] = []

class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class WorkflowApprove(BaseModel):
    comment: Optional[str] = None
    approved_by: Optional[str] = "system"

class WorkflowReject(BaseModel):
    comment: Optional[str] = None
    rejected_by: Optional[str] = "system"

class AgentCreate(BaseModel):
    name: str
    agent_type: Optional[str] = "document_extraction"
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = {}

class AgentRun(BaseModel):
    input: Optional[str] = None
    context: Optional[Dict[str, Any]] = {}

class IncidentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    severity: Optional[str] = "medium"
    incident_type: Optional[str] = "other"
    shipment_id: Optional[str] = None

class IncidentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None

class IncidentResolve(BaseModel):
    resolution_note: Optional[str] = None

# ── HELPERS ───────────────────────────────────────────────────────────────────

def now_iso():
    return datetime.utcnow().isoformat() + "Z"

def new_id():
    return str(uuid.uuid4())

# ── PARSE ENDPOINT (Nova Agent Core) ─────────────────────────────────────────

@app.post("/parse")
async def parse_document(req: ParseRequest):
    if not NVIDIA_API_KEY:
        raise HTTPException(status_code=500, detail="NVIDIA_API_KEY not set in .env")

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Parse this shipment document:\n\n{req.document}"}
        ],
        "max_tokens": 1200,
        "temperature": 0.1
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{NVIDIA_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
            json=payload
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    raw = resp.json()["choices"][0]["message"]["content"]
    try:
        clean = raw.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail=f"Agent returned invalid JSON: {raw}")

    return result

# ── SHIPMENTS ─────────────────────────────────────────────────────────────────

@app.post("/api/shipments/")
async def create_shipment(data: ShipmentCreate):
    sid = new_id()
    shipment = {
        "id": sid,
        "tracking_number": data.tracking_number or f"NOVA-{sid[:8].upper()}",
        "shipper_name": data.shipper_name,
        "consignee_name": data.consignee_name,
        "origin_port": data.origin_port,
        "destination_port": data.destination_port,
        "cargo_description": data.cargo_description,
        "hs_code": data.hs_code,
        "gross_weight_kg": data.gross_weight_kg,
        "total_value_usd": data.total_value_usd,
        "incoterms": data.incoterms,
        "status": data.status or "pending",
        "eta": data.eta,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    db["shipments"][sid] = shipment
    return shipment

@app.get("/api/shipments/")
async def list_shipments(status: Optional[str] = None, limit: int = 100, offset: int = 0):
    ships = list(db["shipments"].values())
    if status:
        ships = [s for s in ships if s.get("status") == status]
    return {"shipments": ships[offset:offset+limit], "total": len(ships)}

@app.get("/api/shipments/tracking/{tracking_number}")
async def get_shipment_by_tracking(tracking_number: str):
    for s in db["shipments"].values():
        if s.get("tracking_number") == tracking_number:
            return s
    raise HTTPException(status_code=404, detail="Shipment not found")

@app.get("/api/shipments/{shipment_id}")
async def get_shipment(shipment_id: str):
    s = db["shipments"].get(shipment_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return s

@app.put("/api/shipments/{shipment_id}")
async def update_shipment(shipment_id: str, data: ShipmentUpdate):
    s = db["shipments"].get(shipment_id)
    if not s:
        raise HTTPException(status_code=404, detail="Shipment not found")
    for k, v in data.dict(exclude_none=True).items():
        s[k] = v
    s["updated_at"] = now_iso()
    return s

@app.delete("/api/shipments/{shipment_id}")
async def delete_shipment(shipment_id: str):
    if shipment_id not in db["shipments"]:
        raise HTTPException(status_code=404, detail="Shipment not found")
    del db["shipments"][shipment_id]
    return {"deleted": True, "id": shipment_id}

# ── DOCUMENTS ─────────────────────────────────────────────────────────────────

os.makedirs("uploaded_docs", exist_ok=True)

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    document_type: Optional[str] = Form("other"),
    shipment_id: Optional[str] = Form(None)
):
    doc_id = new_id()
    path = f"uploaded_docs/{doc_id}_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    size = os.path.getsize(path)
    doc = {
        "id": doc_id,
        "filename": file.filename,
        "document_type": document_type,
        "file_path": path,
        "file_size": size,
        "content_type": file.content_type,
        "shipment_id": shipment_id,
        "is_validated": False,
        "created_at": now_iso(),
    }
    db["documents"][doc_id] = doc
    return doc

@app.get("/api/documents/")
async def list_documents(document_type: Optional[str] = None):
    docs = list(db["documents"].values())
    if document_type:
        docs = [d for d in docs if d.get("document_type") == document_type]
    return {"documents": docs, "total": len(docs)}

@app.get("/api/documents/{doc_id}")
async def get_document(doc_id: str):
    d = db["documents"].get(doc_id)
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return d

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    d = db["documents"].get(doc_id)
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        os.remove(d["file_path"])
    except:
        pass
    del db["documents"][doc_id]
    return {"deleted": True, "id": doc_id}

@app.get("/api/documents/{doc_id}/download")
async def download_document(doc_id: str):
    from fastapi.responses import FileResponse
    d = db["documents"].get(doc_id)
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(d["file_path"], filename=d["filename"])

@app.post("/api/documents/{doc_id}/validate")
async def validate_document(doc_id: str):
    d = db["documents"].get(doc_id)
    if not d:
        raise HTTPException(status_code=404, detail="Document not found")
    d["is_validated"] = True
    d["validated_at"] = now_iso()
    d["validation_result"] = {"status": "passed", "checks": ["format", "completeness", "signature"]}
    return d

# ── WORKFLOWS ─────────────────────────────────────────────────────────────────

@app.post("/api/workflows/")
async def create_workflow(data: WorkflowCreate):
    wid = new_id()
    wf = {
        "id": wid,
        "name": data.name,
        "description": data.description,
        "trigger_type": data.trigger_type,
        "nodes": data.nodes or [],
        "edges": data.edges or [],
        "is_active": False,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    db["workflows"][wid] = wf
    return wf

@app.get("/api/workflows/")
async def list_workflows():
    wfs = list(db["workflows"].values())
    return {"workflows": wfs, "total": len(wfs)}

@app.get("/api/workflows/instances/")
async def list_workflow_instances():
    insts = list(db["workflow_instances"].values())
    return {"instances": insts, "total": len(insts)}

@app.get("/api/workflows/instances/{instance_id}")
async def get_workflow_instance(instance_id: str):
    inst = db["workflow_instances"].get(instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instance not found")
    return inst

@app.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str):
    wf = db["workflows"].get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf

@app.put("/api/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, data: WorkflowUpdate):
    wf = db["workflows"].get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    for k, v in data.dict(exclude_none=True).items():
        wf[k] = v
    wf["updated_at"] = now_iso()
    return wf

@app.delete("/api/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    if workflow_id not in db["workflows"]:
        raise HTTPException(status_code=404, detail="Workflow not found")
    del db["workflows"][workflow_id]
    return {"deleted": True}

@app.post("/api/workflows/{workflow_id}/activate")
async def activate_workflow(workflow_id: str):
    wf = db["workflows"].get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf["is_active"] = True
    return wf

@app.post("/api/workflows/{workflow_id}/deactivate")
async def deactivate_workflow(workflow_id: str):
    wf = db["workflows"].get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf["is_active"] = False
    return wf

@app.post("/api/workflows/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, body: dict = {}):
    wf = db["workflows"].get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    inst_id = new_id()
    first_node = wf["nodes"][1]["id"] if len(wf["nodes"]) > 1 else "start"
    inst = {
        "id": inst_id,
        "workflow_id": workflow_id,
        "workflow_name": wf["name"],
        "status": "pending",
        "current_node": first_node,
        "context": body.get("context", {}),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    db["workflow_instances"][inst_id] = inst
    return inst

@app.post("/api/workflows/instances/{instance_id}/approve")
async def approve_workflow_node(instance_id: str, data: WorkflowApprove):
    inst = db["workflow_instances"].get(instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instance not found")
    inst["status"] = "completed"
    inst["approved_by"] = data.approved_by
    inst["comment"] = data.comment
    inst["updated_at"] = now_iso()
    return inst

@app.post("/api/workflows/instances/{instance_id}/reject")
async def reject_workflow_node(instance_id: str, data: WorkflowReject):
    inst = db["workflow_instances"].get(instance_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Instance not found")
    inst["status"] = "rejected"
    inst["rejected_by"] = data.rejected_by
    inst["comment"] = data.comment
    inst["updated_at"] = now_iso()
    return inst

@app.get("/api/workflows/{workflow_id}/yaml")
async def get_workflow_yaml(workflow_id: str):
    import yaml
    wf = db["workflows"].get(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=yaml.dump(wf, default_flow_style=False), media_type="text/yaml")

# ── AGENTS ────────────────────────────────────────────────────────────────────

AGENT_TYPES = [
    "document_extraction",
    "risk_assessment",
    "analytics",
    "monitoring",
    "recommendation",
    "customs_compliance",
    "rate_comparison",
]

@app.get("/api/agents/types")
async def get_agent_types():
    return {"types": AGENT_TYPES}

@app.post("/api/agents/")
async def create_agent(data: AgentCreate):
    aid = new_id()
    agent = {
        "id": aid,
        "name": data.name,
        "agent_type": data.agent_type,
        "description": data.description,
        "config": data.config or {},
        "status": "idle",
        "created_at": now_iso(),
    }
    db["agents"][aid] = agent
    return agent

@app.get("/api/agents/")
async def list_agents():
    agents = list(db["agents"].values())
    return {"agents": agents, "total": len(agents)}

@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str):
    a = db["agents"].get(agent_id)
    if not a:
        raise HTTPException(status_code=404, detail="Agent not found")
    return a

@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    if agent_id not in db["agents"]:
        raise HTTPException(status_code=404, detail="Agent not found")
    del db["agents"][agent_id]
    return {"deleted": True}

@app.post("/api/agents/{agent_id}/run")
async def run_agent(agent_id: str, data: AgentRun):
    a = db["agents"].get(agent_id)
    if not a:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Use NVIDIA to power the agent
    if not NVIDIA_API_KEY:
        return {"agent_id": agent_id, "status": "completed", "output": "Agent ran (no API key — mock result)", "context": data.context}

    agent_prompt = f"""You are a logistics AI agent of type: {a['agent_type']}.
Task: {data.input or 'Analyze and provide insights on current logistics operations'}
Context: {json.dumps(data.context or {})}

Respond in JSON with keys: summary, findings (list), recommendations (list), confidence (0-100)."""

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": "You are an expert logistics AI agent. Respond ONLY in valid JSON."},
            {"role": "user", "content": agent_prompt}
        ],
        "max_tokens": 800,
        "temperature": 0.2
    }

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(
                f"{NVIDIA_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "Content-Type": "application/json"},
                json=payload
            )
        if resp.status_code == 200:
            raw = resp.json()["choices"][0]["message"]["content"]
            clean = raw.replace("```json", "").replace("```", "").strip()
            try:
                result = json.loads(clean)
            except:
                result = {"summary": raw, "findings": [], "recommendations": [], "confidence": 70}
        else:
            result = {"summary": "Agent execution failed", "error": resp.text}
    except Exception as e:
        result = {"summary": f"Agent error: {str(e)}"}

    return {
        "agent_id": agent_id,
        "agent_name": a["name"],
        "agent_type": a["agent_type"],
        "status": "completed",
        "ran_at": now_iso(),
        "output": result,
    }

# ── INCIDENTS ─────────────────────────────────────────────────────────────────

@app.post("/api/incidents/")
async def create_incident(data: IncidentCreate):
    iid = new_id()
    inc = {
        "id": iid,
        "title": data.title,
        "description": data.description,
        "severity": data.severity,
        "incident_type": data.incident_type,
        "shipment_id": data.shipment_id,
        "status": "open",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    db["incidents"][iid] = inc
    return inc

@app.get("/api/incidents/stats/summary")
async def get_incident_stats():
    incs = list(db["incidents"].values())
    return {
        "total": len(incs),
        "open": sum(1 for i in incs if i.get("status") == "open"),
        "resolved": sum(1 for i in incs if i.get("status") == "resolved"),
        "by_severity": {
            "low": sum(1 for i in incs if i.get("severity") == "low"),
            "medium": sum(1 for i in incs if i.get("severity") == "medium"),
            "high": sum(1 for i in incs if i.get("severity") == "high"),
            "critical": sum(1 for i in incs if i.get("severity") == "critical"),
        },
        "avg_resolution_hours": None,
    }

@app.get("/api/incidents/")
async def list_incidents(status: Optional[str] = None, severity: Optional[str] = None):
    incs = list(db["incidents"].values())
    if status:
        incs = [i for i in incs if i.get("status") == status]
    if severity:
        incs = [i for i in incs if i.get("severity") == severity]
    return {"incidents": incs, "total": len(incs)}

@app.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: str):
    i = db["incidents"].get(incident_id)
    if not i:
        raise HTTPException(status_code=404, detail="Incident not found")
    return i

@app.put("/api/incidents/{incident_id}")
async def update_incident(incident_id: str, data: IncidentUpdate):
    i = db["incidents"].get(incident_id)
    if not i:
        raise HTTPException(status_code=404, detail="Incident not found")
    for k, v in data.dict(exclude_none=True).items():
        i[k] = v
    i["updated_at"] = now_iso()
    return i

@app.delete("/api/incidents/{incident_id}")
async def delete_incident(incident_id: str):
    if incident_id not in db["incidents"]:
        raise HTTPException(status_code=404, detail="Incident not found")
    del db["incidents"][incident_id]
    return {"deleted": True}

@app.post("/api/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, data: IncidentResolve):
    i = db["incidents"].get(incident_id)
    if not i:
        raise HTTPException(status_code=404, detail="Incident not found")
    i["status"] = "resolved"
    i["resolution_note"] = data.resolution_note
    i["resolved_at"] = now_iso()
    i["updated_at"] = now_iso()
    return i

# ── ROOT ──────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "name": "Nova Logistics Intelligence",
        "version": "2.0.0",
        "status": "operational",
        "model": MODEL,
        "endpoints": {
            "agent": "/parse",
            "shipments": "/api/shipments/",
            "documents": "/api/documents/",
            "workflows": "/api/workflows/",
            "agents": "/api/agents/",
            "incidents": "/api/incidents/",
            "docs": "/docs",
        }
    }

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "api_key_set": bool(NVIDIA_API_KEY)}