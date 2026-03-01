import React, { useEffect, useState } from 'react'
import api from '../services/api'
import { useNavigate } from 'react-router-dom'
import { getBackendBase } from '../services/data'
import { getSupabaseClient } from '../utils/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

export default function AuthPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login'|'register'|'reset'>('login')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [acceptPrivacy, setAcceptPrivacy] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [orgId, setOrgId] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [newPass, setNewPass] = useState('')
  const [newPassConfirm, setNewPassConfirm] = useState('')
  const [policyMinutes, setPolicyMinutes] = useState(30)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [sbClient, setSbClient] = useState<SupabaseClient | null>(null)
  const [supUrl, setSupUrl] = useState<string>('')
  const [supAnon, setSupAnon] = useState<string>('')
  const [supTable, setSupTable] = useState<string>('profiles')

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
    getSupabaseClient().then(setSbClient)
    try {
      const lsUrl = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseUrl') : null
      const lsAnon = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseAnon') : null
      const lsTable = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseTable') : null
      if (lsUrl) setSupUrl(lsUrl)
      if (lsAnon) setSupAnon(lsAnon)
      if (lsTable) setSupTable(lsTable)
    } catch {}
  }, [])

  useEffect(() => {
    try {
      const hash = (typeof window !== 'undefined' ? window.location.hash : '') || ''
      if (hash.includes('type=recovery')) {
        setMode('reset')
        setMessage('Enter a new password to complete reset')
      }
    } catch {}
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
    if (!name || !email || !password || !confirm) { setMessage('Fill all required fields'); return }
    if (password !== confirm) { setMessage('Passwords do not match'); return }
    if (!acceptPrivacy || !acceptTerms) { setMessage('Please accept Privacy and Terms'); return }
    setBusy(true)
    try {
      if (!sbClient) { setMessage('Supabase not configured. Enter URL and Anon key below in Advanced.'); return }
      const res = await sbClient.auth.signUp({ email, password, options: { data: { full_name: name, phone } } })
      if (res.error) { setMessage(res.error.message); return }
      try {
        const table = (typeof window !== 'undefined' ? window.localStorage.getItem('supabaseProfileTable') : null) || 'profiles'
        const profile = { email, name, phone: phone || null, created_at: new Date().toISOString() }
        await sbClient.from(table).insert(profile)
      } catch {}
      setMessage('Account created. Please verify email (if required) and sign in.')
      setMode('login')
    } catch (e: unknown) {
      setMessage(extractErrorMessage(e, 'Registration failed'))
    } finally {
      setBusy(false)
    }
  }

  const signIn = async () => {
    if (!email || !password) { setMessage('Enter email and password'); return }
    if (!sbClient) { setMessage('Supabase not configured. Enter URL and Anon key below in Advanced.'); return }
    setBusy(true)
    try {
      const res = await sbClient.auth.signInWithPassword({ email, password })
      if (res.error) { setMessage(res.error.message); return }
      const token = res.data?.session?.access_token
      if (token) { try { window.localStorage.setItem('access_token', token) } catch {} }
      try {
        const userEmail = (res.data?.user?.email || email || '').toLowerCase()
        const adminEmail = (window.localStorage.getItem('adminEmail') || userEmail).toLowerCase()
        window.localStorage.setItem('adminEmail', adminEmail)
        window.localStorage.setItem('userEmail', userEmail)
        window.localStorage.setItem('isAdmin', String(userEmail === adminEmail))
      } catch {}
      setMessage('Signed in')
      navigate('/')
    } catch (e: unknown) {
      setMessage(extractErrorMessage(e, 'Login failed'))
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (mode === 'reset') {
      if (!sbClient) { setMessage('Supabase not configured.'); return }
      if (!newPass || !newPassConfirm) { setMessage('Enter new password twice') ; return }
      if (newPass !== newPassConfirm) { setMessage('Passwords do not match'); return }
      setBusy(true)
      try {
        const { error } = await sbClient.auth.updateUser({ password: newPass })
        if (error) { setMessage(error.message); return }
        setMessage('Password updated. Please sign in.')
        setMode('login')
      } catch (e: unknown) {
        setMessage(extractErrorMessage(e, 'Reset failed'))
      } finally { setBusy(false) }
      return
    }
    if (!email) { setMessage('Enter your email to reset'); return }
    if (!sbClient) { setMessage('Supabase not configured.'); return }
    setBusy(true)
    try {
      const redirectTo = (typeof window !== 'undefined' ? window.location.origin + '/auth' : undefined)
      const { error } = await sbClient.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) { setMessage(error.message); return }
      setMessage('Password reset email sent')
    } catch (e: unknown) {
      setMessage(extractErrorMessage(e, 'Reset failed'))
    } finally { setBusy(false) }
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
          ) : mode==='register' ? (
            <div className="mt-3">
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Phone (optional)" value={phone} onChange={e=>setPhone(e.target.value)} />
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
          ) : (
            <div className="mt-3">
              <div className="text-xs text-gray-300">Reset password for {email || 'your account'}</div>
              {!email && (
                <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
              )}
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="New password" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Confirm new password" type="password" value={newPassConfirm} onChange={e=>setNewPassConfirm(e.target.value)} />
              <button disabled={busy} className="mt-3 w-full px-3 py-2 bg-gradient-to-r from-cyan-500 to-violet-500 text-black rounded" onClick={reset}>{busy?'Working…':'Set new password'}</button>
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
              <div className="mt-3 text-xs text-gray-300">Supabase (required for login)</div>
              <input className="mt-1 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Supabase URL (e.g., https://YOUR-PROJECT.supabase.co)" value={supUrl} onChange={e=>setSupUrl(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Supabase Anon (publishable) Key" value={supAnon} onChange={e=>setSupAnon(e.target.value)} />
              <input className="mt-2 w-full px-3 py-2 bg-black/20 border border-white/10 rounded" placeholder="Profile table (default: profiles)" value={supTable} onChange={e=>setSupTable(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <button className="px-3 py-2 bg-white/10 rounded" onClick={async()=>{
                  try {
                    if (supUrl) window.localStorage.setItem('supabaseUrl', supUrl.trim())
                    if (supAnon) window.localStorage.setItem('supabaseAnon', supAnon.trim())
                    if (supTable) window.localStorage.setItem('supabaseTable', supTable.trim())
                    const c = await getSupabaseClient();
                    setSbClient(c);
                    if (c) {
                      const t = supTable?.trim() || 'profiles'
                      try { await c.from(t).select('*').limit(1); setMessage(`Supabase saved. Table '${t}' ready.`) } catch { setMessage('Supabase saved.') }
                    } else {
                      setMessage('Saved, but client unavailable. Check URL/key.')
                    }
                  } catch (e) {
                    setMessage(`Save failed: ${String((e as Error).message||e)}`)
                  }
                }}>Save Supabase</button>
                <a className="px-3 py-2 bg-white/10 rounded text-xs underline" href="https://app.supabase.com/project/_/settings/api" target="_blank" rel="noreferrer">Open Supabase API settings</a>
              </div>
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