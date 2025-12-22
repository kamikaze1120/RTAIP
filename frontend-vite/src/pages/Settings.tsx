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
  const [aiProvider, setAiProvider] = useState<'backend'|'gemini'>('backend');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('models/gemini-1.5-flash');
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnon, setSupabaseAnon] = useState('');
  const [supabaseTable, setSupabaseTable] = useState('events');

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
    const ap = window.localStorage.getItem('aiProvider');
    if (ap) setAiProvider(ap === 'gemini' ? 'gemini' : 'backend');
    const gk = window.localStorage.getItem('geminiApiKey');
    if (gk) setGeminiApiKey(gk);
    const gm = window.localStorage.getItem('geminiModel');
    if (gm) setGeminiModel(gm);
    const su = window.localStorage.getItem('supabaseUrl');
    if (su) setSupabaseUrl(su);
    const sa = window.localStorage.getItem('supabaseAnon');
    if (sa) setSupabaseAnon(sa);
    const st = window.localStorage.getItem('supabaseTable');
    if (st) setSupabaseTable(st);
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
    window.localStorage.setItem('aiProvider', aiProvider);
    if (geminiApiKey) window.localStorage.setItem('geminiApiKey', geminiApiKey.trim());
    window.localStorage.setItem('geminiModel', geminiModel.trim());
    if (supabaseUrl) window.localStorage.setItem('supabaseUrl', supabaseUrl.trim());
    if (supabaseAnon) window.localStorage.setItem('supabaseAnon', supabaseAnon.trim());
    window.localStorage.setItem('supabaseTable', supabaseTable.trim());
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
          <div className="text-sm text-primary tracking-widest uppercase mb-2">AI Provider</div>
          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2"><input type="radio" checked={aiProvider==='backend'} onChange={()=>setAiProvider('backend')} /> Backend</label>
            <label className="flex items-center gap-2"><input type="radio" checked={aiProvider==='gemini'} onChange={()=>setAiProvider('gemini')} /> Google Gemini</label>
          </div>
        </div>
        {aiProvider==='gemini' && (
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <div className="text-sm text-primary tracking-widest uppercase mb-2">Gemini API Key</div>
              <input className="w-full px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" type="password" value={geminiApiKey} onChange={e=>setGeminiApiKey(e.target.value)} placeholder="AIza..." />
            </div>
            <div>
              <div className="text-sm text-primary tracking-widest uppercase mb-2">Gemini Model</div>
              <input className="w-full px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" value={geminiModel} onChange={e=>setGeminiModel(e.target.value)} placeholder="models/gemini-1.5-flash" />
            </div>
          </div>
        )}
        <div>
          <div className="text-sm text-primary tracking-widest uppercase mb-2">Supabase</div>
          <div className="grid md:grid-cols-3 gap-3">
            <input className="px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" value={supabaseUrl} onChange={e=>setSupabaseUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
            <input className="px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" type="password" value={supabaseAnon} onChange={e=>setSupabaseAnon(e.target.value)} placeholder="public anon key" />
            <input className="px-3 py-2 bg-secondary border border-primary/20 clip-corner-sm" value={supabaseTable} onChange={e=>setSupabaseTable(e.target.value)} placeholder="events" />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">Enter your project URL and public anon key; table used for events ingest.</div>
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