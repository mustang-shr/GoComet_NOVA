<div align="center">

<img src="https://capsule-render.vercel.app/api?type=venom&height=220&text=Nova&fontSize=80&color=gradient&customColorList=2&fontColor=ffffff&animation=fadeIn&desc=Enterprise%20Logistics%20Intelligence%20Platform%20%E2%80%A2%20Agentic%20AI%20%E2%80%A2%20NVIDIA%20NIM&descSize=14&descAlignY=72&fontAlignY=42" width="100%"/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=14&duration=2600&pause=1200&color=00D4FF&center=true&vCenter=true&width=700&lines=Agentic+AI+for+enterprise+logistics+intelligence;Parse+shipments+%C2%B7+score+risk+%C2%B7+orchestrate+approvals;NVIDIA+NIM+(Llama+3.1+70B)+%C2%B7+FastAPI+%C2%B7+React+18;Multi-step+approval+workflows+with+AI+decision+engine)](https://git.io/typing-svg)

[![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)](https://github.com/mustang-shr/GoComet_NOVA)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://github.com/mustang-shr/GoComet_NOVA)
[![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)](https://github.com/mustang-shr/GoComet_NOVA)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA%20NIM-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://github.com/mustang-shr/GoComet_NOVA)
[![Stars](https://img.shields.io/github/stars/mustang-shr/GoComet_NOVA?style=flat-square&color=00d4ff)](https://github.com/mustang-shr/GoComet_NOVA/stargazers)

</div>

---

## 🤖 Agentic AI Logistics Intelligence — What Nova Does

**Nova** is a production-grade enterprise logistics intelligence platform powered by **NVIDIA NIM (Llama 3.1 70B)**. It parses raw shipment documents, scores operational risk, orchestrates multi-step approval workflows, and makes autonomous decisions — inspired by GoComet's Nova platform.

```
Raw Shipment Documents (BL · Invoice · Customs)
              │
              ▼
    ┌─────────────────────┐
    │   AI Agent Engine   │  ← NVIDIA NIM (Llama 3.1 70B)
    │   Document Parser   │     httpx async inference
    │   Risk Scorer       │     Pydantic v2 validation
    └────────┬────────────┘
             │
    ┌────────▼────────────┐
    │  Workflow Engine    │  ← Multi-step approval pipelines
    │  Create · Execute   │     Approve / Reject instances
    │  Approve · Reject   │     Configurable stages
    └────────┬────────────┘
             │
    ┌────────▼────────────┐
    │  GraphQL + FastAPI  │  ← React 18 (Vite) frontend
    │  Shipment CRUD      │     Axios HTTP client
    │  Incident Mgmt      │     Pure inline styles
    └─────────────────────┘
```

---

## 🚀 Four Core Pillars

<table>
<tr>
<td width="50%" valign="top">

### 🧠 Agent Engine
Parses raw shipment documents (Bill of Lading, Invoice, Customs declarations), extracts structured fields, runs multi-factor risk assessment, and issues an **autonomous operational decision**.

`nvidia-nim` `llama-3.1-70b` `document-parsing` `risk-scoring`

</td>
<td width="50%" valign="top">

### 🔁 Workflow Orchestrator
Configurable multi-step approval pipelines — create, execute, approve/reject instances. Full lifecycle management with stage-by-stage tracking and audit trail.

`workflow-automation` `approval-pipeline` `multi-step` `orchestration`

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📦 Shipment Management
Full CRUD for shipment records with complete status lifecycle tracking — from creation through customs clearance to final delivery.

`shipment-tracking` `crud` `status-lifecycle` `logistics`

</td>
<td width="50%" valign="top">

### 🚨 Incident Management
Exception logging, severity classification, and resolution tracking with aggregate stats. Real-time operational exception surface for logistics teams.

`incident-management` `exception-logging` `severity-classification`

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **LLM Inference** | NVIDIA NIM · Llama 3.1 70B hosted API |
| **Backend** | FastAPI (Python 3.11+) · httpx async · Pydantic v2 |
| **File Handling** | python-multipart · PyYAML |
| **Frontend** | React 18 (Vite) · Axios |
| **API Pattern** | REST APIs · async/await throughout |

---

## ⚡ Getting Started

### Prerequisites
```bash
Python 3.11+
Node.js 18+
NVIDIA NIM API Key
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env        # Add your NVIDIA NIM API key
uvicorn main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables
```env
NVIDIA_API_KEY=your_nvidia_nim_api_key_here
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
MODEL_ID=meta/llama-3.1-70b-instruct
```

---

## 📁 Project Structure

```
GoComet_NOVA/
├── backend/
│   ├── main.py               # FastAPI app + routes
│   ├── agent.py              # NVIDIA NIM agent engine
│   ├── risk_scorer.py        # Risk assessment algorithm
│   ├── workflow.py           # Approval pipeline logic
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/       # React 18 UI components
│   │   ├── pages/            # Agent · Workflow · Shipment · Incident
│   │   └── api/              # Axios HTTP client
│   └── package.json
└── README.md
```

---

## 🏆 Why This Project Stands Out

- **Real enterprise architecture** — not a toy demo. 4 production modules with full CRUD, lifecycle management, and async LLM inference.
- **NVIDIA NIM integration** — using hosted Llama 3.1 70B for document parsing, not a simple prompt wrapper.
- **Risk scoring algorithm** — custom-built multi-factor risk model for logistics operations.
- **Async throughout** — httpx async client ensures non-blocking LLM calls under concurrent load.

---

<div align="center">

⭐ **If Nova helped you — star this repo. It helps others find it.**

[![LinkedIn](https://img.shields.io/badge/Shreyan%20Pal-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/shreyan-pal)
[![GitHub](https://img.shields.io/badge/mustang--shr-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/mustang-shr)

</div>

<!-- SEO: agentic-ai enterprise-logistics nvidia-nim llama-3.1-70b fastapi react document-parsing risk-scoring workflow-orchestration approval-pipeline shipment-management incident-management python async logistics-intelligence gocomet multi-agent llm-inference -->

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2&height=80&section=footer&animation=fadeIn" width="100%"/>
</div>
