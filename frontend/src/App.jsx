import React, { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'
import { SAMPLES } from './Samples'

// ── API BASE ──────────────────────────────────────────────────────────────────
const API = 'http://127.0.0.1:8000/api'

// ── NVIDIA / NOVA AGENT CONFIG ────────────────────────────────────────────────
const NVIDIA_KEY = import.meta.env.VITE_NVIDIA_API_KEY || ''
const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1'
const MODEL = 'meta/llama-3.1-70b-instruct'

// ── HELPERS ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))
const cls = (...args) => args.filter(Boolean).join(' ')
const fmt = n => n != null ? Number(n).toLocaleString() : '—'

// ── COLOR TOKENS ──────────────────────────────────────────────────────────────
const C = {
  bg:     '#09090b',
  bg1:    '#111113',
  bg2:    '#18181b',
  bg3:    '#1f1f24',
  border: '#27272a',
  border2:'#3f3f46',
  text:   '#fafafa',
  text2:  '#a1a1aa',
  text3:  '#52525b',
  green:  '#22c55e',
  greenD: '#16a34a',
  teal:   '#14b8a6',
  blue:   '#3b82f6',
  amber:  '#f59e0b',
  red:    '#ef4444',
  purple: '#a855f7',
}

const STATUS_COLORS = {
  APPROVE:  { bg: 'rgba(34,197,94,0.12)',  border: '#22c55e', text: '#4ade80'  },
  HOLD:     { bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#fbbf24'  },
  ESCALATE: { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', text: '#f87171'  },
  REVIEW:   { bg: 'rgba(59,130,246,0.12)', border: '#3b82f6', text: '#60a5fa'  },
}

// ── SHARED UI ATOMS ───────────────────────────────────────────────────────────
function Badge({ label, color = C.teal, small }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: small ? '2px 7px' : '3px 10px',
      borderRadius: 20,
      background: color + '22',
      border: `1px solid ${color}44`,
      color, fontSize: small ? 10 : 11,
      fontWeight: 600, letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }}>{label}</span>
  )
}

function Pill({ children, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 20,
      background: active ? C.teal + '22' : 'transparent',
      border: `1px solid ${active ? C.teal : C.border}`,
      color: active ? C.teal : C.text2, fontSize: 12,
      cursor: 'pointer', fontWeight: active ? 600 : 400,
      transition: 'all 0.15s',
    }}>{children}</button>
  )
}

function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: C.bg1, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: '1.25rem',
      cursor: onClick ? 'pointer' : 'default',
      transition: onClick ? 'border-color 0.2s' : undefined,
      ...style
    }}>{children}</div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
      {children}
    </div>
  )
}

function Stat({ label, value, color = C.teal, sub }) {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 4, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, letterSpacing: '-0.03em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── SIDEBAR NAV ───────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard',  icon: '◈', label: 'Dashboard'   },
  { id: 'agent',      icon: '◎', label: 'Agent'        },
  { id: 'shipments',  icon: '⬡', label: 'Shipments'   },
  { id: 'workflows',  icon: '⬟', label: 'Workflows'   },
  { id: 'documents',  icon: '◧', label: 'Documents'   },
  { id: 'agents',     icon: '◉', label: 'Agents'      },
  { id: 'incidents',  icon: '△', label: 'Incidents'   },
]

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENT PANEL (Nova AI Core) ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const AGENT_STAGES = [
  { id: 1, label: 'Ingest',     desc: 'Document received' },
  { id: 2, label: 'Extract',    desc: 'Parsing fields'    },
  { id: 3, label: 'Risk Check', desc: 'Evaluating flags'  },
  { id: 4, label: 'Decision',   desc: 'Action routing'    },
]

const SYSTEM_PROMPT = `You are Nova, an enterprise AI logistics agent. Respond ONLY with valid JSON.

Schema:
{
  "extracted": {
    "document_type": "Bill of Lading | Commercial Invoice | Customs Declaration | Other",
    "shipper": "company name or Unknown",
    "consignee": "company name or Unknown",
    "port_of_loading": "port, country or Unknown",
    "port_of_discharge": "port, country or Unknown",
    "eta": "YYYY-MM-DD or Unknown",
    "cargo": "brief description",
    "hs_code": "code or Not declared",
    "gross_weight_kg": "number as string or Unknown",
    "total_value_usd": "number as string or Unknown",
    "incoterms": "term or Not specified",
    "missing_fields": ["list of absent important fields"]
  },
  "risk_flags": [
    { "level": "HIGH|MEDIUM|LOW", "flag": "title", "detail": "one sentence" }
  ],
  "decision": {
    "action": "APPROVE | HOLD | ESCALATE | REVIEW",
    "reason": "2-3 sentence rationale",
    "next_steps": ["step 1", "step 2", "step 3"],
    "confidence": 87
  }
}

Risk logic:
- HIGH: sanctioned origins (Iran, Russia, North Korea, Syria, Cuba), missing HS on high-value, NCV, TO ORDER+cash, post-issuance amendments, missing shipper address
- MEDIUM: incomplete docs, value discrepancies, unusual routes, missing EORI
- LOW: minor missing fields
Decision: ESCALATE=any HIGH, HOLD=MEDIUM+missing docs, REVIEW=LOW, APPROVE=clean`

