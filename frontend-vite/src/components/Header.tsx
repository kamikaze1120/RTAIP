import { Link, useLocation } from 'react-router-dom';
import { Database, LayoutDashboard, Map, Clock, Settings, Radio } from 'lucide-react';
import { cn } from '../lib/utils';
import React, { useEffect, useState } from 'react';
import { runConnectivityDiagnostics, type ConnectivityDiagnostics, runSupabaseDiagnostics, type SupabaseDiagnostics, getSupabaseConfig } from '../services/data';

const navItems = [
  { label: 'Sources', path: '/sources', icon: Database },
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Map', path: '/map', icon: Map },
  { label: 'Timeline', path: '/timeline', icon: Clock },
  { label: 'Settings', path: '/settings', icon: Settings },
];

export function Header({ status = 'offline', mode = 'open', lastHeartbeat }: { status?: 'online'|'degraded'|'offline'; mode?: 'backend'|'open'; lastHeartbeat?: string | null }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [diag, setDiag] = useState<ConnectivityDiagnostics | null>(null);
  const [supa, setSupa] = useState<SupabaseDiagnostics | null>(null);
  useEffect(() => {
    if (!open) return;
    (async () => { try { const d = await runConnectivityDiagnostics(); setDiag(d); } catch {} })();
    const cfg = getSupabaseConfig();
    if (cfg.url && cfg.anon) (async () => { try { const s = await runSupabaseDiagnostics(); setSupa(s); } catch {} })();
  }, [open]);
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-primary/20 bg-background/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-6 py-3">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative">
            <div className="w-10 h-10 clip-corner bg-primary/20 flex items-center justify-center border border-primary/50 group-hover:bg-primary/30 transition-colors">
              <Radio className="w-5 h-5 text-primary" />
            </div>
            <div className="absolute inset-0 bg-primary/20 animate-pulse-ring clip-corner pointer-events-none" />
          </div>
          <span className="text-xl font-bold tracking-wider text-primary text-glow">RTAIP</span>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path}
                className={cn(
                  'relative px-4 py-2 flex items-center gap-2 text-sm font-medium tracking-wide transition-all duration-300',
                  'hover:text-primary hover:bg-primary/10',
                  'clip-corner-sm',
                  isActive ? 'text-primary bg-primary/20 border border-primary/30' : 'text-muted-foreground'
                )}>
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{item.label}</span>
                {isActive && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary box-glow" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button className={cn(
            'flex items-center gap-2 px-3 py-1.5 text-xs font-medium tracking-wider uppercase clip-corner-sm',
            status === 'online' ? 'bg-success/20 text-success border border-success/30' : status === 'degraded' ? 'bg-warning/20 text-warning border border-warning/30' : 'bg-destructive/20 text-destructive border border-destructive/30'
          )} onClick={()=>setOpen(o=>!o)}>
            <div className={cn('w-2 h-2 rounded-full', status === 'online' ? 'bg-success animate-pulse' : status === 'degraded' ? 'bg-warning animate-pulse' : 'bg-destructive')} />
            Backend: {status === 'online' ? 'Online' : status === 'degraded' ? 'Degraded' : 'Offline'}
          </button>
          <div className={cn('px-3 py-1.5 text-xs uppercase clip-corner-sm', mode==='backend'?'bg-primary/15 border border-primary/30 text-primary':'bg-muted/20 border border-muted text-muted-foreground')}>Data: {mode==='backend'?'Backend':'Open Feeds'}</div>
        </div>
        {open && (
          <div className="absolute right-6 top-14 z-50 clip-corner-sm border border-primary/20 bg-background px-3 py-2 text-xs w-[320px]">
            <div className="text-primary">Connectivity</div>
            <div className="mt-1 text-muted-foreground">Status: {status}</div>
            <div className="mt-1 text-muted-foreground">Mode: {mode==='backend'?'Backend':'Open Feeds'}</div>
            <div className="mt-1 text-muted-foreground">Last heartbeat: {lastHeartbeat ? new Date(lastHeartbeat).toLocaleString() : '—'}</div>
            {diag && (
              <div className="mt-2">
                <div className="text-primary">Diagnostic</div>
                <div className="text-muted-foreground">Configured: {String(diag.configured)}</div>
                {diag.base && <div className="text-muted-foreground">Base: {diag.base}</div>}
                <div className="mt-1">Health checks:</div>
                <ul className="mt-1 space-y-1">
                  {diag.health.map((h, i) => (
                    <li key={i} className="text-muted-foreground">{h.path}: {h.ok?'OK':`Fail${h.status?` (${h.status})`:''}${h.error?` — ${h.error}`:''}`}</li>
                  ))}
                </ul>
                {diag.root && <div className="mt-1 text-muted-foreground">Root: {diag.root.ok?'OK':`Fail${diag.root.status?` (${diag.root.status})`:''}${diag.root.error?` — ${diag.root.error}`:''}`}</div>}
                {diag.events && <div className="mt-1 text-muted-foreground">Events: {diag.events.ok?'OK':`Fail${diag.events.status?` (${diag.events.status})`:''}${diag.events.error?` — ${diag.events.error}`:''}`}</div>}
                <div className="mt-1 text-muted-foreground">Checked: {new Date(diag.timestamp).toLocaleString()}</div>
              </div>
            )}
            {supa && (
              <div className="mt-3">
                <div className="text-primary">Supabase</div>
                <div className="text-muted-foreground">Configured: {String(supa.configured)}</div>
                {supa.url && <div className="text-muted-foreground">URL: {supa.url}</div>}
                {supa.table && <div className="text-muted-foreground">Table: {supa.table}</div>}
                <div className="text-muted-foreground">Query: {supa.ok?'OK':`Fail${supa.status?` (${supa.status})`:''}${supa.error?` — ${supa.error}`:''}`}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}