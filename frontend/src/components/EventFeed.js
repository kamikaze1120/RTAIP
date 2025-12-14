import React, { useRef, useState, useEffect, useMemo } from 'react';

const iconFor = (src) => {
  const s = String(src || '').toLowerCase();
  if (s.includes('usgs')) return '🌋';
  if (s.includes('noaa')) return '⛈️';
  if (s.includes('gdacs')) return '🛰️';
  if (s.includes('fema')) return '🏛️';
  if (s.includes('hifld')) return '🏥';
  if (s.includes('census')) return '🧭';
  return '📍';
};

const summarizeEvent = (e) => {
  const src = String(e.source || 'unknown').toLowerCase();
  const ts = new Date(e.timestamp).toLocaleString() || '—';
  if (src === 'usgs_seismic') {
    const m = e.data?.mag;
    const place = e.data?.place;
    const magLine = m != null ? `M${m}` : 'seismic activity';
    return `${magLine}${place ? ` near ${place}` : ''}. ${ts}`;
  }
  if (src === 'noaa_weather') {
    const h = e.data?.headline; const ev = e.data?.event;
    return `${ev || 'Weather alert'}${h ? ` — ${h}` : ''}. ${ts}`;
  }
  if (src === 'gdacs_disasters') {
    const t = e.data?.title; const lvl = e.data?.alertlevel;
    return `${t || 'GDACS event'}${lvl ? ` (level: ${lvl})` : ''}. ${ts}`;
  }
  if (src === 'fema_disasters') {
    const t = e.data?.incidentType; const st = e.data?.state; const c = e.data?.county;
    return `${t || 'FEMA declaration'}${st ? ` — ${st}` : ''}${c ? ` (${c})` : ''}. ${ts}`;
  }
  if (src === 'hifld_infra') {
    const n = e.data?.name; const t = e.data?.type; const st = e.data?.state;
    return `${t || 'Facility'}${n ? ` — ${n}` : ''}${st ? ` (${st})` : ''}. ${ts}`;
  }
  return `${(e.source || 'Event').toString()} at ${ts}`;
};

const severityFor = (e, isAnom) => {
  if (isAnom) return 'critical';
  const src = String(e.source || '').toLowerCase();
  if (src === 'usgs_seismic') {
    const m = Number(e.data?.mag || 0);
    if (m >= 6.5) return 'high';
    if (m >= 4.5) return 'medium';
    return 'low';
  }
  if (src === 'noaa_weather') {
    const ev = String(e.data?.event || '').toLowerCase();
    if (ev.includes('warning')) return 'high';
    if (ev.includes('watch')) return 'medium';
    return 'low';
  }
  if (src === 'gdacs_disasters') {
    const lvl = String(e.data?.alertlevel || '').toLowerCase();
    if (lvl.includes('red')) return 'high';
    if (lvl.includes('orange')) return 'medium';
    return 'low';
  }
  return 'low';
};

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
            {visible.map(event => {
              const anom = isAnomalous(event.id);
              const sev = severityFor(event, anom);
              const icon = iconFor(event.source);
              const summary = summarizeEvent(event);
              const confPct = typeof event.confidence === 'number' ? Math.round(event.confidence * 100) : (typeof event.confidence === 'string' ? Math.round(Number(event.confidence) * 100) : '—');
              return (
                <li key={event.id} className="animate-arrival" style={{
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                  padding: '8px 0',
                  height: ITEM_H,
                  display: 'grid',
                  gridTemplateColumns: '6px auto 80px',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <div className={`sev-strip sev-${sev}`} />
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>{icon}</span>
                      <span style={{ fontSize: 12, letterSpacing: 1, color: 'var(--accent-muted)' }}>{(event.source || 'UNKNOWN').toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: 13 }}>{summary}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      <span className="badge">Conf: {confPct}%</span>
                      {anom && <span className="badge danger" style={{ marginLeft: 8 }}>Anomaly</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="button-tactical" onClick={() => onSelect && onSelect(event.id)}>Focus</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default EventFeed;