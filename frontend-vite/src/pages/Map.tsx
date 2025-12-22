import React, { useEffect, useState } from 'react';
import { getBackendBase, fetchBackendEvents, fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchFEMA, fetchHIFLDHospitals, fetchCensusCounties, type RtaEvent, predictedPoints } from '../services/data';
import MapComponent from '../components/MapComponent';
import EventFeed from '../components/EventFeed';
import AnalystPanel from '../components/AnalystPanel';

export default function MapPage() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [sources, setSources] = useState({ usgs: true, noaa: true, gdacs: false, fema: false, hifld: false, census: false });
  const [hoursWindow, setHoursWindow] = useState(24);
  const [showPred, setShowPred] = useState(false);
  const [simRadiusKm, setSimRadiusKm] = useState<number | undefined>(undefined);
  const [showHospitals, setShowHospitals] = useState(false);

  useEffect(() => {
    const ep = window.localStorage.getItem('enablePredictions');
    if (ep) setShowPred(ep === 'true');
    const dir = window.localStorage.getItem('defaultImpactRadius');
    if (dir) setSimRadiusKm(Number(dir));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const backend = getBackendBase();
      const fallback = (window.localStorage.getItem('useOpenFallback') || 'true') === 'true';
      let all: RtaEvent[] = [];
      if (backend) {
        all = await fetchBackendEvents();
      } else if (fallback) {
        const now = new Date();
        const fromISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const toISO = now.toISOString();
        const promises: Promise<RtaEvent[]>[] = [];
        if (sources.usgs) promises.push(fetchUSGSAllDay());
        if (sources.noaa) promises.push(fetchNOAAAlerts());
        if (sources.gdacs) promises.push(fetchGDACS(fromISO, toISO));
        if (sources.fema) promises.push(fetchFEMA());
        if (sources.hifld) promises.push(fetchHIFLDHospitals());
        if (sources.census) promises.push(fetchCensusCounties());
        const results = await Promise.all(promises);
        all = results.flat();
      }
      if (!cancelled) setEvents(all);
    })();
    return () => { cancelled = true; };
  }, [sources]);

  useEffect(() => {
    const r = Number(window.localStorage.getItem('refreshMs') || '60000');
    const id = setInterval(() => {
      const backend = getBackendBase();
      if (backend) {
        fetchBackendEvents().then(setEvents).catch(()=>{});
      }
    }, Math.max(15000, r));
    return () => clearInterval(id);
  }, []);

  return (
    <div className="px-6 pt-20">
      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="border border-primary/20 clip-corner">
          <div className="px-2 py-2 border-b border-primary/20">
            <div className="flex items-center justify-between">
              <div className="text-xs text-primary tracking-widest uppercase">Time Window</div>
              <div className="text-xs text-muted-foreground">{hoursWindow}h</div>
            </div>
            <input type="range" min="1" max="168" value={hoursWindow} onChange={(e)=>setHoursWindow(Number(e.target.value))} className="w-full" />
          </div>
          <EventFeed events={events.filter(e => {
            const t = new Date(e.timestamp).getTime();
            const cutoff = Date.now() - hoursWindow*3600000;
            return !isNaN(t) && t >= cutoff;
          })} onSelect={(id) => setSelectedId(id)} />
        </div>
        <div className="border border-primary/20 clip-corner">
          <div className="px-3 py-2 border-b border-primary/20 flex flex-wrap gap-2">
            <div className="text-xs text-primary tracking-widest uppercase">Source Toggles</div>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={sources.usgs} onChange={e=>setSources(s=>({ ...s, usgs: e.target.checked }))} /> USGS</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={sources.noaa} onChange={e=>setSources(s=>({ ...s, noaa: e.target.checked }))} /> NOAA</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={sources.gdacs} onChange={e=>setSources(s=>({ ...s, gdacs: e.target.checked }))} /> GDACS</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={sources.fema} onChange={e=>setSources(s=>({ ...s, fema: e.target.checked }))} /> FEMA</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={sources.hifld} onChange={e=>setSources(s=>({ ...s, hifld: e.target.checked }))} /> HIFLD</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={sources.census} onChange={e=>setSources(s=>({ ...s, census: e.target.checked }))} /> Census</label>
            <span className="mx-2">•</span>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showPred} onChange={e=>setShowPred(e.target.checked)} /> Predictions</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showHospitals} onChange={e=>setShowHospitals(e.target.checked)} /> Hospitals</label>
            <div className="text-xs ml-auto flex items-center gap-2">
              <span>Impact radius</span>
              <input type="range" min="10" max="250" value={simRadiusKm ?? 120} onChange={e=>setSimRadiusKm(Number(e.target.value))} />
              <span>{simRadiusKm ?? 120} km</span>
            </div>
          </div>
          <MapComponent events={events} selectedId={selectedId} predictionPoints={predictedPoints(events)} showPredictions={showPred} simRadiusKm={simRadiusKm} showHospitals={showHospitals} />
          <AnalystPanel events={events} onAsk={() => {}} />
        </div>
      </div>
    </div>
  );
}