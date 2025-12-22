import React, { useEffect, useState } from 'react';
import type { RtaEvent } from '../services/data';
import { getBackendBase, globalThreatScore, topClusters, typeProbabilities, reverseGeocode } from '../services/data';

export default function CommanderPanel({ events }: { events: RtaEvent[] }) {
  const [rec, setRec] = useState<string>('');
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
    </div>
  );
}