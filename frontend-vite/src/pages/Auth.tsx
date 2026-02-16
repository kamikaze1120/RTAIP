import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { useNavigate } from 'react-router-dom'
import { getBackendBase } from '../services/data'

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login'|'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [orgId, setOrgId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [policyMinutes, setPolicyMinutes] = useState(30)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const extractErrorMessage = (e: unknown, fallback: string) => {
    if (typeof e === 'object' && e) {
      const obj = e as Record<string, unknown>
      const resp = obj['response'] as Record<string, unknown> | undefined
      const data = resp?.['data'] as Record<string, unknown> | undefined
      const err = data?.['error']
      if (typeof err === 'string') return err
      const m = obj['message']
      if (typeof m === 'string') return m
    }
    return fallback
  }

  useEffect(() => {
    api.get('/session/policy').then(r => setPolicyMinutes(Number(r.data?.minutes || 30))).catch(() => {})
  }, [])

  useEffect(() => {
    const id = setInterval(() => {}, 5000)
    return () => { clearInterval(id) }
  }, [])

  const computeBase = (): string => {
    const b = getBackendBase();
    if (b) return b;
    try {
      if (typeof window !== 'undefined') {
        const h = window.location.hostname || '';
        if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:8000';
        return 'https://rtaip-backend.onrender.com';
      }
    } catch {}
    return 'https://rtaip-backend.onrender.com';
  }

  const signUp = async () => {
    if (!email || !password || !confirm) { setMessage('Fill all fields'); return }
    if (password !== confirm) { setMessage('Passwords do not match'); return }
    if (!acceptPrivacy || !acceptTerms) { setMessage('Please accept Privacy and Terms'); return }
    setBusy(true)
    try {
      const base = computeBase();
      const r = await fetch(`${base.replace(/\/$/, '')}/users/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email, email, password }) });
      const jd = await r.json();
      const uid = Number(jd?.id || 0)
      if (uid) { try { window.localStorage.setItem('backendUserId', String(uid)) } catch {} }
      const ipj = await (await fetch('https://api.ipify.org?format=json')).json()
      await fetch(`${base.replace(/\/$/, '')}/consent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: uid, accepted_privacy: true, accepted_terms: true, version: 'v1', ip: String(ipj?.ip || '') }) })
      setMessage('Account created. You can sign in now.')
      setMode('login')
    } catch (e: unknown) {
      setMessage(extractErrorMessage(e, 'Registration failed'))
    } finally {
      setBusy(false)
    }
  }

  const signIn = async () => {
    if (!email || !password) { setMessage('Enter email and password'); return }
    setBusy(true)
    try {
      const base = computeBase();
      const r = await fetch(`${base.replace(/\/$/, '')}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: email, password }) });
      const jd = await r.json();
      const token = jd?.access_token
      if (token) {
        try { window.localStorage.setItem('access_token', token) } catch {}
        setMessage('Signed in')
        navigate('/')
      } else {
        setMessage('Login failed')
      }
    } catch (e: unknown) {
      setMessage(extractErrorMessage(e, 'Login failed'))
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    setMessage('Password reset is not available yet')
  }

  const enrollMfa = async () => { setMessage('MFA will be available after login') }

  

  const checkIp = async () => {
    if (!orgId) return
    try {
      const ipr = await fetch('https://api.ipify.org?format=json')
      const ipj = await ipr.json()
      const r = await api.get(`/ip-allowlists`, { params: { org_id: orgId } })
      const ips = r.data as { cidr: string }[]
      const ip = String(ipj.ip || '')
      const ok = ips.length === 0 || ips.some(x => ip === x.cidr || ip.startsWith(x.cidr.replace('/32','')))
      if (!ok) { setMessage('Access blocked by IP policy') }
      else setMessage('IP allowed')
    } catch {}
  }

  return (
    <div className="flow-gradient text-white min-h-screen">
      <div className="p-4 lg:p-6">
        <h1 className="text-3xl font-bold">Access</h1>
        <div className="mt-4 max-w-md mx-auto bg-white/10 p-4 rounded-lg border border-white/10">
          <div className="flex gap-2">
            <button className={`px-3 py-2 rounded ${mode==='login'?'bg-white/20':'bg-white/5'}`} onClick={()=>setMode('login')}>Sign in</button>
            <button className={`px-3 py-2 rounded ${mode==='register'?'bg-white/20':'bg-white/5'}`} onClick={()=>setMode('register')}>Create account</button>
          </div>
          {mode==='login' ? (
            <div className="mt-3">
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
              <button disabled={busy} className="mt-3 w-full px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={signIn}>{busy?'Working…':'Sign in'}</button>
              <button className="mt-2 w-full px-3 py-2 bg-white/10 rounded" onClick={reset}>Reset password</button>
            </div>
          ) : (
            <div className="mt-3">
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Confirm password" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} />
              <div className="mt-3 text-xs text-gray-300 flex items-center gap-2">
                <input id="p" type="checkbox" checked={acceptPrivacy} onChange={e=>setAcceptPrivacy(e.target.checked)} />
                <label htmlFor="p">Accept Privacy Policy</label>
              </div>
              <div className="mt-2 text-xs text-gray-300 flex items-center gap-2">
                <input id="t" type="checkbox" checked={acceptTerms} onChange={e=>setAcceptTerms(e.target.checked)} />
                <label htmlFor="t">Accept Terms of Use</label>
              </div>
              <button disabled={busy} className="mt-3 w-full px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={signUp}>{busy?'Working…':'Sign up'}</button>
            </div>
          )}
        </div>
        <div className="max-w-md mx-auto mt-3">
          <button className="text-xs text-gray-300 underline" onClick={()=>setShowAdvanced(v=>!v)}>{showAdvanced?'Hide advanced':'Advanced security'}</button>
          {showAdvanced && (
            <div className="mt-2 bg-white/5 p-3 rounded border border-white/10">
              <div className="text-xs text-gray-400">Backend: {computeBase()}</div>
              <button className="mt-2 px-2 py-1 text-xs bg-white/10 rounded" onClick={async()=>{
                const base = computeBase();
                try { const r = await fetch(`${base.replace(/\/$/, '')}/health`, { cache: 'no-store' }); setMessage(r.ok?`Health OK at ${base}`:`Health ${r.status}`) } catch (e) { setMessage(`Health check failed: ${String((e as Error).message||e)}`) }
              }}>Ping</button>
              <div className="text-xs text-gray-300">Session timeout: {policyMinutes}m</div>
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Organization ID (optional)" value={orgId ?? ''} onChange={e=>setOrgId(Number(e.target.value)||null)} />
              <button className="mt-2 w-full px-3 py-2 bg-white/10 rounded" onClick={checkIp}>Check IP policy</button>
              <button className="mt-2 w-full px-3 py-2 bg-white/10 rounded" onClick={enrollMfa}>Enable MFA</button>
            </div>
          )}
        </div>
        <div className="mt-4 text-center text-sm" style={{ color: message.toLowerCase().includes('fail') || message.toLowerCase().includes('error') ? '#fca5a5' : '#86efac' }}>{message}</div>
      </div>
    </div>
  )
}