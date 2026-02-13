import React, { useEffect, useState } from 'react'
import { NewHeader } from '../components/NewHeader'
import api from '../services/api'
import { getCurrentRole } from '../services/data'

interface Org { id: number; name: string }
interface Member { id: number; role: string; user_id: number; username?: string; email?: string }
interface AuditItem { timestamp: string; event: string; user?: number; details?: Record<string, unknown> }

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

  useEffect(() => { loadOrgs(); loadAudit() }, [])
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
        </>
        )}
      </div>
    </div>
  )
}