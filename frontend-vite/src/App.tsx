import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { NewHeader } from './components/NewHeader';
import MobileNav from './components/MobileNav';

import MapPage from './pages/Map';
import LegalPage from './pages/Legal';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Timeline from './pages/Timeline';
import Intelligence from './pages/Intelligence';
import Security from './pages/Security';
import Settings from './pages/Settings';
import AdminPage from './pages/Admin';
import EntityGraph from './pages/EntityGraph';

import { getBackendBase, checkSupabaseHealth, getSupabaseConfig, runConnectivityDiagnostics } from './services/data';

// Phase 0 route guard. Admin/Security/Settings are privileged surfaces. Until
// real authentication lands (Phase 1), access is denied by default and only
// granted when an operator explicitly opted in on this device. We never
// auto-grant admin to every visitor.
function isAdmin(): boolean {
  try { return window.localStorage.getItem('isAdmin') === 'true'; } catch { return false; }
}
function RequireAdmin({ children }: { children: ReactNode }) {
  return isAdmin() ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  // Persist env-provided service endpoints to localStorage so the client stays
  // connected. We deliberately do NOT write isAdmin here (that was a security
  // hole: commit bbb2530 granted admin to every visitor).
  useEffect(() => {
    try {
      const envBackend = import.meta.env.VITE_BACKEND_URL as string | undefined;
      if (envBackend) window.localStorage.setItem('backendUrl', envBackend);
      const envSupaUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      if (envSupaUrl && !window.localStorage.getItem('supabaseUrl')) window.localStorage.setItem('supabaseUrl', envSupaUrl);
      const envSupaAnon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
      if (envSupaAnon && !window.localStorage.getItem('supabaseAnon')) window.localStorage.setItem('supabaseAnon', envSupaAnon);
      const envSupaTable = (import.meta.env.VITE_SUPABASE_TABLE as string | undefined) || 'data_events';
      if (envSupaTable && !window.localStorage.getItem('supabaseTable')) window.localStorage.setItem('supabaseTable', envSupaTable);
    } catch { /* ignore */ }
    runConnectivityDiagnostics().then(console.log).catch(() => {});
  }, []);

  // Lightweight backend health poll (no auth).
  useEffect(() => {
    async function check() {
      const base = getBackendBase();
      const supa = getSupabaseConfig();
      if (!base && supa.url && supa.anon) { try { await checkSupabaseHealth(); } catch { /* ignore */ } return; }
      if (!base) return;
      const b = base.replace(/\/$/, '');
      try { await fetch(`${b}/health`, { cache: 'no-store' }); } catch { /* ignore */ }
    }
    check();
    const r = Number(window.localStorage.getItem('refreshMs') || '60000');
    const id = setInterval(check, Math.max(15000, r));
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-screen">
      <NewHeader />
      <MobileNav />
      <main>
        <div className="pt-16 relative z-10">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/graph" element={<EntityGraph />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/legal" element={<LegalPage />} />
            {/* Privileged surfaces — gated until auth lands (Phase 1) */}
            <Route path="/security" element={<RequireAdmin><Security /></RequireAdmin>} />
            <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
            <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
            <Route path="/" element={<Dashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
