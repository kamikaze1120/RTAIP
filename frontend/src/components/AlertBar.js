import React, { useEffect, useRef } from 'react';
// import emailjs from 'emailjs-com';

const AlertBar = ({ anomalies }) => {
  const sentIdsRef = useRef(new Set());

  useEffect(() => {
    // No client-side emailjs init; using backend notify for security
  }, []);

  useEffect(() => {
    anomalies.forEach(anom => {
      if (sentIdsRef.current.has(anom.id)) return;
      const subject = `RTAIP Alert: ${anom.type || 'Anomaly Detected'}`;
      const message = `Anomaly detected for event ${anom.event_id} at ${anom.timestamp || ''}`;
      const API = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const ALERT_TO = process.env.REACT_APP_ALERT_EMAIL;
      if (!ALERT_TO) {
        // No alert recipient configured; skip sending
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
    <div className="p-2" style={{ borderBottom: '1px solid rgba(0,255,198,0.15)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: 'var(--accent)' }}>ALERT CHANNEL</span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Server-side email notify</span>
      </div>
    </div>
  );
};

export default AlertBar;