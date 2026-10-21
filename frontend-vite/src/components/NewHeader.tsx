import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import '../styles/osint.css';

const NAV = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Investigate', path: '/graph' },
  { label: 'Map', path: '/map' },
  { label: 'Timeline', path: '/timeline' },
  { label: 'Sources', path: '/sources' },
  { label: 'Intelligence', path: '/intelligence' },
];

const MORE = [
  { label: 'Security', path: '/security' },
  { label: 'Settings', path: '/settings' },
  { label: 'Admin', path: '/admin' },
  { label: 'Legal', path: '/legal' },
];

export function NewHeader() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = React.useState(false);
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
              className={MORE.some((m) => isActive(m.path)) ? 'active' : ''}
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
                {MORE.map((m) => (
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
        <span className="osint-live"><span className="osint-dot" /> Live</span>
      </div>
    </header>
  );
}

export default NewHeader;