function AgentPanel({ onResult }) {
  const [doc, setDoc] = useState('')
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [autoCreateShipment, setAutoCreateShipment] = useState(true)

  async function runAgent() {
    if (!doc.trim()) return
    setLoading(true); setResult(null); setError(null)
    try {
      setStage(1); await sleep(250)
      setStage(2); await sleep(400)

      // Call backend parse endpoint
      const resp = await axios.post('/parse', { document: doc })
      const data = resp.data

      setStage(3); await sleep(350)
      setStage(4); await sleep(250)
      setResult(data)
      onResult && onResult(data)

      // Auto-create shipment if approved/reviewed
      if (autoCreateShipment && data.decision?.action !== 'ESCALATE') {
        const ex = data.extracted || {}
        await axios.post(`${API}/shipments/`, {
          tracking_number: `NOVA-${Date.now()}`,
          shipper_name: ex.shipper || 'Unknown',
          consignee_name: ex.consignee || 'Unknown',
          origin_port: ex.port_of_loading || 'Unknown',
          destination_port: ex.port_of_discharge || 'Unknown',
          cargo_description: ex.cargo || 'Unspecified',
          hs_code: ex.hs_code || '',
          gross_weight_kg: parseFloat(ex.gross_weight_kg) || 0,
          total_value_usd: parseFloat(ex.total_value_usd) || 0,
          incoterms: ex.incoterms || '',
          status: data.decision?.action === 'APPROVE' ? 'active' : 'pending',
        }).catch(() => null)
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  const ac = STATUS_COLORS[result?.decision?.action] || STATUS_COLORS.REVIEW

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>Agent Engine</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Parse · Extract · Risk score · Decide</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: C.text3 }}>Auto-create shipment</span>
          <div
            onClick={() => setAutoCreateShipment(v => !v)}
            style={{
              width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
              background: autoCreateShipment ? C.teal : C.border2,
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 7, background: '#fff',
              position: 'absolute', top: 3, left: autoCreateShipment ? 18 : 3,
              transition: 'left 0.2s',
            }} />
          </div>
        </div>
      </div>

      {/* Sample Buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries({ bl: 'Bill of Lading', invoice: 'Commercial Invoice', risky: '⚠ High Risk', customs: 'Customs Form' }).map(([k, label]) => (
          <Pill key={k} onClick={() => setDoc(SAMPLES[k])} active={doc === SAMPLES[k]}>{label}</Pill>
        ))}
      </div>

      {/* Document Input */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: C.bg2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionTitle style={{ margin: 0 }}>Shipment Document</SectionTitle>
          <Badge label="RAW TEXT" small />
        </div>
        <textarea
          value={doc}
          onChange={e => setDoc(e.target.value)}
          style={{
            width: '100%', height: 200, background: 'transparent',
            border: 'none', color: C.text, fontSize: 12, lineHeight: 1.7,
            padding: '14px 16px', resize: 'vertical', outline: 'none',
            fontFamily: 'monospace', boxSizing: 'border-box',
          }}
          placeholder={`Paste Bill of Lading, Commercial Invoice, Customs Declaration...\n\nOr use a sample above ↑`}
        />
      </Card>

      {/* Pipeline Stages */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {AGENT_STAGES.map((s, i) => {
          const active = loading && stage === s.id
          const done = (!loading && result) || (loading && stage > s.id)
          return (
            <React.Fragment key={s.id}>
              <div style={{
                flex: 1, padding: '12px 6px', textAlign: 'center',
                border: `1px solid ${active ? C.teal : done ? C.teal + '55' : C.border}`,
                borderRadius: 10, background: active ? C.teal + '15' : done ? C.teal + '08' : C.bg1,
                boxShadow: active ? `0 0 16px ${C.teal}25` : 'none',
                transition: 'all 0.3s',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: (active || done) ? C.teal : C.text3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</div>
                <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>{s.desc}</div>
              </div>
              {i < AGENT_STAGES.length - 1 && (
                <div style={{ width: 20, height: 2, background: done ? C.teal : C.border, flexShrink: 0, margin: '0 3px', transition: 'background 0.4s', borderRadius: 1 }} />
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Run Button */}
      <button
        onClick={runAgent}
        disabled={loading || !doc.trim()}
        style={{
          width: '100%', padding: '13px',
          background: loading || !doc.trim() ? C.bg2 : `linear-gradient(135deg, ${C.teal}, ${C.green})`,
          border: loading || !doc.trim() ? `1px solid ${C.border}` : 'none',
          borderRadius: 10, color: loading || !doc.trim() ? C.text3 : '#000',
          fontSize: 14, fontWeight: 700, cursor: loading || !doc.trim() ? 'not-allowed' : 'pointer',
          letterSpacing: '-0.01em', transition: 'all 0.2s',
        }}
      >
        {loading ? `Processing stage ${stage}/4...` : '▶  Run Nova Agent'}
      </button>

      {error && (
        <div style={{ padding: '12px 16px', background: C.red + '15', border: `1px solid ${C.red}44`, borderRadius: 8, fontSize: 13, color: '#f87171' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Result */}
      {result && <AgentResult data={result} />}
    </div>
  )
}

function AgentResult({ data }) {
  const ex = data.extracted || {}
  const dec = data.decision || {}
  const flags = data.risk_flags || []
  const action = dec.action || 'REVIEW'
  const ac = STATUS_COLORS[action] || STATUS_COLORS.REVIEW

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Decision Banner */}
      <div style={{ padding: '1.25rem 1.5rem', borderRadius: 12, background: ac.bg, border: `1px solid ${ac.border}` }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: ac.text, letterSpacing: '-0.02em', marginBottom: 8 }}>
          {action === 'ESCALATE' ? '⚠  ESCALATE' : action === 'APPROVE' ? '✓  APPROVE' : action === 'HOLD' ? '⏸  HOLD' : '◉  REVIEW'}
        </div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.7 }}>{dec.reason}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {(dec.next_steps || []).map((s, i) => (
            <span key={i} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)`, color: C.text3 }}>{s}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid rgba(255,255,255,0.06)` }}>
          <span style={{ fontSize: 11, color: C.text3 }}>Confidence</span>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${dec.confidence || 80}%`, height: '100%', background: ac.border, borderRadius: 2, transition: 'width 0.8s ease' }} />
          </div>
          <span style={{ fontSize: 12, color: C.text, fontFamily: 'monospace' }}>{dec.confidence || 80}%</span>
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Extracted Fields */}
        <Card>
          <SectionTitle>Extracted Fields</SectionTitle>
          {[
            ['Document Type', ex.document_type],
            ['Shipper', ex.shipper],
            ['Consignee', ex.consignee],
            ['Port of Loading', ex.port_of_loading],
            ['Port of Discharge', ex.port_of_discharge],
            ['ETA', ex.eta],
            ['Incoterms', ex.incoterms],
            ['HS Code', ex.hs_code],
            ['Gross Weight', ex.gross_weight_kg ? `${ex.gross_weight_kg} kg` : null],
            ['Total Value', ex.total_value_usd ? `USD ${fmt(ex.total_value_usd)}` : null],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: `1px solid ${C.bg2}`, gap: 8 }}>
              <span style={{ fontSize: 12, color: C.text3, flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'right', color: (v && v !== 'Unknown' && v !== 'Not declared') ? C.text : C.text3, wordBreak: 'break-word' }}>{v || '—'}</span>
            </div>
          ))}
          {ex.missing_fields?.length > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: C.amber + '15', borderRadius: 6, border: `1px solid ${C.amber}33` }}>
              <div style={{ fontSize: 11, color: C.amber, marginBottom: 4, fontWeight: 600 }}>Missing Fields</div>
              <div style={{ fontSize: 12, color: C.amber }}>{ex.missing_fields.join(', ')}</div>
            </div>
          )}
        </Card>

        {/* Risk Flags */}
        <Card>
          <SectionTitle>Risk Assessment</SectionTitle>
          {flags.length === 0 ? (
            <div style={{ fontSize: 13, color: C.green }}>✓ No risk flags identified</div>
          ) : flags.map((f, i) => {
            const fc = { HIGH: C.red, MEDIUM: C.amber, LOW: C.green }[f.level] || C.text3
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderBottom: `1px solid ${C.bg2}` }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: fc, flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: fc, marginBottom: 2 }}>[{f.level}] {f.flag}</div>
                  <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>{f.detail}</div>
                </div>
              </div>
            )
          })}
        </Card>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── SHIPMENTS ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function ShipmentsPanel() {
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ tracking_number: '', shipper_name: '', consignee_name: '', origin_port: '', destination_port: '', cargo_description: '', status: 'pending' })
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchShipments() }, [])

  async function fetchShipments() {
    setLoading(true)
    try {
      const r = await axios.get(`${API}/shipments/`)
      setShipments(r.data?.shipments || r.data || [])
    } catch { setShipments([]) }
    finally { setLoading(false) }
  }

  async function createShipment() {
    setCreating(true)
    try {
      await axios.post(`${API}/shipments/`, form)
      setShowCreate(false)
      setForm({ tracking_number: '', shipper_name: '', consignee_name: '', origin_port: '', destination_port: '', cargo_description: '', status: 'pending' })
      await fetchShipments()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setCreating(false) }
  }

  async function deleteShipment(id) {
    if (!confirm('Delete this shipment?')) return
    try { await axios.delete(`${API}/shipments/${id}`); await fetchShipments() } catch {}
  }

  const statuses = ['all', 'pending', 'active', 'completed', 'cancelled']
  const filtered = filter === 'all' ? shipments : shipments.filter(s => s.status === filter)
  const statusColor = { pending: C.amber, active: C.teal, completed: C.green, cancelled: C.red }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>Shipments</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{shipments.length} total records</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchShipments} style={{ ...btnStyle(C.border), color: C.text2 }}>↻ Refresh</button>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal }}>+ New Shipment</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <Stat label="Total" value={shipments.length} />
        <Stat label="Active" value={shipments.filter(s => s.status === 'active').length} color={C.teal} />
        <Stat label="Pending" value={shipments.filter(s => s.status === 'pending').length} color={C.amber} />
        <Stat label="Completed" value={shipments.filter(s => s.status === 'completed').length} color={C.green} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6 }}>
        {statuses.map(s => <Pill key={s} active={filter === s} onClick={() => setFilter(s)}>{s === 'all' ? 'All' : s}</Pill>)}
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <SectionTitle>New Shipment</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['tracking_number','Tracking Number'],['shipper_name','Shipper'],['consignee_name','Consignee'],['origin_port','Origin Port'],['destination_port','Destination Port'],['cargo_description','Cargo Description']].map(([k, label]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{label}</div>
                <input
                  value={form[k]} onChange={e => setForm(p => ({...p,[k]:e.target.value}))}
                  style={{ width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={createShipment} disabled={creating} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal }}>{creating ? 'Creating...' : 'Create'}</button>
            <button onClick={() => setShowCreate(false)} style={{ ...btnStyle(C.border), color: C.text2 }}>Cancel</button>
          </div>
        </Card>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>Loading shipments…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>No shipments found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(s => (
            <Card key={s.id} onClick={() => setSelected(selected?.id === s.id ? null : s)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: 'monospace' }}>{s.tracking_number}</span>
                    <Badge label={s.status || 'pending'} color={statusColor[s.status] || C.text3} small />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '4px 16px' }}>
                    {[['Shipper', s.shipper_name],['Consignee', s.consignee_name],['Route', `${s.origin_port || '?'} → ${s.destination_port || '?'}`],['Cargo', s.cargo_description],['Weight', s.gross_weight_kg ? `${s.gross_weight_kg} kg` : '—'],['Value', s.total_value_usd ? `$${fmt(s.total_value_usd)}` : '—']].map(([k,v]) => (
                      <div key={k}>
                        <span style={{ fontSize: 11, color: C.text3 }}>{k}: </span>
                        <span style={{ fontSize: 11, color: C.text2 }}>{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteShipment(s.id) }} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
              </div>
              {selected?.id === s.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <pre style={{ fontSize: 11, color: C.text2, background: C.bg2, padding: 12, borderRadius: 8, overflow: 'auto' }}>{JSON.stringify(s, null, 2)}</pre>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── WORKFLOWS ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function WorkflowsPanel() {
  const [workflows, setWorkflows] = useState([])
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('definitions')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', trigger_type: 'manual' })
  const [creating, setCreating] = useState(false)
  const [executing, setExecuting] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [wf, inst] = await Promise.all([
        axios.get(`${API}/workflows/`).catch(() => ({ data: [] })),
        axios.get(`${API}/workflows/instances/`).catch(() => ({ data: [] })),
      ])
      setWorkflows(wf.data?.workflows || wf.data || [])
      setInstances(inst.data?.instances || inst.data || [])
    } finally { setLoading(false) }
  }

  async function createWorkflow() {
    setCreating(true)
    try {
      await axios.post(`${API}/workflows/`, {
        ...form,
        nodes: [
          { id: 'start', type: 'start', label: 'Start', position: { x: 100, y: 100 } },
          { id: 'review', type: 'review', label: 'Document Review', position: { x: 300, y: 100 } },
          { id: 'approve', type: 'approval', label: 'Approval', position: { x: 500, y: 100 } },
          { id: 'end', type: 'end', label: 'Complete', position: { x: 700, y: 100 } },
        ],
        edges: [
          { source: 'start', target: 'review' },
          { source: 'review', target: 'approve' },
          { source: 'approve', target: 'end' },
        ],
      })
      setShowCreate(false)
      await fetchAll()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setCreating(false) }
  }

  async function executeWorkflow(wfId) {
    setExecuting(wfId)
    try {
      await axios.post(`${API}/workflows/${wfId}/execute`, { context: { source: 'nova-agent' } })
      await fetchAll()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setExecuting(null) }
  }

  async function approveNode(instanceId) {
    try {
      await axios.post(`${API}/workflows/instances/${instanceId}/approve`, { comment: 'Approved via Nova' })
      await fetchAll()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
  }

  const statusC = { active: C.green, inactive: C.text3, running: C.teal, pending: C.amber, completed: C.green, failed: C.red }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>Workflow Orchestrator</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Configurable multi-step approval chains</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchAll} style={{ ...btnStyle(C.border), color: C.text2 }}>↻ Refresh</button>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal }}>+ Create Workflow</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        <Stat label="Workflows" value={workflows.length} />
        <Stat label="Active" value={workflows.filter(w => w.is_active).length} color={C.green} />
        <Stat label="Instances" value={instances.length} color={C.teal} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
        {[['definitions','Workflow Definitions'],['instances','Instances & Approvals']].map(([t,label]) => (
          <Pill key={t} active={tab === t} onClick={() => setTab(t)}>{label}</Pill>
        ))}
      </div>

      {showCreate && tab === 'definitions' && (
        <Card>
          <SectionTitle>New Workflow</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['name','Name'],['description','Description']].map(([k,label]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{label}</div>
                <input value={form[k]} onChange={e => setForm(p => ({...p,[k]:e.target.value}))} style={{ width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Trigger Type</div>
            <select value={form.trigger_type} onChange={e => setForm(p => ({...p,trigger_type:e.target.value}))} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none' }}>
              <option value="manual">Manual</option>
              <option value="document_upload">Document Upload</option>
              <option value="shipment_created">Shipment Created</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: C.text3, marginTop: 12, padding: '8px 12px', background: C.bg2, borderRadius: 8 }}>
            ℹ Default 4-node pipeline: Start → Document Review → Approval → Complete
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={createWorkflow} disabled={creating} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal }}>{creating ? 'Creating...' : 'Create'}</button>
            <button onClick={() => setShowCreate(false)} style={{ ...btnStyle(C.border), color: C.text2 }}>Cancel</button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>Loading…</div>
      ) : tab === 'definitions' ? (
        workflows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>No workflows yet. Create one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workflows.map(w => (
              <Card key={w.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{w.name}</span>
                      <Badge label={w.is_active ? 'active' : 'inactive'} color={w.is_active ? C.green : C.text3} small />
                    </div>
                    <div style={{ fontSize: 12, color: C.text3 }}>{w.description || 'No description'} · Trigger: {w.trigger_type || 'manual'}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => executeWorkflow(w.id)} disabled={executing === w.id} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal, fontSize: 11 }}>{executing === w.id ? 'Running...' : '▶ Execute'}</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : (
        instances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>No instances yet. Execute a workflow.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {instances.map(inst => (
              <Card key={inst.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: C.text2, fontFamily: 'monospace' }}>#{String(inst.id).slice(0,8)}</span>
                      <Badge label={inst.status || 'pending'} color={statusC[inst.status] || C.text3} small />
                    </div>
                    <div style={{ fontSize: 12, color: C.text3 }}>Current node: {inst.current_node || '—'}</div>
                  </div>
                  {inst.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => approveNode(inst.id)} style={{ ...btnStyle(C.green), background: C.green + '22', color: C.green, fontSize: 11 }}>✓ Approve</button>
                      <button onClick={async () => {
                        try { await axios.post(`${API}/workflows/instances/${inst.id}/reject`, { comment: 'Rejected' }); fetchAll() } catch {}
                      }} style={{ ...btnStyle(C.red), background: C.red + '22', color: C.red, fontSize: 11 }}>✕ Reject</button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── DOCUMENTS ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function DocumentsPanel() {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [validating, setValidating] = useState(null)

  useEffect(() => { fetchDocs() }, [])

  async function fetchDocs() {
    setLoading(true)
    try {
      const r = await axios.get(`${API}/documents/`)
      setDocs(r.data?.documents || r.data || [])
    } catch { setDocs([]) }
    finally { setLoading(false) }
  }

  async function uploadFile(file) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('document_type', 'bill_of_lading')
      await axios.post(`${API}/documents/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      await fetchDocs()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setUploading(false) }
  }

  async function validateDoc(id) {
    setValidating(id)
    try {
      await axios.post(`${API}/documents/${id}/validate`)
      await fetchDocs()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setValidating(null) }
  }

  async function deleteDoc(id) {
    if (!confirm('Delete document?')) return
    try { await axios.delete(`${API}/documents/${id}`); await fetchDocs() } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>Documents</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>{docs.length} files stored</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchDocs} style={{ ...btnStyle(C.border), color: C.text2 }}>↻ Refresh</button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal }}>
            {uploading ? 'Uploading...' : '↑ Upload'}
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && uploadFile(e.target.files[0])} />

      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && uploadFile(e.dataTransfer.files[0]) }}
        style={{ border: `2px dashed ${C.border2}`, borderRadius: 12, padding: '32px', textAlign: 'center', cursor: 'pointer', color: C.text3 }}
        onClick={() => fileRef.current?.click()}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>◧</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Drop files here or click to upload</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>PDF, DOCX, XML, JSON supported</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>Loading documents…</div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>No documents yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(d => (
            <Card key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.filename || d.name || `Document #${d.id}`}</span>
                    <Badge label={d.document_type || 'unknown'} color={C.blue} small />
                    {d.is_validated && <Badge label="validated" color={C.green} small />}
                  </div>
                  <div style={{ fontSize: 12, color: C.text3 }}>
                    {d.file_size ? `${Math.round(d.file_size / 1024)} KB · ` : ''}{new Date(d.created_at || Date.now()).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!d.is_validated && (
                    <button onClick={() => validateDoc(d.id)} disabled={validating === d.id} style={{ ...btnStyle(C.blue), background: C.blue + '22', color: C.blue, fontSize: 11 }}>{validating === d.id ? 'Validating...' : '✓ Validate'}</button>
                  )}
                  <button onClick={() => window.open(`${API}/documents/${d.id}/download`)} style={{ ...btnStyle(C.border), color: C.text2, fontSize: 11 }}>↓ Download</button>
                  <button onClick={() => deleteDoc(d.id)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── AGENTS ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function AgentsPanel() {
  const [agents, setAgents] = useState([])
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', agent_type: 'document_extraction', description: '' })
  const [creating, setCreating] = useState(false)
  const [running, setRunning] = useState(null)
  const [runInput, setRunInput] = useState('')
  const [runResult, setRunResult] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [a, t] = await Promise.all([
        axios.get(`${API}/agents/`).catch(() => ({ data: [] })),
        axios.get(`${API}/agents/types`).catch(() => ({ data: [] })),
      ])
      setAgents(a.data?.agents || a.data || [])
      setTypes(t.data?.types || t.data || ['document_extraction','risk_assessment','analytics','monitoring','recommendation'])
    } finally { setLoading(false) }
  }

  async function createAgent() {
    setCreating(true)
    try {
      await axios.post(`${API}/agents/`, { ...form, config: { model: MODEL, temperature: 0.1 } })
      setShowCreate(false)
      await fetchAll()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setCreating(false) }
  }

  async function runAgent(id) {
    setRunning(id); setRunResult(null)
    try {
      const r = await axios.post(`${API}/agents/${id}/run`, { input: runInput || 'Analyze latest shipments for risk patterns', context: {} })
      setRunResult(r.data)
    } catch (e) { setRunResult({ error: e.response?.data?.detail || e.message }) }
    finally { setRunning(null) }
  }

  const typeColor = { document_extraction: C.blue, risk_assessment: C.red, analytics: C.purple, monitoring: C.amber, recommendation: C.teal }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>Agents Orchestrator</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>AI agents for extraction · risk · analytics · monitoring</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchAll} style={{ ...btnStyle(C.border), color: C.text2 }}>↻ Refresh</button>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal }}>+ Register Agent</button>
        </div>
      </div>

      {showCreate && (
        <Card>
          <SectionTitle>Register Agent</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['name','Agent Name'],['description','Description']].map(([k,l]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{l}</div>
                <input value={form[k]} onChange={e => setForm(p => ({...p,[k]:e.target.value}))} style={{ width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>Agent Type</div>
            <select value={form.agent_type} onChange={e => setForm(p => ({...p,agent_type:e.target.value}))} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none' }}>
              {(Array.isArray(types) ? types : Object.keys(types)).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={createAgent} disabled={creating} style={{ ...btnStyle(C.teal), background: C.teal + '22', color: C.teal }}>{creating ? 'Creating...' : 'Register'}</button>
            <button onClick={() => setShowCreate(false)} style={{ ...btnStyle(C.border), color: C.text2 }}>Cancel</button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>Loading agents…</div>
      ) : agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>No agents registered yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map(a => (
            <Card key={a.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{a.name}</span>
                    <Badge label={a.agent_type} color={typeColor[a.agent_type] || C.teal} small />
                  </div>
                  <div style={{ fontSize: 12, color: C.text3 }}>{a.description || 'No description'}</div>
                  <div style={{ marginTop: 8 }}>
                    <input
                      placeholder="Optional: run input / context..."
                      value={runInput}
                      onChange={e => setRunInput(e.target.value)}
                      style={{ width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <button onClick={() => runAgent(a.id)} disabled={running === a.id} style={{ ...btnStyle(C.purple), background: C.purple + '22', color: C.purple, fontSize: 11, marginLeft: 12, flexShrink: 0 }}>
                  {running === a.id ? '⟳ Running...' : '▶ Run'}
                </button>
              </div>
              {runResult && running !== a.id && (
                <div style={{ marginTop: 10 }}>
                  <pre style={{ fontSize: 11, color: C.text2, background: C.bg2, padding: 10, borderRadius: 8, overflow: 'auto', maxHeight: 200 }}>{JSON.stringify(runResult, null, 2)}</pre>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── INCIDENTS ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function IncidentsPanel() {
  const [incidents, setIncidents] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium', incident_type: 'delay' })
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [inc, st] = await Promise.all([
        axios.get(`${API}/incidents/`).catch(() => ({ data: [] })),
        axios.get(`${API}/incidents/stats/summary`).catch(() => ({ data: null })),
      ])
      setIncidents(inc.data?.incidents || inc.data || [])
      setStats(st.data)
    } finally { setLoading(false) }
  }

  async function createIncident() {
    setCreating(true)
    try {
      await axios.post(`${API}/incidents/`, form)
      setShowCreate(false)
      await fetchAll()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
    finally { setCreating(false) }
  }

  async function resolveIncident(id) {
    try {
      await axios.post(`${API}/incidents/${id}/resolve`, { resolution_note: 'Resolved via Nova' })
      await fetchAll()
    } catch (e) { alert(e.response?.data?.detail || e.message) }
  }

  const sevColor = { low: C.green, medium: C.amber, high: C.red, critical: '#ff00aa' }
  const typeColor = { delay: C.amber, compliance: C.red, documentation: C.blue, customs: C.purple, other: C.text3 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>Incidents</div>
          <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Exception management & escalation tracking</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchAll} style={{ ...btnStyle(C.border), color: C.text2 }}>↻ Refresh</button>
          <button onClick={() => setShowCreate(true)} style={{ ...btnStyle(C.red), background: C.red + '22', color: C.red }}>+ Report Incident</button>
        </div>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          <Stat label="Total" value={stats.total || 0} />
          <Stat label="Open" value={stats.open || 0} color={C.red} />
          <Stat label="Resolved" value={stats.resolved || 0} color={C.green} />
          <Stat label="Avg Resolution" value={stats.avg_resolution_hours ? `${Math.round(stats.avg_resolution_hours)}h` : '—'} color={C.teal} />
        </div>
      )}

      {showCreate && (
        <Card>
          <SectionTitle>Report Incident</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['title','Title'],['description','Description']].map(([k,l]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{l}</div>
                <input value={form[k]} onChange={e => setForm(p => ({...p,[k]:e.target.value}))} style={{ width: '100%', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
            {[['severity',['low','medium','high','critical']],['incident_type',['delay','compliance','documentation','customs','other']]].map(([k,opts]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: C.text3, marginBottom: 4 }}>{k}</div>
                <select value={form[k]} onChange={e => setForm(p => ({...p,[k]:e.target.value}))} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', width: '100%' }}>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={createIncident} disabled={creating} style={{ ...btnStyle(C.red), background: C.red + '22', color: C.red }}>{creating ? 'Reporting...' : 'Report'}</button>
            <button onClick={() => setShowCreate(false)} style={{ ...btnStyle(C.border), color: C.text2 }}>Cancel</button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>Loading incidents…</div>
      ) : incidents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.text3 }}>No incidents found. 🎉</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {incidents.map(inc => (
            <Card key={inc.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{inc.title}</span>
                    <Badge label={inc.severity} color={sevColor[inc.severity] || C.amber} small />
                    <Badge label={inc.incident_type || 'other'} color={typeColor[inc.incident_type] || C.text3} small />
                    <Badge label={inc.status || 'open'} color={inc.status === 'resolved' ? C.green : C.red} small />
                  </div>
                  <div style={{ fontSize: 12, color: C.text3 }}>{inc.description}</div>
                </div>
                {inc.status !== 'resolved' && (
                  <button onClick={() => resolveIncident(inc.id)} style={{ ...btnStyle(C.green), background: C.green + '22', color: C.green, fontSize: 11, marginLeft: 12 }}>✓ Resolve</button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── DASHBOARD ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardPanel({ onNavigate }) {
  const [data, setData] = useState({ shipments: [], incidents: [], workflows: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [s, inc, wf] = await Promise.all([
        axios.get(`${API}/shipments/`).catch(() => ({ data: [] })),
        axios.get(`${API}/incidents/`).catch(() => ({ data: [] })),
        axios.get(`${API}/workflows/`).catch(() => ({ data: [] })),
      ])
      setData({
        shipments: s.data?.shipments || s.data || [],
        incidents: inc.data?.incidents || inc.data || [],
        workflows: wf.data?.workflows || wf.data || [],
      })
      setLoading(false)
    }
    load()
  }, [])

  const s = data.shipments
  const inc = data.incidents
  const wf = data.workflows

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, letterSpacing: '-0.03em' }}>Nova Command Center</div>
        <div style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>Enterprise logistics intelligence · {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        <Stat label="Shipments" value={loading ? '…' : s.length} sub={`${s.filter(x => x.status === 'active').length} active`} />
        <Stat label="Open Incidents" value={loading ? '…' : inc.filter(i => i.status !== 'resolved').length} color={inc.filter(i => i.severity === 'high' && i.status !== 'resolved').length > 0 ? C.red : C.amber} sub={`${inc.filter(i => i.severity === 'high').length} high severity`} />
        <Stat label="Workflows" value={loading ? '…' : wf.length} color={C.teal} sub={`${wf.filter(w => w.is_active).length} active`} />
        <Stat label="Pending Review" value={loading ? '…' : s.filter(x => x.status === 'pending').length} color={C.purple} sub="awaiting decision" />
      </div>

      {/* Quick Actions */}
      <Card>
        <SectionTitle>Quick Actions</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: '▶  Run Agent', desc: 'Parse & risk-score a document', nav: 'agent', color: C.teal },
            { label: '⬡  New Shipment', desc: 'Manually create a shipment', nav: 'shipments', color: C.blue },
            { label: '△  Report Incident', desc: 'Log an operational exception', nav: 'incidents', color: C.red },
          ].map(item => (
            <div
              key={item.nav}
              onClick={() => onNavigate(item.nav)}
              style={{ padding: '16px', borderRadius: 10, border: `1px solid ${item.color}33`, background: item.color + '10', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.label}</div>
              <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recent Shipments */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionTitle>Recent Shipments</SectionTitle>
          <button onClick={() => onNavigate('shipments')} style={{ background: 'none', border: 'none', color: C.teal, fontSize: 12, cursor: 'pointer' }}>View all →</button>
        </div>
        {loading ? <div style={{ color: C.text3, fontSize: 13 }}>Loading…</div> : s.slice(0, 5).length === 0 ? (
          <div style={{ color: C.text3, fontSize: 13 }}>No shipments yet — run the agent to create one.</div>
        ) : s.slice(0, 5).map(ship => (
          <div key={ship.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.bg2}` }}>
            <div>
              <span style={{ fontSize: 12, fontFamily: 'monospace', color: C.text2 }}>{ship.tracking_number}</span>
              <span style={{ fontSize: 12, color: C.text3, marginLeft: 8 }}>{ship.origin_port} → {ship.destination_port}</span>
            </div>
            <Badge label={ship.status || 'pending'} color={{ pending: C.amber, active: C.teal, completed: C.green, cancelled: C.red }[ship.status] || C.text3} small />
          </div>
        ))}
      </Card>

      {/* Recent Incidents */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <SectionTitle>Open Incidents</SectionTitle>
          <button onClick={() => onNavigate('incidents')} style={{ background: 'none', border: 'none', color: C.teal, fontSize: 12, cursor: 'pointer' }}>View all →</button>
        </div>
        {loading ? <div style={{ color: C.text3, fontSize: 13 }}>Loading…</div> : inc.filter(i => i.status !== 'resolved').slice(0, 5).length === 0 ? (
          <div style={{ color: C.green, fontSize: 13 }}>✓ No open incidents</div>
        ) : inc.filter(i => i.status !== 'resolved').slice(0, 5).map(i => (
          <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.bg2}` }}>
            <span style={{ fontSize: 12, color: C.text2 }}>{i.title}</span>
            <Badge label={i.severity} color={{ low: C.green, medium: C.amber, high: C.red, critical: '#ff00aa' }[i.severity] || C.amber} small />
          </div>
        ))}
      </Card>
    </div>
  )
}

// ── Shared button style helper ────────────────────────────────────────────────
function btnStyle(borderColor) {
  return {
    padding: '7px 14px', borderRadius: 8,
    border: `1px solid ${borderColor}`,
    background: 'transparent', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── ROOT APP ──────────────────────────────────════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [page, setPage] = useState('dashboard')
  const [lastAgentResult, setLastAgentResult] = useState(null)

  const panels = {
    dashboard: <DashboardPanel onNavigate={setPage} />,
    agent:     <AgentPanel onResult={setLastAgentResult} />,
    shipments: <ShipmentsPanel />,
    workflows: <WorkflowsPanel />,
    documents: <DocumentsPanel />,
    agents:    <AgentsPanel />,
    incidents: <IncidentsPanel />,
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* Sidebar */}
      <div style={{
        width: 220, flexShrink: 0,
        background: C.bg1, borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: `linear-gradient(135deg, ${C.teal}, ${C.green})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, color: '#000',
            }}>N</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: '-0.03em' }}>Nova</div>
              <div style={{ fontSize: 10, color: C.text3 }}>Logistics Intelligence</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8, border: 'none',
                background: page === item.id ? C.teal + '18' : 'transparent',
                color: page === item.id ? C.teal : C.text3,
                fontSize: 13, fontWeight: page === item.id ? 600 : 400,
                cursor: 'pointer', textAlign: 'left', width: '100%',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* Model badge */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
            <span style={{ fontSize: 10, color: C.text3, fontFamily: 'monospace' }}>llama-3.1-70b · NVIDIA</span>
          </div>
          <div style={{ fontSize: 10, color: C.text3, marginTop: 2 }}>Nova v2.0 · Enterprise</div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 2rem' }}>
          {panels[page]}
        </div>
      </div>

    </div>
  )
}