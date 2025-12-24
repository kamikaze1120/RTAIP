import React, { useEffect, useState } from 'react';
import { getBackendBase } from '../services/data';

export default function ISRAssetsPanel() {
  const [assets, setAssets] = useState<Array<{ id: number; name: string; type: string; lat: number; lon: number; status: string }>>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('UAV');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [status, setStatus] = useState('available');

  useEffect(() => {
    const base = getBackendBase();
    if (!base) return;
    fetch(`${base.replace(/\/$/, '')}/isr/assets`).then(r=>r.json()).then(j=>{ const arr = Array.isArray(j?.assets) ? j.assets : []; setAssets(arr); }).catch(()=>{});
  }, []);

  const add = async () => {
    const base = getBackendBase();
    if (!base) return;
    const payload = { name: name.trim(), type: type.trim(), lat: Number(lat), lon: Number(lon), status: status.trim() };
    if (!payload.name || !isFinite(payload.lat) || !isFinite(payload.lon)) return;
    await fetch(`${base.replace(/\/$/, '')}/isr/assets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const r = await fetch(`${base.replace(/\/$/, '')}/isr/assets`);
    const j = await r.json();
    const arr = Array.isArray(j?.assets) ? j.assets : [];
    setAssets(arr);
    setName(''); setLat(''); setLon('');
  };

  const del = async (id: number) => {
    const base = getBackendBase();
    if (!base) return;
    await fetch(`${base.replace(/\/$/, '')}/isr/assets/${id}`, { method: 'DELETE' });
    const r = await fetch(`${base.replace(/\/$/, '')}/isr/assets`);
    const j = await r.json();
    const arr = Array.isArray(j?.assets) ? j.assets : [];
    setAssets(arr);
  };

  const pushToMap = (a: { lat: number; lon: number }) => {
    try { window.dispatchEvent(new CustomEvent('rtaip_isr_targets', { detail: { targets: [a] } })); } catch {}
  };

  return (
    <div className="clip-corner border border-primary/20 p-3">
      <div className="text-xs text-primary tracking-widest uppercase mb-2">ISR Assets</div>
      <div className="grid md:grid-cols-2 gap-2 text-xs">
        <input className="px-2 py-1 bg-secondary border border-primary/20" value={name} onChange={e=>setName(e.target.value)} placeholder="Name" />
        <input className="px-2 py-1 bg-secondary border border-primary/20" value={type} onChange={e=>setType(e.target.value)} placeholder="Type" />
        <input className="px-2 py-1 bg-secondary border border-primary/20" value={lat} onChange={e=>setLat(e.target.value)} placeholder="Lat" />
        <input className="px-2 py-1 bg-secondary border border-primary/20" value={lon} onChange={e=>setLon(e.target.value)} placeholder="Lon" />
        <select className="px-2 py-1 bg-secondary border border-primary/20" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="available">available</option>
          <option value="tasked">tasked</option>
          <option value="maintenance">maintenance</option>
        </select>
        <button className="px-2 py-1 clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={add}>Add</button>
      </div>
      <div className="mt-3">
        <ul className="space-y-1">
          {assets.map(a => (
            <li key={a.id} className="flex items-center justify-between">
              <span className="text-muted-foreground">{a.name} • {a.type} • {a.status} • ({a.lat.toFixed(3)}, {a.lon.toFixed(3)})</span>
              <div className="flex gap-2">
                <button className="px-2 py-1 clip-corner-sm bg-primary/20 text-primary border border-primary/30" onClick={()=>pushToMap(a)}>Map</button>
                <button className="px-2 py-1 clip-corner-sm bg-destructive/20 text-destructive border border-destructive/30" onClick={()=>del(a.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}