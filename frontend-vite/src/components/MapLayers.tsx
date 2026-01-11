import React from 'react';

const MapLayers = ({ onLayerChange }: { onLayerChange: (layer: string, enabled: boolean) => void }) => {
  return (
    <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 space-y-2">
      <h3 className="text-lg font-bold text-white">Map Layers</h3>
      <div className="flex items-center justify-between">
        <label htmlFor="usace" className="text-gray-300">USACE Infrastructure</label>
        <input type="checkbox" id="usace" name="usace" className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded" onChange={(e) => onLayerChange('usace', e.target.checked)} />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="nga" className="text-gray-300">NGA Tearline</label>
        <input type="checkbox" id="nga" name="nga" className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded" onChange={(e) => onLayerChange('nga', e.target.checked)} />
      </div>
      <div className="flex items-center justify-between">
        <label htmlFor="gtd" className="text-gray-300">Global Terrorism Data</label>
        <input type="checkbox" id="gtd" name="gtd" className="form-checkbox h-5 w-5 text-blue-600 bg-gray-800 border-gray-600 rounded" onChange={(e) => onLayerChange('gtd', e.target.checked)} />
      </div>
    </div>
  );
};

export default MapLayers;