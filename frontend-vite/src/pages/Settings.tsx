import React, { useEffect, useState } from 'react';
import { runConnectivityDiagnostics, runSupabaseDiagnostics, type ConnectivityDiagnostics, type SupabaseDiagnostics } from '../services/data';
import { NewHeader } from '../components/NewHeader';

export default function Settings() {
  const canonicalSources = [
    'ODIN',
    'DTIC', 
    'USACE',
    'PUB LOG',
    'NGA Tearline',
    'Military Periscope',
    'Janes',
    'Global Terrorism DB',
  ];
  const defaultSourceMap: Record<string, boolean> = {
    'ODIN': true,
    'DTIC': true,
    'USACE': true,
    'PUB LOG': true,
    'NGA Tearline': true,
    'Military Periscope': true,
    'Janes': true,
    'Global Terrorism DB': true,
  };
  
  const [enabledSources, setEnabledSources] = useState<Record<string, boolean>>(defaultSourceMap);
  const [enablePredictions, setEnablePredictions] = useState(true);
  const [defaultImpactRadius, setDefaultImpactRadius] = useState(120);
  const [useOpenFallback, setUseOpenFallback] = useState(true);
  const [aiEndpointPath, setAiEndpointPath] = useState('/api/ai-analyst');
  const [aiProvider, setAiProvider] = useState<'backend'|'gemini'>('backend');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('models/gemini-1.5-flash');

  
  

  useEffect(() => {
    const s = window.localStorage.getItem('sources');
    if (s) {
      try {
        const parsed = JSON.parse(s) as Record<string, boolean>;
        const filtered: Record<string, boolean> = {};
        canonicalSources.forEach(name => { filtered[name] = parsed[name] ?? defaultSourceMap[name] ?? true; });
        setEnabledSources(filtered);
      } catch {
        setEnabledSources(defaultSourceMap);
      }
    } else {
      setEnabledSources(defaultSourceMap);
    }
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
  }, []);

  const saveSettings = () => {
    window.localStorage.setItem('sources', JSON.stringify(enabledSources));
    window.localStorage.setItem('enablePredictions', String(enablePredictions));
    window.localStorage.setItem('defaultImpactRadius', String(defaultImpactRadius));
    window.localStorage.setItem('useOpenFallback', String(useOpenFallback));
    window.localStorage.setItem('aiEndpointPath', aiEndpointPath);
    window.localStorage.setItem('aiProvider', aiProvider);
    window.localStorage.setItem('geminiApiKey', geminiApiKey);
    window.localStorage.setItem('geminiModel', geminiModel);
    alert('Settings saved!');
  };
  const renderSection = (title: string, description: string, children: React.ReactNode) => (
    <div className="bg-white/5 p-6 rounded-lg">
      <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
      <p className="text-gray-400 mb-6">{description}</p>
      <div className="space-y-6">{children}</div>
    </div>
  );

  const renderInput = (label: string, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder = '', type = 'text', helpText = '') => (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-2 bg-black/20 text-white placeholder-gray-500 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      {helpText && <p className="mt-2 text-xs text-gray-500">{helpText}</p>}
    </div>
  );

  const [conn, setConn] = useState<ConnectivityDiagnostics | null>(null);
  const [supa, setSupa] = useState<SupabaseDiagnostics | null>(null);
  const testConnections = async () => {
    const a = await runConnectivityDiagnostics();
    const b = await runSupabaseDiagnostics();
    setConn(a);
    setSupa(b);
  };
  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="p-4 lg:p-6">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold">System Settings</h1>
            <p className="text-gray-400">Manage backend connections, data sources, and AI configurations.</p>
          </div>

          <div className="space-y-8">
            

            {renderSection("Data Sources", "Enable or disable specific data sources.", <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {canonicalSources.map(k => (
                  <label key={k} className="flex items-center space-x-3 p-3 bg-black/20 rounded-lg border border-white/10">
                    <input type="checkbox" checked={enabledSources[k as keyof typeof enabledSources]} onChange={e => setEnabledSources(s => ({ ...s, [k]: e.target.checked }))} className="form-checkbox h-5 w-5 text-cyan-500 bg-gray-800 border-gray-600 rounded focus:ring-cyan-500" />
                    <span className="text-white font-medium">{k}</span>
                  </label>
                ))}
              </div>
              <div className="pt-2 flex items-center gap-3">
                <button onClick={() => setEnabledSources(defaultSourceMap)} className="px-3 py-2 rounded-md bg-gradient-to-r from-cyan-500 to-violet-500 text-black font-semibold shadow hover:opacity-90">Reset Sources</button>
                <button onClick={saveSettings} className="px-4 py-2 rounded-md bg-gradient-to-r from-green-500 to-emerald-500 text-black font-semibold shadow-lg hover:opacity-90 transition-opacity">Save</button>
              </div>
              <label className="flex items-center space-x-3 pt-4">
                <input type="checkbox" checked={useOpenFallback} onChange={e => setUseOpenFallback(e.target.checked)} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500" />
                <span className="text-white font-medium">Use open-source fallbacks if backend is unavailable</span>
              </label>
            </>)}

            {renderSection("AI & Analysis", "Configure AI provider and prediction settings.", <>
              {renderInput("AI Analyst Path", aiEndpointPath, e => setAiEndpointPath(e.target.value), "/api/ai-analyst", 'text', "The backend-relative path for AI analyst queries.")}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">AI Provider</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="aiProvider" value="backend" checked={aiProvider === 'backend'} onChange={() => setAiProvider('backend')} className="form-radio h-4 w-4 text-blue-600 bg-gray-800 border-gray-700" />
                    <span className="text-white">Backend</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="radio" name="aiProvider" value="gemini" checked={aiProvider === 'gemini'} onChange={() => setAiProvider('gemini')} className="form-radio h-4 w-4 text-blue-600 bg-gray-800 border-gray-700" />
                    <span className="text-white">Google Gemini</span>
                  </label>
                </div>
              </div>
              {aiProvider === 'gemini' && (
                <div className="grid md:grid-cols-2 gap-6 p-4 bg-black/20 rounded-lg">
                  {renderInput("Gemini API Key", geminiApiKey, e => setGeminiApiKey(e.target.value), "AIza...", 'password')}
                  {renderInput("Gemini Model", geminiModel, e => setGeminiModel(e.target.value), "models/gemini-1.5-flash")}
                </div>
              )}
              <label className="flex items-center space-x-3 pt-4">
                <input type="checkbox" checked={enablePredictions} onChange={e => setEnablePredictions(e.target.checked)} className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500" />
                <span className="text-white font-medium">Enable threat predictions</span>
              </label>
              {renderInput("Default Impact Radius (km)", String(defaultImpactRadius), e => setDefaultImpactRadius(Number(e.target.value)), "", 'number', "Default radius for impact simulations.")}
            </>)}
            


            {renderSection("Connections Status", "Check connectivity to backend and Supabase.", <>
              <div className="flex items-center gap-3">
                <button onClick={testConnections} className="px-4 py-2 rounded-md bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-black font-semibold shadow-lg hover:opacity-90 transition-opacity">Test Connections</button>
                <div className="text-xs text-gray-300">{conn?.configured ? 'Backend configured' : 'Backend not configured'}</div>
              </div>
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-black/20 p-3 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-300 mb-2">Backend</div>
                  <div className="text-xs text-gray-400">Base: {conn?.base || '—'}</div>
                  <div className="text-xs text-gray-400">Health: {(conn?.health || []).some(h => h.ok) ? 'OK' : 'Fail'}</div>
                  <div className="text-xs text-gray-400">Events: {conn?.events?.ok ? 'OK' : 'Fail'}</div>
                </div>
                <div className="bg-black/20 p-3 rounded-lg border border-white/10">
                  <div className="text-sm text-gray-300 mb-2">Supabase</div>
                  <div className="text-xs text-gray-400">URL: {supa?.url || '—'}</div>
                  <div className="text-xs text-gray-400">Table: {supa?.table || '—'}</div>
                  <div className="text-xs text-gray-400">OK: {supa?.ok ? 'Yes' : 'No'}</div>
                </div>
              </div>
            </>)}


          </div>
        </div>
      </div>
    </div>
  );
}