Nova — Enterprise Logistics Intelligence Platform
An agentic AI platform that parses shipment documents, scores risk, orchestrates multi-step approval workflows, and makes operational decisions — powered by NVIDIA NIM (Llama 3.1 70B).
Table of Contents
Overview
Architecture
Tech Stack
Project Structure
Getting Started
Environment Variables
API Reference
Platform Modules
How the AI Agent Works
NVIDIA NIM Models
Workflow & Approval Logic
Risk Scoring Algorithm
Overview
Nova is a full-stack enterprise logistics intelligence platform built on top of NVIDIA NIM's hosted LLM inference. It is inspired by GoComet's Nova platform and implements four core pillars:
Pillar
What it does
Agent Engine
Parses raw shipment documents (BL, Invoice, Customs), extracts structured fields, runs risk assessment, and issues an operational decision
Workflow Orchestrator
Configurable multi-step approval pipelines — create, execute, approve/reject instances
Shipment Management
Full CRUD for shipment records with status lifecycle tracking
Incident Management
Exception logging, severity classification, resolution tracking with stats
Architecture
Code
Tech Stack
Frontend
React 18 (Vite)
Axios for HTTP
Pure inline styles — no CSS framework dependency
Backend
FastAPI (Python 3.11+)
httpx (async HTTP client for NVIDIA API calls)
Pydantic v2 for request validation
python-multipart for file uploads
PyYAML for workflow YAML export
In-memory dict store (production: replace with PostgreSQL + ClickHouse)
AI
NVIDIA NIM hosted inference
Model: meta/llama-3.1-70b-instruct
OpenAI-compatible /v1/chat/completions endpoint
Project Structure
Code
Getting Started
Prerequisites
Python 3.11+
Node.js 18+
An NVIDIA NIM API key from build.nvidia.com
1. Clone & set up backend
Bash
2. Create .env
Bash
3. Start the backend
Bash
Swagger UI available at: http://127.0.0.1:8000/docs
4. Set up and start the frontend
Bash
App available at: http://localhost:5173
Environment Variables
Variable
Required
Description
NVIDIA_API_KEY
Yes
API key from build.nvidia.com — used for all LLM inference
API Reference
Agent Core
Method
Endpoint
Description
POST
/parse
Parse a raw document string through the Nova agent pipeline
GET
/health
Health check — returns model name and key status
Shipments
Method
Endpoint
Description
POST
/api/shipments/
Create a new shipment record
GET
/api/shipments/
List all shipments (filterable by ?status=)
GET
/api/shipments/{id}
Get a single shipment
PUT
/api/shipments/{id}
Update shipment fields
DELETE
/api/shipments/{id}
Delete a shipment
GET
/api/shipments/tracking/{num}
Look up by tracking number
Documents
Method
Endpoint
Description
POST
/api/documents/upload
Upload a file (multipart/form-data)
GET
/api/documents/
List all documents
GET
/api/documents/{id}
Get document metadata
DELETE
/api/documents/{id}
Delete a document
GET
/api/documents/{id}/download
Download the raw file
POST
/api/documents/{id}/validate
Mark document as validated
Workflows
Method
Endpoint
Description
POST
/api/workflows/
Create a workflow definition
GET
/api/workflows/
List all workflows
GET
/api/workflows/{id}
Get a workflow
PUT
/api/workflows/{id}
Update a workflow
DELETE
/api/workflows/{id}
Delete a workflow
POST
/api/workflows/{id}/activate
Set workflow to active
POST
/api/workflows/{id}/deactivate
Set workflow to inactive
POST
/api/workflows/{id}/execute
Spawn a new workflow instance
GET
/api/workflows/instances/
List all instances
GET
/api/workflows/instances/{id}
Get a specific instance
POST
/api/workflows/instances/{id}/approve
Approve current node
POST
/api/workflows/instances/{id}/reject
Reject current node
GET
/api/workflows/{id}/yaml
Export workflow definition as YAML
Agents
Method
Endpoint
Description
GET
/api/agents/types
Get all supported agent types
POST
/api/agents/
Register a new agent
GET
/api/agents/
List all agents
GET
/api/agents/{id}
Get agent details
DELETE
/api/agents/{id}
Delete an agent
POST
/api/agents/{id}/run
Run an agent with optional input + context
Incidents
Method
Endpoint
Description
POST
/api/incidents/
Report a new incident
GET
/api/incidents/
List incidents (filterable by ?status= or ?severity=)
GET
/api/incidents/{id}
Get a single incident
PUT
/api/incidents/{id}
Update incident fields
DELETE
/api/incidents/{id}
Delete an incident
POST
/api/incidents/{id}/resolve
Resolve an incident with a note
GET
/api/incidents/stats/summary
Aggregate stats (total, open, resolved, by severity)
Platform Modules
◈ Dashboard
Command center view. Loads live counts from /api/shipments/, /api/incidents/, and /api/workflows/ in parallel. Shows: total shipments, open incidents, active workflows, pending reviews, recent shipment list, and open incident list. Quick-action buttons navigate to the relevant panel.
◎ Agent Engine
The core Nova intelligence loop. Accepts raw text of any shipment document, runs it through a 4-stage visual pipeline, and returns a structured JSON result with extracted fields, risk flags, and a decision. If "Auto-create shipment" is toggled on, a shipment record is automatically created in the database after every successful parse (except ESCALATE decisions).
⬡ Shipments
Full CRUD panel. Create shipments manually or let the Agent Engine populate them automatically. Filter by status (pending / active / completed / cancelled). Click any row to expand the raw JSON. Status can be updated via the Edit flow or directly by the agent.
⬟ Workflow Orchestrator
Create named workflow definitions with a trigger type (manual, document_upload, shipment_created). Each new workflow auto-generates a 4-node pipeline: Start → Document Review → Approval → Complete. Execute a workflow to spawn an instance. Switch to the "Instances & Approvals" tab to approve or reject pending instances.
◧ Documents
File upload (click or drag-and-drop). Stores files server-side under uploaded_docs/. Supports validate action (marks the document as checked), download, and delete. In production this connects to an OCR/extraction pipeline.
◉ Agents
Register named AI agents by type: document_extraction, risk_assessment, analytics, monitoring, recommendation, customs_compliance, rate_comparison. Running an agent fires a live NVIDIA NIM call with a type-specific system prompt and returns structured JSON findings, recommendations, and a confidence score.
△ Incidents
Exception management. Report incidents with a title, description, severity (low/medium/high/critical), and type (delay/compliance/documentation/customs/other). Resolve with a note. Stats summary card shows open vs resolved counts.
How the AI Agent Works
When you click Run Nova Agent, the following happens:
Code
The system prompt instructs the model to return only a valid JSON object matching this schema:
Json
The backend strips any accidental markdown fences and parses the JSON. If parsing fails, a 500 is returned with the raw model output for debugging.
NVIDIA NIM Models
All models use the same base URL and API key. To switch, change MODEL in main.py:
Model string
Notes
meta/llama-3.1-70b-instruct
Default. Good balance of speed and accuracy
meta/llama-3.1-405b-instruct
Highest accuracy, slower, more expensive
nvidia/nemotron-4-340b-instruct
NVIDIA's own flagship reasoning model
mistralai/mixtral-8x7b-instruct-v0.1
Fastest, cheapest, good for high-volume
mistralai/mistral-large
Strong structured output compliance
meta/codellama-70b
Best for code-heavy or schema-heavy tasks
Get API keys and test models at: build.nvidia.com
Workflow & Approval Logic
When you create a workflow, Nova stores a definition (a directed graph of nodes + edges). When you execute it, Nova creates a workflow instance — a live run of that definition — and sets its status to pending at the first actionable node.
Code
Each instance stores: workflow_id, current_node, status, context (arbitrary JSON payload), approved_by / rejected_by, and timestamps. In production you would add: per-node approver assignment, SLA timers, email notifications, and audit trail.
Risk Scoring Algorithm
The risk engine is prompt-engineered into the LLM rather than being rule-based. The model is instructed to apply this logic:
Level
Triggers
HIGH
Sanctioned origin countries (Iran, Russia, North Korea, Syria, Cuba), missing HS code on high-value cargo, No Commercial Value (NCV) declaration, consignee listed as "TO ORDER" combined with cash payment terms, post-issuance document amendments, missing shipper address
MEDIUM
Incomplete documentation, declared value discrepancies, unusual routing, missing EORI number
LOW
Minor missing fields, non-critical notes
Decision mapping:
Any HIGH flag → ESCALATE
MEDIUM flags + missing docs → HOLD
Only LOW flags → REVIEW
No flags → APPROVE
The confidence score (0–100) is also LLM-generated, reflecting how complete and unambiguous the source document is. A well-formed Bill of Lading with all fields present scores 90+. A vague manifest with withheld consignee names scores in the 40–60 range.
Notes on the Timeout Error
If you see httpx.ReadTimeout on large documents (especially the "risky" sample), increase the timeout in main.py:
Python
The Llama 3.1 70B model on NVIDIA NIM can take 30–90 seconds for complex, long documents. Alternatively switch to mixtral-8x7b for faster responses on high-volume workloads.
