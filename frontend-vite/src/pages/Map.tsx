import React, { useEffect, useState } from 'react';
import { getBackendBase, fetchBackendEvents, fetchGDACS, type RtaEvent } from '../services/data';
import MapComponent from '../components/MapComponent';
import EventFeed from '../components/EventFeed';
import { NewHeader } from '../components/NewHeader';


export default function MapPage() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  
  const [sources, setSources] = useState({ gdacs: false });
  const [hoursWindow, setHoursWindow] = useState(24);
  const [showPred, setShowPred] = useState(false);
  
  const [mapFocus, setMapFocus] = useState<RtaEvent | null>(null);

  useEffect(() => {
    const ep = window.localStorage.getItem('enablePredictions');
    if (ep) setShowPred(ep === 'true');
    
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
        if (sources.gdacs) promises.push(fetchGDACS(fromISO, toISO));
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
    <div className="bg-black text-white min-h-screen">
      <NewHeader />
      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4">
              <h2 className="text-lg font-bold mb-4">Controls</h2>
              
              {/* Time Window */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Time Window</span>
                  <span className="text-gray-400">{hoursWindow}h</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="168" 
                  value={hoursWindow} 
                  onChange={(e) => setHoursWindow(Number(e.target.value))} 
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Source Toggles */}
              <div className="mb-4">
                <h3 className="text-md font-semibold mb-2">Sources</h3>
                <div className="flex flex-col space-y-2 text-sm">

                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={sources.gdacs} onChange={e => setSources(s => ({ ...s, gdacs: e.target.checked }))} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-600 rounded" />
                    <span>GDACS</span>
                  </label>
                </div>
              </div>

              {/* Other Options */}
              <div>
                <h3 className="text-md font-semibold mb-2">Options</h3>
                <div className="flex flex-col space-y-2 text-sm">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input type="checkbox" checked={showPred} onChange={e => setShowPred(e.target.checked)} className="form-checkbox h-4 w-4 text-blue-600 bg-gray-800 border-gray-600 rounded" />
                    <span>Show Predictions</span>
                  </label>
                </div>
              </div>
              
            </div>

            {/* Event Feed */}
            <EventFeed 
              events={events.filter(e => {
                const t = new Date(e.timestamp).getTime();
                const cutoff = Date.now() - hoursWindow * 3600000;
                return !isNaN(t) && t >= cutoff;
              })} 
              onSelect={(e) => setMapFocus(f => f?.id === e.id ? null : e)} 
              focus={mapFocus} 
            />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg h-[calc(100vh-120px)]">
              <MapComponent 
                events={events} 
                focus={mapFocus} 
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}