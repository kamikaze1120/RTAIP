import React, { useEffect, useRef, useState } from 'react';
// import emailjs from 'emailjs-com';

const AlertBar = ({ anomalies }) => {
  const sentIdsRef = useRef(new Set());
  const [flash, setFlash] = useState(false);
  const [log, setLog] = useState([]);
  const wsRef = useRef(null);

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.3);
    } catch {}
  };

  useEffect(() => {
    const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
    const wsUrl = API.replace('http', 'ws') + '/ws';
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send('subscribe: anomalies');
      };
      ws.onmessage = (evt) => {
        const msg = String(evt.data || '');
        setFlash(true);
        setTimeout(() => setFlash(false), 1500);
        playBeep();
        setLog(prev => [{ text: msg, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
      };
      ws.onerror = () => {};
      ws.onclose = () => {};
    } catch {}
    return () => { try { wsRef.current && wsRef.current.close(); } catch {} };
  }, []);

  useEffect(() => {
    anomalies.forEach(anom => {
      if (sentIdsRef.current.has(anom.id)) return;
      const subject = `RTAIP Alert: ${anom.type || 'Anomaly Detected'}`;
      const message = `Anomaly detected for event ${anom.event_id} at ${anom.timestamp || ''}`;
      const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const ALERT_TO = process.env.REACT_APP_ALERT_EMAIL;
      if (!ALERT_TO) {
        setFlash(true);
        setTimeout(() => setFlash(false), 1200);
        playBeep();
        setLog(prev => [{ text: `Anomaly ${anom.event_id}`, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 5));
        return;
      }
      fetch(`${API}/notify/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: ALERT_TO, subject, message })
      })
        .then(res => res.json())
        .then(resp => {
          if (resp.status === 'sent') {
            sentIdsRef.current.add(anom.id);
          } else {
            console.warn('Email notify error', resp);
          }
        })
        .catch(err => {
          console.warn('Email notify failed', err);
        });
    });
  }, [anomalies]);

  return (
    <div className="p-2" style={{ borderBottom: '1px solid rgba(0,255,198,0.15)', background: flash ? 'rgba(255,59,59,0.12)' : 'transparent' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: flash ? 'var(--danger)' : 'var(--accent)' }}>ALERT CHANNEL</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Realtime alerts</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
        {log.length === 0 ? (
          <span>No alerts yet.</span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {log.map((l, idx) => (
              <li key={idx}>{l.ts} • {l.text}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AlertBar;