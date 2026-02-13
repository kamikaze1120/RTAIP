import React, { useEffect, useState } from 'react'
import { NewHeader } from '../components/NewHeader'
import { getSupabaseClient } from '../utils/supabase'
import api from '../services/api'
import type { SupabaseClient } from '@supabase/supabase-js'

export default function AuthPage() {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgId, setOrgId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [mfaUri, setMfaUri] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [policyMinutes, setPolicyMinutes] = useState(30)
  const [lastActivity, setLastActivity] = useState<number>(Date.now())

  useEffect(() => {
    getSupabaseClient().then(setClient)
    api.get('/session/policy').then(r => setPolicyMinutes(Number(r.data?.minutes || 30))).catch(() => {})
  }, [])

  useEffect(() => {
    const onActivity = () => setLastActivity(Date.now())
    window.addEventListener('click', onActivity)
    window.addEventListener('keydown', onActivity)
    const id = setInterval(() => {
      const diff = Date.now() - lastActivity
      if (diff > policyMinutes * 60_000) {
        if (client) client.auth.signOut()
        setMessage('Session expired')
      }
    }, 5000)
    return () => { clearInterval(id); window.removeEventListener('click', onActivity); window.removeEventListener('keydown', onActivity) }
  }, [client, lastActivity, policyMinutes])

  const signUp = async () => {
    if (!client) return
    const { error } = await client.auth.signUp({ email, password })
    if (error) setMessage(error.message)
    else setMessage('Check email for verification')
  }

  const signIn = async () => {
    if (!client) return
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) { setMessage(error.message); return }
    const u = data.user
    if (!u) { setMessage('No user'); return }
    try {
      const r = await api.post('/users/sync', { email: u.email || '', username: u.user_metadata?.name || '' })
      window.localStorage.setItem('backendUserId', String(r.data.id))
    } catch {}
    setMessage('Signed in')
  }

  const reset = async () => {
    if (!client) return
    const { error } = await client.auth.resetPasswordForEmail(email)
    if (error) setMessage(error.message)
    else setMessage('Password reset email sent')
  }

  const enrollMfa = async () => {
    if (!client) return
    const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' })
    if (error) { setMessage(error.message); return }
    setMfaFactorId(data.id)
    setMfaUri(data.uri)
  }

  const verifyMfa = async () => {
    if (!client || !mfaFactorId || !mfaCode) return
    const ch = await client.auth.mfa.challenge({ factorId: mfaFactorId })
    if (ch.error) { setMessage(ch.error.message); return }
    const v = await client.auth.mfa.verify({ factorId: mfaFactorId, code: mfaCode, challengeId: ch.data.id })
    if (v.error) setMessage(v.error.message)
    else setMessage('MFA verified')
  }

  const acceptConsent = async () => {
    try {
      const uid = Number(window.localStorage.getItem('backendUserId') || '0')
      const ipr = await fetch('https://api.ipify.org?format=json')
      const ipj = await ipr.json()
      await api.post('/consent', { user_id: uid, accepted_privacy: true, accepted_terms: true, version: 'v1', ip: ipj.ip })
      setMessage('Consent recorded')
      try { window.localStorage.setItem('consentAcceptedTs', String(Date.now())) } catch {}
    } catch {}
  }

  const checkIp = async () => {
    if (!orgId) return
    try {
      const ipr = await fetch('https://api.ipify.org?format=json')
      const ipj = await ipr.json()
      const r = await api.get(`/ip-allowlists`, { params: { org_id: orgId } })
      const ips = r.data as { cidr: string }[]
      const ip = String(ipj.ip || '')
      const ok = ips.length === 0 || ips.some(x => ip === x.cidr || ip.startsWith(x.cidr.replace('/32','')))
      if (!ok && client) { await client.auth.signOut(); setMessage('Access blocked by IP policy') }
      else setMessage('IP allowed')
    } catch {}
  }

  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="p-4 lg:p-6">
        <h1 className="text-3xl font-bold">Identity & Access</h1>
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white/10 p-4 rounded-lg border border-white/10">
            <div className="text-lg font-semibold">Register</div>
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
            <button className="mt-3 px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={signUp}>Sign up</button>
            <button className="mt-3 ml-2 px-3 py-2 bg-white/20 rounded" onClick={reset}>Reset password</button>
          </div>
          <div className="bg-white/10 p-4 rounded-lg border border-white/10">
            <div className="text-lg font-semibold">Login & MFA</div>
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
            <button className="mt-3 px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={signIn}>Sign in</button>
            <div className="mt-4">
              <button className="px-3 py-2 bg-white/20 rounded" onClick={enrollMfa}>Enroll TOTP</button>
              {mfaUri && (
                <div className="mt-2">
                  <div className="text-xs break-all">{mfaUri}</div>
                  <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="MFA code" value={mfaCode} onChange={e=>setMfaCode(e.target.value)} />
                  <button className="mt-2 px-3 py-2 bg-white/20 rounded" onClick={verifyMfa}>Verify</button>
                </div>
              )}
            </div>
          </div>
          <div className="bg-white/10 p-4 rounded-lg border border-white/10">
            <div className="text-lg font-semibold">Policies</div>
            <div className="text-sm">Session timeout: {policyMinutes}m</div>
            <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Organization ID" value={orgId ?? ''} onChange={e=>setOrgId(Number(e.target.value)||null)} />
            <button className="mt-2 px-3 py-2 bg-white/20 rounded" onClick={checkIp}>Check IP policy</button>
            <div className="mt-4">
              <button className="px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={acceptConsent}>Accept Privacy/Terms</button>
            </div>
          </div>
        </div>
        <div className="mt-4 text-green-300 text-sm">{message}</div>
      </div>
    </div>
  )
}