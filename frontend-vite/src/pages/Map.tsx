import React, { useEffect, useState } from 'react';
import { fetchUSGSAllDay, fetchNOAAAlerts, fetchGDACS, fetchFEMA, fetchHIFLDHospitals, fetchCensusCounties, type RtaEvent } from '../services/data';
import MapComponent from '../components/MapComponent';
import EventFeed from '../components/EventFeed';
import AnalystPanel from '../components/AnalystPanel';

export default function MapPage() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [sources, setSources] = useState({ usgs: true, noaa: true, gdacs: false, fema: false, hifld: false, census: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      const all = results.flat();
      if (!cancelled) setEvents(all);
    })();
    return () => { cancelled = true; };
  }, [sources]);

  return (
    <div className="px-6 pt-20">
      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="border border-primary/20 clip-corner">
          <EventFeed events={events} onSelect={() => {}} />
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
          </div>
          <MapComponent events={events} />
          <AnalystPanel events={events} onAsk={() => {}} />
        </div>
      </div>
    </div>
  );
}