import React, { useRef, useState, useEffect, useMemo } from 'react';

const ITEM_H = 72;

const EventFeed = ({ events, anomalies = [], onSelect }) => {
  const wrapRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const isAnomalous = (eventId) => anomalies.some(a => a.event_id === eventId);

  useEffect(() => {
    const el = wrapRef.current;
    const onScroll = () => setScrollTop(el.scrollTop || 0);
    const onResize = () => setHeight(el.clientHeight || 0);
    if (el) {
      el.addEventListener('scroll', onScroll);
      onResize();
    }
    window.addEventListener('resize', onResize);
    return () => {
      if (el) el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const total = events.length;
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_H) - 3);
  const visibleCount = Math.max(1, Math.ceil((height || 300) / ITEM_H) + 6);
  const endIdx = Math.min(total, startIdx + visibleCount);
  const visible = useMemo(() => events.slice(startIdx, endIdx), [events, startIdx, endIdx]);

  return (
    <div className="p-2" style={{ color: 'var(--text)' }}>
      <div className="panel-header">
        <div style={{ color: 'var(--accent)' }}>Event Feed</div>
        <div className="button-tactical" onClick={() => wrapRef.current && (wrapRef.current.scrollTop = 0)}>Top</div>
      </div>
      <div className="p-2" ref={wrapRef} style={{ maxHeight: '40vh', overflowY: 'auto' }}>
        {events.length === 0 && (
          <div style={{ opacity: 0.7 }}>No events available yet.</div>
        )}
        <div style={{ position: 'relative', height: `${total * ITEM_H}px` }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, position: 'absolute', top: `${startIdx * ITEM_H}px`, left: 0, right: 0 }}>
            {visible.map(event => (
              <li key={event.id} style={{
                borderBottom: '1px solid rgba(0,255,198,0.12)',
                padding: '8px 0',
                height: ITEM_H
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
    </div>
  );
};

export default EventFeed;