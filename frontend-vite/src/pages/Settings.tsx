import React, { useEffect, useState } from 'react';
import { getBackendBase } from '../services/data';

export default function Settings() {
  const [backendUrl, setBackendUrl] = useState('');
  const [refreshMs, setRefreshMs] = useState(60000);
  const [enabledSources, setEnabledSources] = useState({ usgs: true, noaa: true, gdacs: false, fema: false, hifld: false, census: false });
  const [healthPath, setHealthPath] = useState('/health');
  const [enablePredictions, setEnablePredictions] = useState(true);
  const [defaultImpactRadius, setDefaultImpactRadius] = useState(120);
  const [useOpenFallback, setUseOpenFallback] = useState(true);
  const [aiEndpointPath, setAiEndpointPath] = useState('/api/ai-analyst');

  useEffect(() => {
    const cur = getBackendBase();
    setBackendUrl(cur || '');
    const s = window.localStorage.getItem('sources');
    if (s) try { setEnabledSources(JSON.parse(s)); } catch {}
    const r = window.localStorage.getItem('refreshMs');
    if (r) setRefreshMs(Number(r));
    const hp = window.localStorage.getItem('healthPath');
    if (hp) setHealthPath(hp);
    const ep = window.localStorage.getItem('enablePredictions');
    if (ep) setEnablePredictions(ep === 'true');
    const dir = window.localStorage.getItem('defaultImpactRadius');
    if (dir) setDefaultImpactRadius(Number(dir));
    const of = window.localStorage.getItem('useOpenFallback');
    if (of) setUseOpenFallback(of === 'true');
    const aip = window.localStorage.getItem('aiEndpointPath');
    if (aip) setAiEndpointPath(aip);
  }, []);

  const save = () => {
    window.localStorage.setItem('backendUrl', backendUrl.trim());
    window.localStorage.setItem('sources', JSON.stringify(enabledSources));
    window.localStorage.setItem('refreshMs', String(refreshMs));
    window.localStorage.setItem('healthPath', healthPath.trim());
    window.localStorage.setItem('enablePredictions', String(enablePredictions));
    window.localStorage.setItem('defaultImpactRadius', String(defaultImpactRadius));
    window.localStorage.setItem('useOpenFallback', String(useOpenFallback));
    window.localStorage.setItem('aiEndpointPath', aiEndpointPath.trim());
  };

  return (
    <div className="px-6 pt-20 space-y-6">
      <div className="space-y-1">
        <div className="text-xs tracking-widest text-muted-foreground uppercase">Configuration</div>
        <div className="text-4xl font-bold">System <span className="text-primary">Settings</span></div>
        <div className="text-sm text-muted-foreground">Backend connection, source toggles, and refresh intervals.</div>
      </div>

      <div className="clip-corner border border-primary/20 p-4 space-y-4">
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">Backend URL</div>
          <input className="w-full px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" value={backendUrl} onChange={e=>setBackendUrl(e.target.value)} placeholder="https://your-backend.onrender.com" />
        </div>
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">Health Path</div>
          <input className="w-full px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" value={healthPath} onChange={e=>setHealthPath(e.target.value)} placeholder="/health or /api/health" />
          <div className="mt-1 text-xs text-muted-foreground">Used by the status indicator; falls back to /events if unavailable.</div>
        </div>
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">AI Endpoint Path</div>
          <input className="w-full px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" value={aiEndpointPath} onChange={e=>setAiEndpointPath(e.target.value)} placeholder="/api/ai-analyst" />
          <div className="mt-1 text-xs text-muted-foreground">Backend-relative path for analyst queries.</div>
        </div>
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">Source Toggles</div>
          <div className="flex flex-wrap gap-3 text-xs">
            {Object.keys(enabledSources).map(k => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={(enabledSources as any)[k]} onChange={e=>setEnabledSources(s=>({ ...s, [k]: e.target.checked }))} /> {k.toUpperCase()}</label>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">Refresh Interval</div>
          <input type="number" className="px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" value={refreshMs} onChange={e=>setRefreshMs(Number(e.target.value))} />
          <span className="ml-2 text-xs text-muted-foreground">milliseconds</span>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={enablePredictions} onChange={e=>setEnablePredictions(e.target.checked)} /> Enable predictions</label>
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={useOpenFallback} onChange={e=>setUseOpenFallback(e.target.checked)} /> Use open-source fallback</label>
          <div className="text-xs">
            <div className="mb-1">Default impact radius</div>
            <input type="number" className="px-2 py-1 bg-secondary border border-primary/20 clip-corner-sm w-full" value={defaultImpactRadius} onChange={e=>setDefaultImpactRadius(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <button className="px-3 py-2 clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}