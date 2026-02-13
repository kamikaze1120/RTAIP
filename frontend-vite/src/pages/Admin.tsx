import React, { useEffect, useState } from 'react'
import { NewHeader } from '../components/NewHeader'
import api from '../services/api'
import { getCurrentRole } from '../services/data'

interface Org { id: number; name: string }
interface Member { id: number; role: string; user_id: number; username?: string; email?: string }
interface AuditItem { timestamp: string; event: string; user?: number; details?: Record<string, unknown> }
interface Citation { id: number; source?: string; timestamp?: string; latitude?: number; longitude?: number; snippet?: string; confidence?: number }
interface PromptSummary { id: number; ts: string; user_id?: number; query: string; confidence: number; insufficient: boolean; citations_count: number }
interface PromptDetail { id: number; ts: string; user_id?: number; query: string; answer: string; confidence: number; insufficient: boolean; citations: Citation[]; provider?: string; model?: string }
interface AlertRuleOut { id: number; name: string; org_id?: number; source?: string; severity_threshold?: number; min_confidence?: number; min_lat?: number; min_lon?: number; max_lat?: number; max_lon?: number; geofence_center_lat?: number; geofence_center_lon?: number; geofence_radius_m?: number; keywords?: string; email_to?: string; sms_to?: string; webhook_url?: string; priority: number; enabled: boolean; dedup_window_s: number }
interface AlertHistoryOut { id: number; ts: string; rule_id: number; org_id?: number; event_id?: number; priority: number; message: string; delivered_email: number; delivered_sms: number; delivered_webhook: number; status: string }

