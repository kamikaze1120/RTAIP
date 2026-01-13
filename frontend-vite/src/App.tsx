import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { NewHeader } from './components/NewHeader';

import MapPage from './pages/Map';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Timeline from './pages/Timeline';
import Intelligence from './pages/Intelligence';
import ThreatAnalysis from './pages/ThreatAnalysis';
import Logistics from './pages/Logistics';
import Security from './pages/Security';
 
import { getBackendBase, getHealthPaths, checkSupabaseHealth, getSupabaseConfig, runConnectivityDiagnostics } from './services/data';


export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [booting, setBooting] = useState(true);
  useEffect(() => {
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
      try {
        const paths = getHealthPaths();
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
          const ev = await fetch(`${b}/events`, { cache: 'no-store' });
          if (ev.ok) { }
          else { }
        } catch {
        }
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
      if (location.pathname === '/') {
        navigate('/sources');
      }
    }, 2000);
    return () => clearTimeout(id);
  }, [navigate, location.pathname]);
  return (
    <div className="relative min-h-screen text-white bg-animated">
      <div className="grid-overlay"></div>
      {!booting && <NewHeader />}
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
          <Routes>
            <Route path="/sources" element={<Sources />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/threat-analysis" element={<ThreatAnalysis />} />
            <Route path="/logistics" element={<Logistics />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/security" element={<Security />} />
            <Route path="/" element={<Dashboard />} />
          </Routes>
          )}
        </div>
      </main>
    </div>
  );
}