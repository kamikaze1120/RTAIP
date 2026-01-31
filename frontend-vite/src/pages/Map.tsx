import React, { useEffect, useRef, useState } from 'react';
import { getBackendBase, fetchBackendEvents, type RtaEvent } from '../services/data';
import Globe from '../components/Globe';
import EventFeed from '../components/EventFeed';
import { NewHeader } from '../components/NewHeader';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import { fromLonLat } from 'ol/proj';


export default function MapPage() {
  const [events, setEvents] = useState<RtaEvent[]>([]);
  
  const [hoursWindow, setHoursWindow] = useState(24);
  const [loading, setLoading] = useState(true);
  
  const [mapFocus, setMapFocus] = useState<RtaEvent | null>(null);
  const [showStreetMap, setShowStreetMap] = useState(false);
  const streetMapRef = useRef<HTMLDivElement | null>(null);
  const olRef = useRef<Map | null>(null);

  useEffect(() => {
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const backend = getBackendBase();
      const supa = getSupabaseConfig();
      const fallback = (window.localStorage.getItem('useOpenFallback') || 'true') === 'true';
      let all: RtaEvent[] = [];
      if (supa.url && supa.anon) {
        all = await fetchSupabaseEvents();
        if (all.length === 0 && backend) {
          all = await fetchBackendEvents();
        }
      } else if (backend) {
        all = await fetchBackendEvents();
      } else if (fallback) {
        all = [];
      }
      if (!cancelled) {
        setEvents(all);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (showStreetMap && mapFocus && mapFocus.latitude != null && mapFocus.longitude != null) {
      if (!streetMapRef.current) return;
      if (!olRef.current) {
        olRef.current = new Map({
          target: streetMapRef.current,
          layers: [new TileLayer({ source: new OSM() })],
          view: new View({ center: fromLonLat([mapFocus.longitude, mapFocus.latitude]), zoom: 14 })
        });
      } else {
        olRef.current.setTarget(streetMapRef.current);
        olRef.current.getView().setCenter(fromLonLat([mapFocus.longitude, mapFocus.latitude]));
        olRef.current.getView().setZoom(14);
      }
    } else if (olRef.current) {
      olRef.current.setTarget(undefined as unknown as HTMLElement);
    }
  }, [showStreetMap, mapFocus]);

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
    <div className="flow-gradient text-white min-h-screen animate-in fade-in duration-700">
      <NewHeader />
      <div className="p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 animate-in slide-in-from-left-2 duration-500">
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
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer transition-all duration-300"
                />
              </div>

              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Street View Overlay</span>
                <button className="px-2 py-1 bg-white/10 border border-white/10 rounded-md hover:bg-white/20 transition-colors" onClick={() => setShowStreetMap(s => !s)}>{showStreetMap ? 'Hide' : 'Show'}</button>
              </div>

              {/* Source Toggles */}
              <div className="mb-4">
                <h3 className="text-md font-semibold mb-2">Sources</h3>
                <div className="flex flex-col space-y-2 text-sm">


                </div>
              </div>

              
              
            </div>

            {/* Event Feed */}
            <EventFeed 
              events={events.filter(e => {
                const t = new Date(e.timestamp).getTime();
                const cutoff = Date.now() - hoursWindow * 3600000;
                const src = String(e.source || '');
                return !isNaN(t) && t >= cutoff && !/usgs|noaa/i.test(src);
              })} 
              onSelect={(e) => { setMapFocus(f => f?.id === e.id ? null : e); }} 
              focus={mapFocus} 
            />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 animate-in slide-in-from-right-2 duration-500">
            <div className="relative bg-white/10 backdrop-blur-md rounded-lg shadow-lg h-[calc(100vh-120px)] transition-all">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full border-2 border-white/50 border-t-white animate-spin" />
                </div>
              )}
              <Globe events={events.filter(e => !/usgs|noaa/i.test(String(e.source||'')))} focus={mapFocus} onSelect={(e) => setMapFocus(f => f?.id === e.id ? null : e)} />

              {showStreetMap && mapFocus && mapFocus.latitude != null && mapFocus.longitude != null && (
                <div className="absolute inset-4 bg-black/80 border border-white/10 rounded-lg shadow-2xl">
                  <div className="flex items-center justify-between p-2 text-xs text-gray-300">
                    <div>
                      Street View • Lat: {mapFocus.latitude?.toFixed(4)} • Lon: {mapFocus.longitude?.toFixed(4)}
                    </div>
                    <button className="px-2 py-1 bg-white/10 rounded-md" onClick={() => setShowStreetMap(false)}>Close</button>
                  </div>
                  <div ref={streetMapRef} style={{ width: '100%', height: 'calc(100% - 32px)' }} />
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}