export default function AdminPage() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [name, setName] = useState('')
  const [selectedOrg, setSelectedOrg] = useState<number | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [inviteToken, setInviteToken] = useState('')
  const [acceptToken, setAcceptToken] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [ipCidr, setIpCidr] = useState('')
  const [ipLabel, setIpLabel] = useState('')
  const [audit, setAudit] = useState<AuditItem[]>([])
  const [prompts, setPrompts] = useState<PromptSummary[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<PromptDetail | null>(null)
  const [promptUserFilter, setPromptUserFilter] = useState<string>('')
  const [rules, setRules] = useState<AlertRuleOut[]>([])
  const [alerts, setAlerts] = useState<AlertHistoryOut[]>([])
  const [ruleForm, setRuleForm] = useState<{ name: string; source: string; severity_threshold: number; min_confidence: number; keywords: string; org_id?: number; email_to?: string; sms_to?: string; webhook_url?: string; priority: number; enabled: boolean; geofence_center_lat?: number; geofence_center_lon?: number; geofence_radius_m?: number; min_lat?: number; min_lon?: number; max_lat?: number; max_lon?: number; dedup_window_s: number }>({ name: '', source: '', severity_threshold: 5, min_confidence: 0.5, keywords: '', org_id: undefined, email_to: '', sms_to: '', webhook_url: '', priority: 3, enabled: true, geofence_center_lat: undefined, geofence_center_lon: undefined, geofence_radius_m: undefined, min_lat: undefined, min_lon: undefined, max_lat: undefined, dedup_window_s: 600 })
  const [roleOk, setRoleOk] = useState<boolean>(true)

  const loadOrgs = async () => {
    const r = await api.get('/orgs')
    setOrgs(r.data || [])
  }

  const createOrg = async () => {
    const r = await api.post('/orgs', { name })
    setName('')
    setSelectedOrg(r.data?.id || null)
    loadOrgs()
  }

  const invite = async () => {
    if (!selectedOrg) return
    const r = await api.post(`/orgs/${selectedOrg}/invite`, { email: inviteEmail, role: inviteRole })
    setInviteToken(r.data?.token || '')
  }

  const loadMembers = async () => {
    if (!selectedOrg) { setMembers([]); return }
    const r = await api.get(`/orgs/${selectedOrg}/members`)
    setMembers(r.data || [])
  }

  const acceptInvite = async () => {
    const uid = Number(window.localStorage.getItem('backendUserId') || '0')
    await api.post('/invites/accept', { token: acceptToken, user_id: uid })
    loadMembers()
  }

  const addIp = async () => {
    if (!selectedOrg) return
    await api.post('/ip-allowlists', { org_id: selectedOrg, cidr: ipCidr, label: ipLabel, active: true })
    setIpCidr('')
    setIpLabel('')
  }

  const loadAudit = async () => {
    const r = await api.get('/audit')
    setAudit(r.data || [])
  }

  const loadPrompts = async () => {
    const qs = promptUserFilter.trim() ? `?user_id=${encodeURIComponent(promptUserFilter.trim())}` : ''
    const r = await api.get(`/prompts${qs}`)
    setPrompts((r.data || []) as PromptSummary[])
  }
  const loadPromptDetail = async (id: number) => {
    const r = await api.get(`/prompts/${id}`)
    setSelectedPrompt((r.data || null) as PromptDetail)
  }
  const loadRules = async () => {
    const orgStr = typeof window !== 'undefined' ? window.localStorage.getItem('currentOrgId') : null
    const oid = orgStr ? Number(orgStr) : undefined
    const qs = oid ? `?org_id=${oid}` : ''
    const r = await api.get(`/alert-rules${qs}`)
    setRules((r.data || []) as AlertRuleOut[])
  }
  const createRule = async () => {
    const body = { ...ruleForm, org_id: ruleForm.org_id || (typeof window !== 'undefined' ? Number(window.localStorage.getItem('currentOrgId')||'0')||undefined : undefined) }
    await api.post('/alert-rules', body)
    setRuleForm({ name: '', source: '', severity_threshold: 5, min_confidence: 0.5, keywords: '', org_id: undefined, email_to: '', sms_to: '', webhook_url: '', priority: 3, enabled: true, geofence_center_lat: undefined, geofence_center_lon: undefined, geofence_radius_m: undefined, min_lat: undefined, min_lon: undefined, max_lat: undefined, dedup_window_s: 600 })
    loadRules()
  }
  const deleteRule = async (id: number) => { await api.delete(`/alert-rules/${id}`); loadRules() }
  const toggleRule = async (id: number, enabled: boolean) => { await api.put(`/alert-rules/${id}`, { enabled: !enabled, name: rules.find(r=>r.id===id)?.name || '' }); loadRules() }
  const loadAlerts = async () => {
    const orgStr = typeof window !== 'undefined' ? window.localStorage.getItem('currentOrgId') : null
    const oid = orgStr ? Number(orgStr) : undefined
    const qs = oid ? `?org_id=${oid}` : ''
    const r = await api.get(`/alerts${qs}`)
    setAlerts((r.data || []) as AlertHistoryOut[])
  }
  const simulateAlert = async () => {
    await api.post('/alerts/test', { source: ruleForm.source || 'TEST', latitude: ruleForm.geofence_center_lat || 34.0, longitude: ruleForm.geofence_center_lon || -118.0, confidence: ruleForm.min_confidence || 0.5, data: { headline: 'Test trigger', category: 'simulation' } })
    loadAlerts()
  }

  useEffect(() => { loadOrgs(); loadAudit(); loadPrompts(); loadRules(); loadAlerts() }, [])
  useEffect(() => { loadPrompts() }, [promptUserFilter])
  useEffect(() => { loadMembers() }, [selectedOrg])
  useEffect(() => {
    const orgStr = typeof window !== 'undefined' ? window.localStorage.getItem('currentOrgId') : null
    const oid = orgStr ? Number(orgStr) : null
    if (oid) {
      getCurrentRole(oid).then(r => setRoleOk(r === 'admin'))
    }
  }, [])

  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="p-4 lg:p-6">
        <h1 className="text-3xl font-bold">Admin Console</h1>
        {!roleOk && <div className="mt-2 text-red-300 text-sm">Access restricted</div>}
        {roleOk && (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="font-semibold">Organizations</div>
            <div className="mt-2 flex gap-2">
              <input className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="New org name" value={name} onChange={e=>setName(e.target.value)} />
              <button className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={createOrg}>Create</button>
            </div>
            <div className="mt-3">
            {orgs.map(o => (
                <button key={o.id} className={`px-3 py-1 mr-2 mt-2 rounded ${selectedOrg===o.id?'bg-white/30':'bg-white/10'}`} onClick={()=>{ setSelectedOrg(o.id); try { window.localStorage.setItem('currentOrgId', String(o.id)) } catch {} }}>{o.name}</button>
              ))}
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="font-semibold">Invitations</div>
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} />
            <select className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}>
              <option value="admin">admin</option>
              <option value="analyst">analyst</option>
              <option value="viewer">viewer</option>
            </select>
            <button className="mt-2 px-3 py-2 bg-white/20 rounded" onClick={invite}>Create invite</button>
            {inviteToken && <div className="mt-2 text-xs break-all">Token: {inviteToken}</div>}
            <div className="mt-6 font-semibold">Accept Invite</div>
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Paste token" value={acceptToken} onChange={e=>setAcceptToken(e.target.value)} />
            <button className="mt-2 px-3 py-2 bg-white/20 rounded" onClick={acceptInvite}>Accept</button>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="font-semibold">Members</div>
            <div className="mt-2">
              {members.length===0 && <div className="text-sm text-gray-300">No members</div>}
              {members.map(m => (
                <div key={m.id} className="text-sm mt-1">{m.username||m.email} — {m.role}</div>
              ))}
            </div>
            <div className="mt-4 font-semibold">IP Allowlist</div>
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="CIDR or IP" value={ipCidr} onChange={e=>setIpCidr(e.target.value)} />
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Label" value={ipLabel} onChange={e=>setIpLabel(e.target.value)} />
            <button className="mt-2 px-3 py-2 bg-white/20 rounded" onClick={addIp}>Add</button>
          </div>
        </div>
        <div className="mt-8 bg-white/10 p-4 rounded border border-white/10">
          <div className="font-semibold">Audit Logs</div>
          <button className="mt-2 px-3 py-2 bg-white/20 rounded" onClick={loadAudit}>Refresh</button>
          <div className="mt-2 max-h-64 overflow-y-auto">
            {audit.map((a, i) => (
              <div key={i} className="text-xs mt-1">{a.timestamp} — {a.event} — {JSON.stringify(a.details)}</div>
            ))}
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="font-semibold">Alert Rules</div>
            <div className="grid md:grid-cols-2 gap-2 mt-2">
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Name" value={ruleForm.name} onChange={e=>setRuleForm({...ruleForm, name: e.target.value})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Source (optional)" value={ruleForm.source} onChange={e=>setRuleForm({...ruleForm, source: e.target.value})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Keywords comma-separated" value={ruleForm.keywords} onChange={e=>setRuleForm({...ruleForm, keywords: e.target.value})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Email to" value={ruleForm.email_to} onChange={e=>setRuleForm({...ruleForm, email_to: e.target.value})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="SMS to" value={ruleForm.sms_to} onChange={e=>setRuleForm({...ruleForm, sms_to: e.target.value})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Webhook URL" value={ruleForm.webhook_url} onChange={e=>setRuleForm({...ruleForm, webhook_url: e.target.value})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Min confidence" type="number" step="0.1" value={ruleForm.min_confidence} onChange={e=>setRuleForm({...ruleForm, min_confidence: Number(e.target.value)})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Severity threshold" type="number" value={ruleForm.severity_threshold} onChange={e=>setRuleForm({...ruleForm, severity_threshold: Number(e.target.value)})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Priority (1-4)" type="number" value={ruleForm.priority} onChange={e=>setRuleForm({...ruleForm, priority: Number(e.target.value)})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Dedup window s" type="number" value={ruleForm.dedup_window_s} onChange={e=>setRuleForm({...ruleForm, dedup_window_s: Number(e.target.value)})} />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ruleForm.enabled} onChange={e=>setRuleForm({...ruleForm, enabled: e.target.checked})} /> Enabled</label>
            </div>
            <div className="grid md:grid-cols-3 gap-2 mt-2">
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Fence lat" type="number" value={ruleForm.geofence_center_lat ?? ''} onChange={e=>setRuleForm({...ruleForm, geofence_center_lat: e.target.value ? Number(e.target.value) : undefined})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Fence lon" type="number" value={ruleForm.geofence_center_lon ?? ''} onChange={e=>setRuleForm({...ruleForm, geofence_center_lon: e.target.value ? Number(e.target.value) : undefined})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="Fence radius m" type="number" value={ruleForm.geofence_radius_m ?? ''} onChange={e=>setRuleForm({...ruleForm, geofence_radius_m: e.target.value ? Number(e.target.value) : undefined})} />
            </div>
            <div className="grid md:grid-cols-4 gap-2 mt-2">
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="BBox min lat" type="number" value={ruleForm.min_lat ?? ''} onChange={e=>setRuleForm({...ruleForm, min_lat: e.target.value ? Number(e.target.value) : undefined})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="BBox min lon" type="number" value={ruleForm.min_lon ?? ''} onChange={e=>setRuleForm({...ruleForm, min_lon: e.target.value ? Number(e.target.value) : undefined})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="BBox max lat" type="number" value={ruleForm.max_lat ?? ''} onChange={e=>setRuleForm({...ruleForm, max_lat: e.target.value ? Number(e.target.value) : undefined})} />
              <input className="px-2 py-1 bg-black/20 border border-white/10 rounded" placeholder="BBox max lon" type="number" value={ruleForm.max_lon ?? ''} onChange={e=>setRuleForm({...ruleForm, max_lon: e.target.value ? Number(e.target.value) : undefined})} />
            </div>
            <div className="mt-2 flex gap-2">
              <button className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={createRule}>Create Rule</button>
              <button className="px-3 py-2 bg-white/20 rounded" onClick={simulateAlert}>Simulate</button>
              <button className="px-3 py-2 bg-white/20 rounded" onClick={loadRules}>Refresh</button>
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto">
              {rules.map(r => (
                <div key={r.id} className="text-xs px-3 py-2 rounded bg-white/10 mt-2">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.name} • p{r.priority}</div>
                    <div className="flex items-center gap-2">
                      <button className="px-2 py-1 bg-white/20 rounded" onClick={()=>toggleRule(r.id, r.enabled)}>{r.enabled ? 'Disable' : 'Enable'}</button>
                      <button className="px-2 py-1 bg-white/20 rounded" onClick={()=>deleteRule(r.id)}>Delete</button>
                    </div>
                  </div>
                  <div className="text-gray-400">src {r.source||'any'} • keywords {r.keywords||'—'} • conf≥{r.min_confidence} • sev≥{r.severity_threshold} • dedup {r.dedup_window_s}s</div>
                </div>
              ))}
              {rules.length===0 && (<div className="text-xs text-gray-400">No rules</div>)}
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="font-semibold">Alert History</div>
            <div className="mt-2 flex gap-2"><button className="px-3 py-2 bg-white/20 rounded" onClick={loadAlerts}>Refresh</button></div>
            <div className="mt-3 max-h-72 overflow-y-auto">
              {alerts.map(a => (
                <div key={a.id} className="text-xs px-3 py-2 rounded bg-white/10 mt-2">
                  <div className="font-mono">#{a.id} • rule {a.rule_id} • {a.ts}</div>
                  <div className="text-gray-300">{a.message}</div>
                  <div className="text-gray-400">email {a.delivered_email} • sms {a.delivered_sms} • webhook {a.delivered_webhook} • status {a.status}</div>
                </div>
              ))}
              {alerts.length===0 && (<div className="text-xs text-gray-400">No alerts</div>)}
            </div>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="font-semibold">AI Prompts</div>
            <div className="mt-2 flex gap-2">
              <input className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Filter by user_id" value={promptUserFilter} onChange={e=>setPromptUserFilter(e.target.value)} />
              <button className="px-3 py-2 bg-white/20 rounded" onClick={loadPrompts}>Refresh</button>
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto">
              {prompts.map(p => (
                <button key={p.id} className="block w-full text-left text-xs px-3 py-2 rounded hover:bg-white/10" onClick={()=>loadPromptDetail(p.id)}>
                  <div className="font-mono">#{p.id} • {p.ts}</div>
                  <div className="text-gray-300 truncate">{p.query}</div>
                  <div className="text-gray-400">conf {Math.round((p.confidence||0)*100)}% • citations {p.citations_count} • insufficient {String(p.insufficient)}</div>
                </button>
              ))}
              {prompts.length===0 && (<div className="text-xs text-gray-400">No prompts</div>)}
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded border border-white/10">
            <div className="font-semibold">Prompt Detail</div>
            {!selectedPrompt && <div className="text-xs text-gray-400 mt-2">Select a prompt</div>}
            {selectedPrompt && (
              <div className="text-xs mt-2 space-y-2">
                <div className="font-mono">#{selectedPrompt.id} • {selectedPrompt.ts}</div>
                <div className="text-gray-300">Query: {selectedPrompt.query}</div>
                <div className="text-gray-300">Answer:</div>
                <pre className="bg-black/20 p-2 rounded whitespace-pre-wrap">{selectedPrompt.answer}</pre>
                <div className="text-gray-300">Citations:</div>
                <ul className="space-y-1">
                  {(selectedPrompt.citations||[]).map((c: Citation, i:number) => (
                    <li key={`c-${i}`}>{(c.source||'unknown')} @ {String(c.timestamp||'')} {(c.snippet?('— '+c.snippet):'')}</li>
                  ))}
                </ul>
                <div className="text-gray-400">Confidence {Math.round((selectedPrompt.confidence||0)*100)}% • insufficient {String(selectedPrompt.insufficient)}</div>
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  )
}