import React from 'react';

const MapLayers = ({ onLayerChange }: { onLayerChange: (layer: string, enabled: boolean) => void }) => {
  return (
    <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 space-y-2">
      <h3 className="text-lg font-bold text-white">Layers</h3>
      <div className="flex items-center justify-between">
        <label htmlFor="aviation" className="text-gray-300">Aviation</label>
        <input type="checkbox" id="aviation" className="h-5 w-5 bg-gray-800 border-gray-600 rounded" defaultChecked onChange={(e) => onLayerChange('aviation', e.target.checked)} />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="maritime" className="text-gray-300">Maritime</label>
        <input type="checkbox" id="maritime" className="h-5 w-5 bg-gray-800 border-gray-600 rounded" defaultChecked onChange={(e) => onLayerChange('maritime', e.target.checked)} />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="weather" className="text-gray-300">Weather & Disasters</label>
        <input type="checkbox" id="weather" className="h-5 w-5 bg-gray-800 border-gray-600 rounded" defaultChecked onChange={(e) => onLayerChange('weather', e.target.checked)} />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="government" className="text-gray-300">Government Data</label>
        <input type="checkbox" id="government" className="h-5 w-5 bg-gray-800 border-gray-600 rounded" defaultChecked onChange={(e) => onLayerChange('government', e.target.checked)} />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="news" className="text-gray-300">News/OSINT</label>
        <input type="checkbox" id="news" className="h-5 w-5 bg-gray-800 border-gray-600 rounded" defaultChecked onChange={(e) => onLayerChange('news', e.target.checked)} />
      </div>
    </div>
  );
};

export default MapLayers;