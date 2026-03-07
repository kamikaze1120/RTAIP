import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { NewHeader } from './components/NewHeader';
import MobileNav from './components/MobileNav'; // Add mobile navigation

import MapPage from './pages/Map';
import LegalPage from './pages/Legal';
import CommandCenter from './pages/CommandCenter';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Timeline from './pages/Timeline';
import Intelligence from './pages/Intelligence';
import ThreatAnalysis from './pages/ThreatAnalysis';
import Logistics from './pages/Logistics';
import Security from './pages/Security';
import Settings from './pages/Settings';
import AuthPage from './pages/Auth';
import AdminPage from './pages/Admin';
 
import { getBackendBase, checkSupabaseHealth, getSupabaseConfig, runConnectivityDiagnostics } from './services/data';


export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [booting, setBooting] = useState(true);
  const authed = !!(typeof window !== 'undefined' && window.localStorage.getItem('access_token'));
  const isAdmin = !!(typeof window !== 'undefined' && window.localStorage.getItem('isAdmin') === 'true');
  const onAuthRoute = location.pathname.startsWith('/auth');
  useEffect(() => {
    // Persist env defaults to localStorage so backend stays connected without manual input
    try {
      const envBackend = import.meta.env.VITE_BACKEND_URL as string | undefined;
      if (envBackend) {
        window.localStorage.setItem('backendUrl', envBackend);
      }
      const envSupaUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      if (envSupaUrl && !window.localStorage.getItem('supabaseUrl')) {
        window.localStorage.setItem('supabaseUrl', envSupaUrl);
      }
      const envSupaAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (envSupaAnon && !window.localStorage.getItem('supabaseAnon')) {
        window.localStorage.setItem('supabaseAnon', envSupaAnon);
      }
      const envSupaTable = (import.meta.env.VITE_SUPABASE_TABLE as string | undefined) || 'data_events';
      if (envSupaTable && !window.localStorage.getItem('supabaseTable')) {
        window.localStorage.setItem('supabaseTable', envSupaTable);
      }
    } catch {}
    runConnectivityDiagnostics().then(console.log);
  }, []);

  useEffect(() => {
    async function check() {
      const base = getBackendBase();
      const supa = getSupabaseConfig();
      if (!base && supa.url && supa.anon) {
        const ok = await checkSupabaseHealth();
        if (ok) { return; }
      }
      if (!base) { return; }
      const b = base.replace(/\/$/, '');
      const endsApi = /\/api$/.test(b);
      try {
        const paths = endsApi ? ['/health', '/status'] : ['/health', '/api/health', '/status'];
        for (const p of paths) {
          try {
            const r = await fetch(`${b}${p}`, { cache: 'no-store' });
            if (r.ok) { return; }
          } catch {}
        }
        try {
          const ping = await fetch(b, { cache: 'no-store' });
          if (ping.ok) { }
        } catch {}
        try {
          const evCandidates = endsApi ? ['/events/status', '/events'] : ['/events/status', '/events', '/api/events'];
          for (const p of evCandidates) {
            try {
              const tmp = await fetch(`${b}${p}`, { cache: 'no-store' });
              if (tmp.ok) break;
            } catch {}
          }
        } catch {}
      } catch {
      }
    }
    check();
    const r = Number(window.localStorage.getItem('refreshMs') || '60000');
    const id = setInterval(check, Math.max(15000, r));
    return () => { clearInterval(id); };
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      setBooting(false);
      const token = window.localStorage.getItem('access_token');
      const path = location.pathname || '/';
      const allowUnauthed = path.startsWith('/auth') || path.startsWith('/legal');
      if (!token && !allowUnauthed) { navigate('/auth'); return; }
      if (token && location.pathname === '/') { navigate('/sources'); }
    }, 2000);
    return () => clearTimeout(id);
  }, [navigate, location.pathname]);
  return (
    <div className="relative min-h-screen text-white bg-animated">
      <div className="grid-overlay"></div>
      {!booting && authed && !onAuthRoute && <NewHeader />}
      {!booting && authed && !onAuthRoute && <MobileNav />}
      {!booting && !window.localStorage.getItem('cookieConsentTs') && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/70 text-white">
          <div className="container mx-auto px-6 py-3 flex items-center justify-between">
            <div className="text-sm text-gray-200">
              We use strictly necessary cookies/local storage to remember preferences and consent. No advertising cookies are used.
            </div>
            <button
              className="px-3 py-2 bg-white/20 rounded"
              onClick={() => { try { window.localStorage.setItem('cookieConsentTs', String(Date.now())); } catch {} }}
            >
              Accept
            </button>
          </div>
        </div>
      )}
      <main>
        <div className="pt-16 relative z-10">
          {booting ? (
            <div className="fixed inset-0 flex items-center justify-center flow-gradient">
              <div className="text-center">
                <div className="text-5xl font-extrabold text-white font-orbitron text-glow">RTAIP</div>
                <div className="mt-3 text-sm text-gray-300">Real-time Threat Analysis & Intelligence Platform</div>
              </div>
            </div>
          ) : (
          <div className="mobile-content">
            {authed ? (
              <Routes>
                <Route path="/sources" element={<Sources />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/intelligence" element={<Intelligence />} />
                <Route path="/threat-analysis" element={<ThreatAnalysis />} />
                <Route path="/logistics" element={<Logistics />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/timeline" element={<Timeline />} />
                <Route path="/security" element={<Security />} />
                <Route path="/settings" element={isAdmin ? <Settings /> : <Navigate to="/dashboard" replace />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/admin" element={isAdmin ? <AdminPage /> : <Navigate to="/dashboard" replace />} />
                <Route path="/legal" element={<LegalPage />} />
                <Route path="/command" element={<CommandCenter />} />
                <Route path="/" element={<Dashboard />} />
              </Routes>
            ) : (
              <Routes>
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/legal" element={<LegalPage />} />
                <Route path="*" element={<AuthPage />} />
              </Routes>
            )}
          </div>
          )}
        </div>
      </main>
    </div>
  );
}