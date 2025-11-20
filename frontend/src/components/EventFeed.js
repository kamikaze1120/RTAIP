import React from 'react';

const EventFeed = ({ events, anomalies = [], onSelect }) => {
  const isAnomalous = (eventId) => anomalies.some(a => a.event_id === eventId);

  return (
    <div className="p-2" style={{ color: 'var(--text)' }}>
      <div className="panel-header">
        <div style={{ color: 'var(--accent)' }}>Event Feed</div>
        <div className="button-tactical" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Top</div>
      </div>
      <div className="p-2" style={{ maxHeight: '40vh', overflowY: 'auto' }}>
        {events.length === 0 && (
          <div style={{ opacity: 0.7 }}>No events available yet.</div>
        )}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {events.map(event => (
            <li key={event.id} style={{
              borderBottom: '1px solid rgba(0,255,198,0.12)',
              padding: '8px 0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: 1, color: 'var(--accent-muted)' }}>{(event.source || 'UNKNOWN').toUpperCase()}</div>
                  <div style={{ fontSize: 13 }}>{new Date(event.timestamp).toLocaleString() || '—'}</div>
                </div>
                <div>
                  <button className="button-tactical" onClick={() => onSelect && onSelect(event.id)}>Focus</button>
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                ID: {event.id} • Lat: {event.latitude ?? '—'} • Lon: {event.longitude ?? '—'} • Conf: {typeof event.confidence === 'number' ? Math.round(event.confidence * 100) : (typeof event.confidence === 'string' ? Math.round(Number(event.confidence) * 100) : '—')}%
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: isAnomalous(event.id) ? 'var(--danger)' : 'var(--accent-muted)' }}>
                {isAnomalous(event.id) ? 'Anomaly detected for this event' : 'Status: normal'}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default EventFeed;