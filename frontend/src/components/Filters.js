import React from 'react';

const Filters = ({ onFilterChange, onReset }) => {
  return (
    <div className="tactical-panel">
      <div className="panel-header">
        <div style={{ color: 'var(--accent)' }}>Filters</div>
        <button className="button-tactical" onClick={() => onReset && onReset()}>Reset</button>
      </div>
      <div className="p-2" style={{ color: 'var(--text)' }}>
        <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>Source</label>
        <select onChange={e => onFilterChange('source', e.target.value)} className="button-tactical" style={{ width: '100%' }}>
          <option value="">All Sources</option>
          <option value="adsb">ADSB (Aircraft)</option>
          <option value="ais">AIS (Maritime)</option>
          <option value="usgs_seismic">USGS (Seismic)</option>
          <option value="noaa_weather">NOAA (Weather)</option>
              </select>
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 13, opacity: 0.85 }}>
            <input type="checkbox" onChange={e => onFilterChange('anomaliesOnly', e.target.checked)} style={{ marginRight: 8 }} />
            Show anomalies only
          </label>
        </div>
      </div>
    </div>
  );
};

export default Filters;