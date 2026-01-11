import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { NewHeader } from './components/NewHeader';
import Partners from './components/Partners';
import MapPage from './pages/Map';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Timeline from './pages/Timeline';
import Intelligence from './pages/Intelligence';
import ThreatAnalysis from './pages/ThreatAnalysis';
import Logistics from './pages/Logistics';
import SecurityPanel from './components/SecurityPanel';
 
import { getBackendBase, getHealthPaths, checkSupabaseHealth, getSupabaseConfig } from './services/data';
function Home() {
  return (
    <>
      <div className="px-6 pt-20">
        <div className="text-2xl text-primary">Welcome</div>
        <div className="mt-2 text-muted-foreground">Select a section from the top bar.</div>
      </div>
      <Partners />
    </>
  );
}

export default function App() {
  const [backendStatus, setBackendStatus] = useState<'online'|'degraded'|'offline'>('offline');
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<'backend'|'open'>('open');
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const base = getBackendBase();
      const supa = getSupabaseConfig();
      if (!base && supa.url && supa.anon) {
        const ok = await checkSupabaseHealth();
        if (ok) { setBackendStatus('online'); setDataMode('backend'); const ts = new Date().toISOString(); setLastHeartbeat(ts); window.localStorage.setItem('backendStatus', 'online'); window.localStorage.setItem('dataMode', 'backend'); window.localStorage.setItem('lastHeartbeat', ts); return; }
      }
      if (!base) { setBackendStatus('offline'); setDataMode('open'); window.localStorage.setItem('backendStatus', 'offline'); window.localStorage.setItem('dataMode', 'open'); return; }
      const b = base.replace(/\/$/, '');
      try {
        const paths = getHealthPaths();
        for (const p of paths) {
          try {
            const r = await fetch(`${b}${p}`, { cache: 'no-store' });
            if (r.ok) { setBackendStatus('online'); setDataMode('backend'); setLastHeartbeat(new Date().toISOString()); window.localStorage.setItem('backendStatus', 'online'); window.localStorage.setItem('dataMode', 'backend'); window.localStorage.setItem('lastHeartbeat', new Date().toISOString()); return; }
          } catch {}
        }
        try {
          const ping = await fetch(b, { cache: 'no-store' });
          if (ping.ok) { setBackendStatus('degraded'); setDataMode('backend'); window.localStorage.setItem('backendStatus', 'degraded'); window.localStorage.setItem('dataMode', 'backend'); }
        } catch {}
        try {
          const ev = await fetch(`${b}/events`, { cache: 'no-store' });
          if (ev.ok) { setBackendStatus('degraded'); setDataMode('backend'); setLastHeartbeat(new Date().toISOString()); window.localStorage.setItem('backendStatus', 'degraded'); window.localStorage.setItem('dataMode', 'backend'); window.localStorage.setItem('lastHeartbeat', new Date().toISOString()); }
          else { setBackendStatus('offline'); setDataMode('open'); window.localStorage.setItem('backendStatus', 'offline'); window.localStorage.setItem('dataMode', 'open'); }
        } catch {
          setBackendStatus('offline'); setDataMode('open'); window.localStorage.setItem('backendStatus', 'offline'); window.localStorage.setItem('dataMode', 'open');
        }
      } catch {
        setBackendStatus('offline'); setDataMode('open'); window.localStorage.setItem('backendStatus', 'offline'); window.localStorage.setItem('dataMode', 'open');
      }
    }
    check();
    const r = Number(window.localStorage.getItem('refreshMs') || '60000');
    const id = setInterval(check, Math.max(15000, r));
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return (
    <div className="relative min-h-screen bg-black text-white">
      <NewHeader />
      <main>
        <section className="relative h-screen flex items-center justify-center">
          <video
            autoPlay
            loop
            muted
            className="absolute top-0 left-0 w-full h-full object-cover z-0"
            src="https://www.storyblocks.com/video/stock/military-soldiers-discussing-their-plan-4k-h2c0c0c.html"
          />
          <div className="relative z-10 text-center">
            <h1 className="text-5xl font-bold">Rapid Tactical AI Platform</h1>
            <p className="mt-4 text-lg">Real-time intelligence for decisive action.</p>
          </div>
        </section>
        <Partners />
        <div className="pt-16">
          <Routes>
            <Route path="/sources" element={<Sources />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/threat-analysis" element={<ThreatAnalysis />} />
            <Route path="/logistics" element={<Logistics />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/security" element={<SecurityPanel />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      {splash && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black">
          <div className="text-center">
            <div className="text-[12px] tracking-widest text-gray-400 uppercase">RTAIP</div>
            <div className="text-4xl font-bold"><span className="text-primary">Rapid</span> Tactical AI Platform</div>
            <div className="mt-4 inline-block clip-corner-sm border border-primary/30 px-4 py-2 text-xs text-primary bg-primary/10">Initializing Systems…</div>
          </div>
        </div>
      )}
    </div>
  );
}