import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import MapPage from './pages/Map';
import Dashboard from './pages/Dashboard';
import Sources from './pages/Sources';
import Timeline from './pages/Timeline';
import SettingsPage from './pages/Settings';
import { getBackendBase } from './services/data';

function Home() {
  return (
    <div className="px-6 pt-20">
      <div className="text-2xl text-primary">Welcome</div>
      <div className="mt-2 text-muted-foreground">Select a section from the top bar.</div>
    </div>
  );
}

export default function App() {
  const [isOnline, setIsOnline] = useState(false);
  const [splash, setSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const base = getBackendBase();
      if (!base) { setIsOnline(false); return; }
      try {
        const r = await fetch(`${base.replace(/\/$/, '')}/health`, { cache: 'no-store' });
        setIsOnline(r.ok);
      } catch {
        setIsOnline(false);
      }
    }
    check();
    const id = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);
  return (
    <div className="min-h-screen">
      <Header isOnline={isOnline} />
      <div className="pt-16">
        <Routes>
          <Route path="/" element={<Sources />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {splash && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-background">
          <div className="text-center">
            <div className="text-[12px] tracking-widest text-muted-foreground uppercase">RTAIP</div>
            <div className="text-4xl font-bold"><span className="text-primary">Rapid</span> Tactical AI Platform</div>
            <div className="mt-4 inline-block clip-corner-sm border border-primary/30 px-4 py-2 text-xs text-primary bg-primary/10">Initializing Systems…</div>
          </div>
        </div>
      )}
    </div>
  );
}