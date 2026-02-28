import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import React from 'react';
import { SearchInput } from './DesignSystem';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', primary: true },
  { label: 'Map', path: '/map', primary: true },
  { label: 'Sources', path: '/sources', primary: true },
  { label: 'Command', path: '/command', primary: true },
  { label: 'Intelligence', path: '/intelligence', primary: false },
  { label: 'Threat Analysis', path: '/threat-analysis', primary: false },
  { label: 'Logistics', path: '/logistics', primary: false },
  { label: 'Timeline', path: '/timeline', primary: false },
  { label: 'Security', path: '/security', primary: false },
  { label: 'Admin', path: '/admin', primary: false },
  { label: 'Legal', path: '/legal', primary: false },
];

export function NewHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const [q, setQ] = React.useState('');
  const suggestions = React.useMemo(() => ['Dashboard', 'Intelligence', 'Threat Analysis', 'Logistics', 'Map', 'Timeline', 'Security', 'Auth', 'Admin', 'Legal', 'Command'], []);
  const [theme, setTheme] = React.useState<string>(() => (typeof window !== 'undefined' ? (window.localStorage.getItem('theme') || 'dark') : 'dark'));
  React.useEffect(() => {
    const root = document.documentElement; root.classList.remove('dark', 'light'); root.classList.add(theme);
    try { window.localStorage.setItem('theme', theme); } catch {}
  }, [theme]);
  const authed = React.useMemo(() => { try { return !!window.localStorage.getItem('access_token'); } catch { return false; } }, [location.pathname]);
  const isAdmin = React.useMemo(() => { try { return window.localStorage.getItem('isAdmin') === 'true'; } catch { return false; } }, [location.pathname]);
  const logout = () => { try { window.localStorage.removeItem('access_token'); window.localStorage.removeItem('backendUserId'); } catch {}; navigate('/auth'); };
  const [moreOpen, setMoreOpen] = React.useState(false);
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/30 backdrop-blur-2xl shadow-lg">
      <div className="container mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" className="text-2xl font-extrabold text-white tracking-tight font-orbitron">
          <span className="inline-block px-2 py-1 rounded-md bg-white/10 box-glow">RTAIP</span>
        </Link>
        {/* Branding removed per request */}
        <nav className="flex items-center gap-6">
          {navItems.filter(it=>it.primary).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'group relative text-sm font-medium transition-colors',
                  isActive ? 'text-white' : 'text-gray-400 hover:text-white'
                )}
              >
                <span className="relative">
                  {item.label}
                  <span className={cn('absolute left-0 right-0 -bottom-1 h-[2px] rounded transition-all duration-300', isActive ? 'bg-gradient-to-r from-cyan-400 to-violet-400' : 'bg-transparent group-hover:bg-white/40')}></span>
                </span>
              </Link>
            );
          })}
          <div className="relative">
            <button className="text-sm text-gray-300 hover:text-white" onClick={()=>setMoreOpen(o=>!o)}>More</button>
            {moreOpen && (
              <div className="absolute right-0 mt-2 bg-black/80 border border-white/10 rounded shadow-xl min-w-[180px] p-2">
                {navItems.filter(it=>!it.primary).filter(it => it.label !== 'Admin' || isAdmin).map(item => (
                  <Link key={item.path} to={item.path} className="block px-3 py-1.5 text-sm text-gray-300 hover:bg-white/10 rounded" onClick={()=>setMoreOpen(false)}>{item.label}</Link>
                ))}
              </div>
            )}
          </div>
          <div className="w-[220px]">
            <SearchInput value={q} onChange={setQ} suggestions={suggestions} />
          </div>
          <Link to="/settings" className="px-3 py-1.5 rounded-md bg-gradient-to-r from-cyan-500 to-violet-500 text-black font-semibold shadow-lg hover:opacity-90 transition-opacity">
            Configure
          </Link>
          <button className="ml-2 px-3 py-1.5 rounded-md bg-white/10 border border-white/20 text-xs text-gray-200 transition-soft hover-bleed" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}>{theme==='dark'?'Dark':'Light'}</button>
          {authed && (<button className="ml-2 px-3 py-1.5 rounded-md bg-white/10 border border-white/20 text-xs text-gray-200 transition-soft hover-bleed" onClick={logout}>Logout</button>)}
          <div className="ml-4 flex items-center gap-2 px-2 py-1 rounded-md bg-green-600/10 border border-green-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs text-green-300">Live</span>
          </div>
        </nav>
        
      </div>
      <div className="h-[1px] bg-gradient-to-r from-cyan-500/40 via-violet-500/40 to-fuchsia-500/40" />
    </header>
  );
}