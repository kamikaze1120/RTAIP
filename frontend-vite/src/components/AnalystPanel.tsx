import React, { useMemo, useState } from 'react';
import type { RtaEvent } from '../services/data';
import { getBackendBase, topClusters, estimatePopulationNear, callGemini } from '../services/data';

function brief(events: RtaEvent[]) {
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 60000);
  const inWindow = events.filter(e => { const t = new Date(e.timestamp).getTime(); return !isNaN(t) && t >= start.getTime(); });
  const total = inWindow.length;
  const bySrc = inWindow.reduce((acc: Record<string, number>, e) => { const k=(e.source||'unknown').toLowerCase(); acc[k]=(acc[k]||0)+1; return acc; }, {});
  const topSrc = Object.entries(bySrc).sort((a,b)=>b[1]-a[1])[0];
  const confVals = inWindow.map(e => typeof e.confidence === 'number' ? e.confidence : (typeof e.confidence === 'string' ? Number(e.confidence) : 0));
  const avg = confVals.length ? (confVals.reduce((a,b)=>a+b,0)/confVals.length) : 0;
  const pct = Math.round(avg * 100);
  const band = pct >= 70 ? 'High' : pct >= 40 ? 'Moderate' : 'Low';
  const hasSeismic = inWindow.some(e => (e.source||'').toLowerCase()==='usgs_seismic');
  const hasWeather = inWindow.some(e => (e.source||'').toLowerCase()==='noaa_weather');
  const hasInfra = inWindow.some(e => (e.source||'').toLowerCase()==='hifld_infra');
  const correlation = hasSeismic && hasInfra ? 'Potential impact near infrastructure points.' : (hasWeather && hasInfra ? 'Weather alerts observed near infrastructure.' : 'No supporting anomalies detected across aviation or maritime domains.');
  const lead = total > 0 ? `Between ${start.toISOString().slice(11,16)}–${now.toISOString().slice(11,16)} UTC, activity observed.` : 'Stable patterns in the last hour.';
  const srcLine = topSrc ? `Most activity: ${(topSrc[0]||'UNKNOWN').toUpperCase()} (${topSrc[1]}).` : '';
  const next = `Next: monitor ${topSrc ? topSrc[0].toUpperCase() : 'key sources'} and watch for new anomaly flags.`;
  return [ `${lead}`, `Events: ${total}.`, `Confidence: ${band}.`, srcLine, correlation, next ].filter(Boolean).join('\n');
}

export default function AnalystPanel({ events, onAsk }: { events: RtaEvent[]; onAsk?: (q: string) => void }) {
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const base = useMemo(() => brief(events), [events]);
  const suggestions = [ 'Summarize last 6 hours', 'Explain top 3 anomalies', 'Any threats near critical infrastructure?', 'What should I monitor next?' ];
  return (
    <div className="p-3 border-t border-primary/20">
      <div className="text-sm text-primary">Analyst Brief</div>
      <pre className="mt-2 text-xs text-foreground/90 whitespace-pre-wrap">{base}</pre>
      {answer && <pre className="mt-2 text-xs text-success whitespace-pre-wrap">{answer}</pre>}
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map(s => (
          <button key={s} className="px-2 py-1 text-xs clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={async () => {
            await handleAsk(s);
            onAsk?.(s);
          }}>{s}</button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input className="px-2 py-1 text-xs bg-secondary text-foreground border border-primary/20 clip-corner-sm flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the analyst" />
        <button className="px-2 py-1 text-xs clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={async () => { const q = input.trim(); if (!q) return; await handleAsk(q); onAsk?.(q); setInput(''); }}>Ask</button>
      </div>
    </div>
  );

  async function handleAsk(q: string) {
    if (busy) return;
    setBusy(true);
    const baseUrl = getBackendBase();
    const aiPath = typeof window !== 'undefined' ? (window.localStorage.getItem('aiEndpointPath') || '/api/ai-analyst') : '/api/ai-analyst';
    const lower = q.toLowerCase();
    if (lower.includes('population')) {
      const cluster = topClusters(events)[0];
      if (cluster) {
        const est = await estimatePopulationNear(cluster.lat, cluster.lon);
        const pop = est?.population != null ? est?.population : 'unknown';
        setAnswer(a => (a ? a + '\n' : '') + `Estimated population near ${est?.place || 'target area'}: ${pop}`);
      }
    }
    const provider = (import.meta as any)?.env?.VITE_AI_PROVIDER || 'backend';
    if (provider === 'gemini') {
      const ctx = brief(events);
      const res = await callGemini(q, ctx);
      if (res) {
        setAnswer(a => (a ? a + '\n' : '') + res);
        setBusy(false);
        return;
      }
    }
    if (!baseUrl) {
      const local = `No backend configured. Based on current telemetry: ${brief(events)}\nFocus: Monitor top source; watch for new anomaly flags.`;
      setAnswer(a => (a ? a + '\n' : '') + local);
      setBusy(false);
      return;
    }
    try {
      const r = await fetch(`${baseUrl.replace(/\/$/, '')}${aiPath}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q })
      });
      const jd = await r.json();
      const text = typeof jd === 'string' ? jd : JSON.stringify(jd, null, 2);
      setAnswer(a => (a ? a + '\n' : '') + text);
    } catch {
      setAnswer(a => (a ? a + '\n' : '') + ('Analyst service unreachable. Falling back to local brief.\n' + brief(events)));
    }
    setBusy(false);
  }
}