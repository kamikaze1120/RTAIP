import React, { useState, useEffect } from 'react';
import Globe from '../components/Globe';
import { getAssets } from '../services/logistics';
import { NewHeader } from '../components/NewHeader';
import { Cpu, Box, Shield, Truck, Shirt } from 'lucide-react';

interface Asset {
  id: number;
  nsn: string;
  name: string;
  location: {
    lon: number;
    lat: number;
  };
  status: 'In Stock' | 'In Transit' | 'Low Stock' | 'Out of Stock';
  quantity: number;
  eta?: string; // Estimated time of arrival for 'In Transit' assets
  type: 'Electronics' | 'Weaponry' | 'Apparel' | 'Vehicle' | 'General';
  description: string;
}

const AssetIcon = ({ type }: { type: Asset['type'] }) => {
  switch (type) {
    case 'Electronics':
      return <Cpu className="w-4 h-4 mr-2" />;
    case 'Weaponry':
      return <Shield className="w-4 h-4 mr-2" />;
    case 'Apparel':
      return <Shirt className="w-4 h-4 mr-2" />;
    case 'Vehicle':
      return <Truck className="w-4 h-4 mr-2" />;
    default:
      return <Box className="w-4 h-4 mr-2" />;
  }
};

const Logistics = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    const loadAssets = async () => {
      setLoading(true);
      const pubLogAssets = await getAssets() as Asset[];
      setAssets(pubLogAssets);
      setLoading(false);
      if (pubLogAssets.length > 0) {
        setSelectedAsset(pubLogAssets[0]);
      }
    };
    loadAssets();
  }, []);

  const filteredAssets = assets.filter(asset =>
    asset.name.toLowerCase().includes(filter.toLowerCase()) ||
    asset.nsn.toLowerCase().includes(filter.toLowerCase())
  );

  const getStatusColor = (status: Asset['status']) => {
    switch (status) {
      case 'In Stock': return 'bg-green-500';
      case 'In Transit': return 'bg-blue-500';
      case 'Low Stock': return 'bg-yellow-500';
      case 'Out of Stock': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flow-gradient text-white min-h-screen">
      <NewHeader />
      <div className="container mx-auto px-6 py-24 space-y-8">
        <h1 className="text-4xl font-bold">Logistics & Asset Management</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter assets by name or NSN..."
                className="w-full bg-black/20 text-white placeholder-gray-500 border border-white/20 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-4 h-[70vh] overflow-y-auto pr-2">
              {loading ? (
                <p>Loading assets...</p>
              ) : (
                filteredAssets.map(asset => (
                  <div 
                    key={asset.id} 
                    className={`bg-black/20 p-4 rounded-lg cursor-pointer border mb-4 transition-colors ${selectedAsset?.id === asset.id ? 'border-cyan-500/40' : 'border-white/10 hover:border-white/30'}`}
                    onClick={() => setSelectedAsset(asset)}
                  >
                    <div className="flex items-center">
                      <AssetIcon type={asset.type} />
                      <h3 className="text-lg font-bold truncate">{asset.name}</h3>
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{asset.nsn}</p>
                    <div className="flex items-center mt-2">
                      <span className={`px-2 py-1 text-xs font-bold rounded-full ${getStatusColor(asset.status)}`}>
                        {asset.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white/10 backdrop-blur-md rounded-lg shadow-lg p-6 h-[80vh] overflow-hidden flex flex-col">
            {selectedAsset ? (
              <>
                <div className="flex-shrink-0">
                  <h2 className="text-3xl font-bold">{selectedAsset.name}</h2>
                  <p className="text-lg text-gray-400">{selectedAsset.nsn}</p>
                  <div className="flex items-center space-x-4 text-md mt-4">
                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${getStatusColor(selectedAsset.status)}`}>
                      {selectedAsset.status}
                    </span>
                    <span>Quantity: {selectedAsset.quantity}</span>
                    {selectedAsset.status === 'In Transit' && selectedAsset.eta && (
                      <span>ETA: {selectedAsset.eta}</span>
                    )}
                  </div>
                  <p className="mt-4 text-gray-300">{selectedAsset.description}</p>
                </div>
                <div className="flex-grow mt-6 rounded-lg overflow-hidden">
                  <Globe 
                    events={filteredAssets.map(a => ({
                      id: String(a.id),
                      latitude: a.location.lat,
                      longitude: a.location.lon,
                      timestamp: new Date().toISOString(),
                      source: 'PUB LOG',
                      data: { ...a },
                    }))}
                    focus={selectedAsset ? {
                      id: String(selectedAsset.id),
                      latitude: selectedAsset.location.lat,
                      longitude: selectedAsset.location.lon,
                      timestamp: new Date().toISOString(),
                      source: 'PUB LOG',
                      data: { ...selectedAsset },
                    } : null}
/>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500">{loading ? 'Loading asset details...' : 'No asset selected or found.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Logistics;