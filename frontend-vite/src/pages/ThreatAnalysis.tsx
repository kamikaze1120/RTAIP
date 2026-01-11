import React, { useState, useEffect } from 'react';
import MapComponent from '../components/MapComponent';
import { getGtdEvents } from '../services/threat';

interface ThreatEvent {
  id: number;
  date: string;
  title: string;
  location: {
    lon: number;
    lat: number;
  };
  description: string;
  threat_level: 'Low' | 'Medium' | 'High' | 'Critical';
  group: string;
}

const ThreatAnalysis = () => {
  const [events, setEvents] = useState<ThreatEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ThreatEvent | null>(null);
  const [filter, setFilter] = useState('');
  const [layers, setLayers] = useState({
    usace: false,
    nga: false,
    gtd: true,
  });

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      const gtdEvents = await getGtdEvents();
      const sortedEvents = gtdEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(sortedEvents);
      setLoading(false);
      if (sortedEvents.length > 0) {
        setSelectedEvent(sortedEvents[0]);
      }
    };
    loadEvents();
  }, []);

  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(filter.toLowerCase()) ||
    event.group.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="bg-black text-white min-h-screen">
      <div className="container mx-auto px-6 py-8 space-y-8">
        <h1 className="text-4xl font-bold">Threat Analysis & Forecasting</h1>
        
        <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter events by title or group..."
            className="w-full bg-black/20 text-white placeholder-gray-500 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-4 h-[60vh] overflow-y-auto pr-4">
            {loading ? (
              <p>Loading events...</p>
            ) : (
              filteredEvents.map(event => (
                <div 
                  key={event.id} 
                  className={`bg-black/20 p-4 rounded-lg cursor-pointer border-2 ${selectedEvent?.id === event.id ? 'border-blue-500' : 'border-transparent'}`}
                  onClick={() => setSelectedEvent(event)}
                >
                  <h3 className="text-lg font-bold truncate">{event.title}</h3>
                  <p className="text-sm text-gray-400">{event.group} - {event.date}</p>
                  <div className="flex items-center mt-2">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                      event.threat_level === 'Critical' ? 'bg-red-700' :
                      event.threat_level === 'High' ? 'bg-red-500' :
                      event.threat_level === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                    }`}>{event.threat_level}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 h-[60vh] overflow-y-auto">
            {selectedEvent ? (
              <div>
                <h2 className="text-3xl font-bold">{selectedEvent.title}</h2>
                <div className="flex items-center space-x-4 text-md text-gray-400 mt-2">
                  <span>{selectedEvent.date}</span>
                  <span>{selectedEvent.group}</span>
                  <span className={`px-3 py-1 text-sm font-bold rounded-full ${
                    selectedEvent.threat_level === 'Critical' ? 'bg-red-700' :
                    selectedEvent.threat_level === 'High' ? 'bg-red-500' :
                    selectedEvent.threat_level === 'Medium' ? 'bg-yellow-500' : 'bg-green-500'
                  }`}>{selectedEvent.threat_level}</span>
                </div>
                <p className="mt-6 text-gray-300 whitespace-pre-wrap">{selectedEvent.description}</p>
                <div className="mt-6 h-64 rounded-lg overflow-hidden">
                  <MapComponent 
                    events={filteredEvents.map(e => ({
                      id: String(e.id),
                      latitude: e.location.lat,
                      longitude: e.location.lon,
                      timestamp: e.date,
                      source: 'GTD',
                      data: e,
                    }))}
                    focus={selectedEvent ? {
                      id: String(selectedEvent.id),
                      latitude: selectedEvent.location.lat,
                      longitude: selectedEvent.location.lon,
                      timestamp: selectedEvent.date,
                      source: 'GTD',
                      data: selectedEvent,
                    } : null}
                    onSelect={(id) => {
                      const event = events.find(e => String(e.id) === id);
                      setSelectedEvent(event || null);
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">{loading ? 'Loading event details...' : 'No event selected or found.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThreatAnalysis;