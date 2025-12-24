import React, { useState } from 'react';
import { getBackendBase } from '../services/data';

export default function COAComparePanel() {
  const [input, setInput] = useState('[\n  [[34.05,-118.24],[36.17,-115.14]],\n  [[34.05,-118.24],[35.68,-117.83],[36.17,-115.14]]\n]');
  const [out, setOut] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const run = async () => {
    const base = getBackendBase();
    if (!base) return;
    let list: any[] = [];
    try { list = JSON.parse(input); } catch { return; }
    const res: any[] = [];
    for (let i = 0; i < list.length; i++) {
      const wps = list[i];
      try {
        const r = await fetch(`${base.replace(/\/$/, '')}/coa/analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ waypoints: wps, hours: 24, radius_km: 50 }) });
        const jd = await r.json();
        res.push({ index: i, summary: jd?.summary || '', risk: jd?.risk || 0, distance_km: jd?.distance_km || 0, hazards: jd?.hazards || [], route: wps });
      } catch {}
    }
    setOut(res);
  };

  const showOnMap = (i: number) => {
    setSelected(i);
    try { window.dispatchEvent(new CustomEvent('rtaip_coa_route', { detail: { route: out[i]?.route || [] } })); } catch {}
  };

  return (
    <div className="clip-corner border border-primary/20 p-3">
      <div className="text-xs text-primary tracking-widest uppercase mb-2">COA Wargaming</div>
      <div className="text-muted-foreground text-xs mb-1">Enter an array of COAs, each a list of [lat,lon] waypoints</div>
      <textarea className="w-full h-24 px-2 py-1 bg-secondary border border-primary/20 text-xs" value={input} onChange={e=>setInput(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <button className="px-2 py-1 clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={run}>Compare</button>
      </div>
      {out.length>0 && (
        <div className="mt-3 text-xs">
          <table className="w-full">
            <thead>
              <tr><th className="text-left">COA</th><th className="text-left">Risk</th><th className="text-left">Distance (km)</th><th className="text-left">Hazards</th><th className="text-left">Actions</th></tr>
            </thead>
            <tbody>
              {out.map((r,i)=>(
                <tr key={i} className={selected===i?"bg-primary/10":""}>
                  <td>#{r.index}</td>
                  <td>{Math.round((r.risk||0)*100)}%</td>
                  <td>{Math.round(r.distance_km||0)}</td>
                  <td>{Array.isArray(r.hazards)?r.hazards.length:0}</td>
                  <td>
                    <button className="px-2 py-1 clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={()=>showOnMap(i)}>Show</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}