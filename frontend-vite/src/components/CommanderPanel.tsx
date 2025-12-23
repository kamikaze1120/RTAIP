import React, { useEffect, useState } from 'react';
import type { RtaEvent } from '../services/data';
import { getBackendBase, globalThreatScore, topClusters, typeProbabilities, reverseGeocode } from '../services/data';

export default function CommanderPanel({ events }: { events: RtaEvent[] }) {
  const [rec, setRec] = useState<string>('');
  const [coaInput, setCoaInput] = useState<string>('[[34.05,-118.24],[36.17,-115.14]]');
  const [coaOut, setCoaOut] = useState<string>('');
  const [isrOut, setIsrOut] = useState<string>('');
  useEffect(() => {
    const base = getBackendBase();
    const gts = globalThreatScore(events);
    const clusters = topClusters(events);
    const probs = typeProbabilities(events);
    (async () => {
      let locText = 'No hotspot clusters detected';
      if (clusters[0]) {
        const c = clusters[0];
        let place = '';
        try {
          const geo = await reverseGeocode(c.lat, c.lon);
          const city = geo?.city || geo?.county || geo?.state;
          const country = geo?.country;
          place = [city, country].filter(Boolean).join(', ');
        } catch {}
        locText = `Deploy monitoring assets to zone (${c.lat.toFixed(2)}, ${c.lon.toFixed(2)})${place ? ` — near ${place}` : ''}`;
      }
      const local = [
        gts > 600 ? `Escalation expected in ${(Math.max(6, Math.round(24 - (gts/50))))} hours` : 'Conditions stable; monitor key sources',
        locText,
        probs.weather > 50 ? 'NOAA anomaly likelihood elevated' : 'No significant weather anomalies predicted',
      ].join('\n');
      setRec(local);
    })();
    if (base) {
      fetch(`${base.replace(/\/$/, '')}/api/ai-analyst`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'Operational recommendations for next 24h' }) })
        .then(r => r.json()).then(j => setRec(typeof j === 'string' ? j : JSON.stringify(j, null, 2))).catch(()=>{});
    }
  }, [events]);
  return (
    <div className="clip-corner border border-primary/20 p-3">
      <div className="text-xs text-primary tracking-widest uppercase">RTAIP Recommendation Engine</div>
      <pre className="mt-2 text-xs whitespace-pre-wrap">{rec}</pre>
      <div className="mt-3 grid md:grid-cols-2 gap-3">
        <div className="clip-corner-sm border border-primary/20 p-2 text-xs">
          <div className="text-primary uppercase tracking-widest mb-1">COA Analysis</div>
          <div className="text-muted-foreground mb-1">Waypoints (JSON [lat,lon])</div>
          <textarea className="w-full h-24 px-2 py-1 bg-secondary border border-primary/20" value={coaInput} onChange={e=>setCoaInput(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button className="px-2 py-1 clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={async()=>{
              try {
                const base = getBackendBase();
                if (!base) return;
                const wps = JSON.parse(coaInput);
                const r = await fetch(`${base.replace(/\/$/, '')}/coa/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ waypoints: wps, hours: 24, radius_km: 50 }) });
                const jd = await r.json();
                setCoaOut(JSON.stringify(jd, null, 2));
              } catch (e) { setCoaOut(String(e)); }
            }}>Analyze</button>
          </div>
          {coaOut && <pre className="mt-2 whitespace-pre-wrap">{coaOut}</pre>}
        </div>
        <div className="clip-corner-sm border border-primary/20 p-2 text-xs">
          <div className="text-primary uppercase tracking-widest mb-1">ISR Tasking</div>
          <div className="text-muted-foreground mb-1">Recommendations (top clusters)</div>
          <div className="flex gap-2">
            <button className="px-2 py-1 clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={async()=>{
              try {
                const base = getBackendBase();
                if (!base) return;
                const r = await fetch(`${base.replace(/\/$/, '')}/isr/recommend?hours=24&limit=5`);
                const jd = await r.json();
                setIsrOut(JSON.stringify(jd, null, 2));
              } catch (e) { setIsrOut(String(e)); }
            }}>Recommend</button>
          </div>
          {isrOut && <pre className="mt-2 whitespace-pre-wrap">{isrOut}</pre>}
        </div>
      </div>
    </div>
  );
}