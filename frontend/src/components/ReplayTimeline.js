import React, { useState, useEffect } from 'react';

const ReplayTimeline = ({ events, onTimeChange }) => {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const maxIdx = Math.max(0, (events?.length || 0) - 1);
  const startTs = events.length > 0 ? new Date(events[0].timestamp) : null;
  const endTs = events.length > 0 ? new Date(events[events.length - 1].timestamp) : null;

  useEffect(() => {
    if (!playing || events.length === 0) return;
    const interval = setInterval(() => {
      setTime(prev => {
        const next = Math.min(maxIdx, prev + speed);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [playing, speed, maxIdx, events.length]);

  // Notify parent AFTER time updates render
  useEffect(() => {
    if (events.length === 0) return;
    onTimeChange(time);
  }, [time, onTimeChange, events.length]);

  const handleChange = e => {
    const newTime = Math.max(0, Math.min(maxIdx, Number(e.target.value)));
    setTime(newTime);
  };

  const togglePlay = () => setPlaying(p => !p);
  const handleSpeed = e => setSpeed(Number(e.target.value));

  return (
    <div className="tactical-panel">
      <div className="panel-header">
        <div style={{ color: 'var(--accent)' }}>Event Replay</div>
        <button onClick={togglePlay} className="button-tactical">{playing ? 'Pause' : 'Play'}</button>
      </div>
      <div className="p-2" style={{ color: 'var(--text)' }}>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
          Replay window: {startTs ? startTs.toLocaleString() : '—'} → {endTs ? endTs.toLocaleString() : '—'}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm">Speed:
            <select value={speed} onChange={handleSpeed} className="button-tactical" style={{ marginLeft: 8 }}>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
              <option value={5}>5x</option>
            </select>
          </label>
        </div>
        <input type="range" min="0" max={maxIdx} value={time} onChange={handleChange} disabled={events.length === 0} style={{ width: '100%' }} />
        <div style={{ fontSize: 12, marginTop: 6 }}>
          Showing {events.length === 0 ? 0 : time + 1} of {events.length} events
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>Time: {events[time]?.timestamp || '—'}</div>
      </div>
    </div>
  );
};

export default ReplayTimeline;