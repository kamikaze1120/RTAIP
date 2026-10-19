import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  { label: 'Security', path: '/security', admin: false },
  { label: 'Settings', path: '/settings', admin: true },
  { label: 'Admin', path: '/admin', admin: true },
  { label: 'Legal', path: '/legal', admin: false },
];

export function NewHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const isAdmin = React.useMemo(() => {
    try { return window.localStorage.getItem('isAdmin') === 'true'; } catch { return false; }
  }, [location.pathname]);
  const authed = React.useMemo(() => {
    try { return !!window.localStorage.getItem('access_token'); } catch { return false; }
  }, [location.pathname]);

  const isActive = (p: string) =>
    location.pathname === p || (p === '/dashboard' && location.pathname === '/');

  const logout = () => {
    try {
      window.localStorage.removeItem('access_token');
      window.localStorage.removeItem('backendUserId');
    } catch { /* ignore */ }
    navigate('/auth');
  };

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
                {MORE.filter((m) => !m.admin || isAdmin).map((m) => (
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
        {authed && (
          <button className="osint-icon-btn" title="Sign out" onClick={logout} style={{ width: 'auto', padding: '0 12px', fontSize: 12 }}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}

export default NewHeader;
