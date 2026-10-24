import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getBackendBase } from '../services/data';
import '../styles/osint.css';

const NAV = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Investigate', path: '/graph' },
  { label: 'Map', path: '/map' },
  { label: 'Timeline', path: '/timeline' },
  { label: 'Sources', path: '/sources' },
  { label: 'Intelligence', path: '/intelligence' },
];

// Legal is always public; the rest are admin-only until auth lands (Phase 1).
const MORE = [
  { label: 'Security', path: '/security', admin: true },
  { label: 'Settings', path: '/settings', admin: true },
  { label: 'Admin', path: '/admin', admin: true },
  { label: 'Legal', path: '/legal', admin: false },
];

function readIsAdmin(): boolean {
  try { return window.localStorage.getItem('isAdmin') === 'true'; } catch { return false; }
}

type Health = 'unknown' | 'live' | 'degraded' | 'offline';

// Honest status badge. Reflects whether the core feature actually works:
//  live     = /graph/stats responds (graph routes deployed)
//  degraded = backend up but graph routes missing (stale deploy)
//  offline  = backend unreachable
//  unknown  = no backend configured
function useHealth(): Health {
  const [health, setHealth] = React.useState<Health>('unknown');
  React.useEffect(() => {
    let alive = true;
    async function probe() {
      const base = getBackendBase();
      if (!base) { if (alive) setHealth('unknown'); return; }
      const b = base.replace(/\/$/, '');
      try {
        const stats = await fetch(`${b}/graph/stats`, { cache: 'no-store' });
        if (stats.ok) { if (alive) setHealth('live'); return; }
        const h = await fetch(`${b}/health`, { cache: 'no-store' });
        if (alive) setHealth(h.ok ? 'degraded' : 'offline');
      } catch {
        if (alive) setHealth('offline');
      }
    }
    probe();
    const id = setInterval(probe, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return health;
}

const HEALTH_META: Record<Health, { label: string; cls: string }> = {
  live: { label: 'Live', cls: 'osint-live' },
  degraded: { label: 'Degraded', cls: 'osint-live osint-live--warn' },
  offline: { label: 'Offline', cls: 'osint-live osint-live--bad' },
  unknown: { label: 'No backend', cls: 'osint-live osint-live--muted' },
};

export function NewHeader() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const admin = readIsAdmin();
  const moreItems = MORE.filter((m) => !m.admin || admin);
  const health = useHealth();
  const hm = HEALTH_META[health];
  const isActive = (p: string) =>
    location.pathname === p || (p === '/dashboard' && location.pathname === '/');

  return (
    <header className="osint-header">
      <div className="osint-header-row">
        <Link to="/dashboard" className="osint-brand">
          <span className="osint-brand-mark">R</span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span className="osint-brand-name">RTAIP <span className="osint-badge">OSINT</span></span>
            <span className="osint-brand-tag">Open-Source Intelligence</span>
          </span>
        </Link>

        <nav className="osint-nav" style={{ marginLeft: 18 }}>
          {NAV.map((it) => (
            <Link key={it.path} to={it.path} className={isActive(it.path) ? 'active' : ''}>
              {it.label}
            </Link>
          ))}
          <div style={{ position: 'relative' }}>
            <a
              role="button"
              tabIndex={0}
              onClick={() => setMoreOpen((o) => !o)}
              className={moreItems.some((m) => isActive(m.path)) ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              More ▾
            </a>
            {moreOpen && (
              <div
                className="osint-card"
                style={{ position: 'absolute', right: 0, top: 40, minWidth: 180, padding: 6, zIndex: 60 }}
                onMouseLeave={() => setMoreOpen(false)}
              >
                {moreItems.map((m) => (
                  <Link
                    key={m.path}
                    to={m.path}
                    onClick={() => setMoreOpen(false)}
                    style={{ display: 'block', padding: '8px 12px', borderRadius: 8, color: 'var(--o-muted)', textDecoration: 'none', fontSize: 13.5 }}
                  >
                    {m.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="osint-spacer" />
        <span className={hm.cls} title={`Backend status: ${hm.label}`}><span className="osint-dot" /> {hm.label}</span>
      </div>
    </header>
  );
}

export default NewHeader;
