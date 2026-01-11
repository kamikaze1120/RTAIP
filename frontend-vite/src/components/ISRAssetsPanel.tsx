import React, { useEffect, useState } from 'react';
import { getBackendBase } from '../services/data';
import { MapPin, Trash2, Edit3, Save, X, Target } from 'lucide-react';

export interface ISRAsset {
  id: number;
  name: string;
  type: string;
  lat: number;
  lon: number;
  status: 'available' | 'tasked' | 'maintenance' | 'deployed';
  tasking?: {
    target: { lat: number; lon: number };
    description: string;
    priority: 'low' | 'medium' | 'high';
  };
  metadata?: {
    range?: number;
    endurance?: number;
    payload?: string;
  };
}

export default function ISRAssetsPanel() {
  const [assets, setAssets] = useState<ISRAsset[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<ISRAsset>>({});
  const [drawingMode, setDrawingMode] = useState(false);
  const [pendingTasking, setPendingTasking] = useState<{ assetId: number; target: { lat: number; lon: number } | null }>({ assetId: 0, target: null });
  const [newAsset, setNewAsset] = useState({ name: '', type: 'UAV', lat: '', lon: '', status: 'available' as const });

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    if (!drawingMode) return;
    
    const handleMapClick = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.lon || !detail?.lat) return;
      const target = { lat: detail.lat, lon: detail.lon };
      setPendingTasking(prev => ({ ...prev, target }));
      setDrawingMode(false);
    };
    
    window.addEventListener('rtaip_map_click', handleMapClick);
    return () => window.removeEventListener('rtaip_map_click', handleMapClick);
  }, [drawingMode]);

  const loadAssets = async () => {
    const base = getBackendBase();
    if (!base) return;
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/isr/assets`);
      const data = await response.json();
      const arr = Array.isArray(data?.assets) ? data.assets : [];
      setAssets(arr);
    } catch (error) {
      console.error('Failed to load ISR assets:', error);
    }
  };

  const addAsset = async () => {
    const base = getBackendBase();
    if (!base) return;
    
    const lat = Number(newAsset.lat);
    const lon = Number(newAsset.lon);
    
    if (!newAsset.name.trim() || !isFinite(lat) || !isFinite(lon)) return;
    
    const payload = {
      name: newAsset.name.trim(),
      type: newAsset.type.trim(),
      lat,
      lon,
      status: newAsset.status,
      metadata: {
        range: newAsset.type === 'UAV' ? 100 : newAsset.type === 'Satellite' ? 1000 : 50,
        endurance: newAsset.type === 'UAV' ? 12 : newAsset.type === 'Satellite' ? 24 : 6,
        payload: newAsset.type === 'UAV' ? 'EO/IR' : newAsset.type === 'Satellite' ? 'SAR' : 'SIGINT'
      }
    };
    
    try {
      await fetch(`${base.replace(/\/$/, '')}/isr/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      await loadAssets();
      setNewAsset({ name: '', type: 'UAV', lat: '', lon: '', status: 'available' });
    } catch (error) {
      console.error('Failed to add ISR asset:', error);
    }
  };

  const deleteAsset = async (id: number) => {
    const base = getBackendBase();
    if (!base) return;
    try {
      await fetch(`${base.replace(/\/$/, '')}/isr/assets/${id}`, { method: 'DELETE' });
      await loadAssets();
    } catch (error) {
      console.error('Failed to delete ISR asset:', error);
    }
  };

  const startEdit = (asset: ISRAsset) => {
    setEditingId(asset.id);
    setEditForm({
      name: asset.name,
      type: asset.type,
      lat: asset.lat,
      lon: asset.lon,
      status: asset.status,
      metadata: asset.metadata
    });
  };

  const saveEdit = async () => {
    const base = getBackendBase();
    if (!base || !editingId) return;
    
    try {
      await fetch(`${base.replace(/\/$/, '')}/isr/assets/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      await loadAssets();
      setEditingId(null);
      setEditForm({});
    } catch (error) {
      console.error('Failed to update ISR asset:', error);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const pushToMap = (asset: ISRAsset) => {
    try {
      window.dispatchEvent(new CustomEvent('rtaip_isr_targets', { 
        detail: { 
          targets: [{
            lat: asset.lat,
            lon: asset.lon,
            name: asset.name,
            type: asset.type,
            status: asset.status
          }]
        } 
      }));
    } catch (error) {
      console.error('Failed to push asset to map:', error);
    }
  };

  const startTasking = (assetId: number) => {
    setPendingTasking({ assetId, target: null });
    setDrawingMode(true);
  };

  const assignTasking = async () => {
    const base = getBackendBase();
    if (!base || !pendingTasking.target) return;
    
    const asset = assets.find(a => a.id === pendingTasking.assetId);
    if (!asset) return;
    
    const tasking = {
      target: pendingTasking.target,
      description: `Task ${asset.name} to investigate target area`,
      priority: 'medium' as const
    };
    
    try {
      await fetch(`${base.replace(/\/$/, '')}/isr/assets/${pendingTasking.assetId}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tasking)
      });
      await loadAssets();
      setPendingTasking({ assetId: 0, target: null });
      
      window.dispatchEvent(new CustomEvent('rtaip_isr_tasking', { 
        detail: { 
          asset: asset,
          target: pendingTasking.target,
          tasking: tasking
        } 
      }));
    } catch (error) {
      console.error('Failed to assign tasking:', error);
    }
  };

  const cancelTasking = () => {
    setPendingTasking({ assetId: 0, target: null });
    setDrawingMode(false);
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">ISR Asset Manager</h2>
        <div className="text-sm text-gray-400">{drawingMode ? 'Click map to set target' : `${assets.length} assets`}</div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <input type="text" placeholder="Asset Name" className="col-span-2 bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" value={newAsset.name} onChange={(e) => setNewAsset(prev => ({ ...prev, name: e.target.value }))} />
        <select className="bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" value={newAsset.type} onChange={(e) => setNewAsset(prev => ({ ...prev, type: e.target.value }))}>
          <option value="UAV">UAV</option>
          <option value="Satellite">Satellite</option>
          <option value="Aircraft">Aircraft</option>
          <option value="Ground">Ground</option>
        </select>
        <input type="text" placeholder="Latitude" className="bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" value={newAsset.lat} onChange={(e) => setNewAsset(prev => ({ ...prev, lat: e.target.value }))} />
        <input type="text" placeholder="Longitude" className="bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" value={newAsset.lon} onChange={(e) => setNewAsset(prev => ({ ...prev, lon: e.target.value }))} />
        <select className="bg-black/20 border border-gray-700 rounded-md px-3 py-2 text-white" value={newAsset.status} onChange={(e) => setNewAsset(prev => ({ ...prev, status: e.target.value as any }))}>
          <option value="available">Available</option>
          <option value="tasked">Tasked</option>
          <option value="maintenance">Maintenance</option>
          <option value="deployed">Deployed</option>
        </select>
        <button className="col-span-2 bg-blue-600/50 text-white rounded-md py-2" onClick={addAsset} disabled={!newAsset.name || !newAsset.lat || !newAsset.lon}>Add Asset</button>
      </div>

      {drawingMode && (
        <div className="bg-black/20 p-4 rounded-lg mb-4">
          <p className="text-gray-400">Click on map to set target location</p>
          {pendingTasking.target && (
            <p className="text-white">Target: {pendingTasking.target.lat.toFixed(4)}, {pendingTasking.target.lon.toFixed(4)}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button className="bg-blue-600/50 text-white rounded-md px-3 py-1" onClick={assignTasking} disabled={!pendingTasking.target}>Assign Task</button>
            <button className="bg-gray-600/50 text-white rounded-md px-3 py-1" onClick={cancelTasking}>Cancel</button>
          </div>
        </div>
      )}

      <div className="max-h-96 overflow-y-auto space-y-2">
        {assets.length === 0 && (
          <p className="text-gray-400 text-center py-4">No ISR assets configured</p>
        )}
        {assets.map(asset => (
          <div key={asset.id} className="bg-black/20 p-4 rounded-lg">
            {editingId === asset.id ? (
              <div className="flex flex-col gap-2">
                <input type="text" className="bg-black/30 border border-gray-700 rounded-md px-3 py-2 text-white" value={editForm.name || ''} onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))} />
                <select className="bg-black/30 border border-gray-700 rounded-md px-3 py-2 text-white" value={editForm.type || ''} onChange={(e) => setEditForm(prev => ({ ...prev, type: e.target.value }))}>
                  <option value="UAV">UAV</option>
                  <option value="Satellite">Satellite</option>
                  <option value="Aircraft">Aircraft</option>
                  <option value="Ground">Ground</option>
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" className="bg-black/30 border border-gray-700 rounded-md px-3 py-2 text-white" value={editForm.lat || ''} onChange={(e) => setEditForm(prev => ({ ...prev, lat: Number(e.target.value) }))} />
                  <input type="text" className="bg-black/30 border border-gray-700 rounded-md px-3 py-2 text-white" value={editForm.lon || ''} onChange={(e) => setEditForm(prev => ({ ...prev, lon: Number(e.target.value) }))} />
                </div>
                <select className="bg-black/30 border border-gray-700 rounded-md px-3 py-2 text-white" value={editForm.status || ''} onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}>
                  <option value="available">Available</option>
                  <option value="tasked">Tasked</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="deployed">Deployed</option>
                </select>
                <div className="flex gap-2">
                  <button className="bg-blue-600/50 text-white rounded-md p-2" onClick={saveEdit}><Save size={16} /></button>
                  <button className="bg-gray-600/50 text-white rounded-md p-2" onClick={cancelEdit}><X size={16} /></button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white">{asset.name}</p>
                    <p className="text-xs bg-gray-700 px-2 py-1 rounded-full text-gray-300">{asset.type}</p>
                    <p className={`text-xs px-2 py-1 rounded-full ${
                      asset.status === 'available' ? 'bg-green-600/50 text-green-300' :
                      asset.status === 'tasked' ? 'bg-yellow-600/50 text-yellow-300' :
                      asset.status === 'maintenance' ? 'bg-red-600/50 text-red-300' :
                      'bg-blue-600/50 text-blue-300'
                    }`}>{asset.status}</p>
                  </div>
                  <div className="flex gap-1">
                    <button className="text-gray-400 hover:text-white" onClick={() => startTasking(asset.id)}><Target size={16} /></button>
                    <button className="text-gray-400 hover:text-white" onClick={() => pushToMap(asset)}><MapPin size={16} /></button>
                    <button className="text-gray-400 hover:text-white" onClick={() => startEdit(asset)}><Edit3 size={16} /></button>
                    <button className="text-red-500 hover:text-red-400" onClick={() => deleteAsset(asset.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
                <p className="text-sm text-gray-400">
                  {asset.lat.toFixed(4)}, {asset.lon.toFixed(4)}
                  {asset.metadata?.range && ` • Range: ${asset.metadata.range}km`}
                  {asset.metadata?.endurance && ` • Endurance: ${asset.metadata.endurance}h`}
                </p>
                {asset.tasking && (
                  <p className="text-sm bg-yellow-600/20 text-yellow-300 p-2 rounded-lg mt-2">
                    Tasked to: {asset.tasking.target.lat.toFixed(4)}, {asset.tasking.target.lon.toFixed(4)}
                    {asset.tasking.description && ` • ${asset.tasking.description}`}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}