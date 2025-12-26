import React, { useEffect, useState } from 'react';
import { getBackendBase } from '../services/data';
import { Button, TextField, Card, CardContent, CardHeader, Typography, Select, MenuItem, FormControl, InputLabel, SelectChangeEvent, Box } from '@mui/material';
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
    <Card>
      <CardHeader
        title="ISR Asset Manager"
        subheader={drawingMode ? 'Click map to set target' : `${assets.length} assets`}
        titleTypographyProps={{ variant: 'h6', fontSize: '1rem' }}
        subheaderTypographyProps={{ fontSize: '0.75rem' }}
      />
      <CardContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
          <TextField
            label="Asset Name"
            size="small"
            value={newAsset.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset(prev => ({ ...prev, name: e.target.value }))}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Type</InputLabel>
            <Select
              value={newAsset.type}
              label="Type"
              onChange={(e: SelectChangeEvent) => setNewAsset(prev => ({ ...prev, type: e.target.value }))}
            >
              <MenuItem value="UAV">UAV</MenuItem>
              <MenuItem value="Satellite">Satellite</MenuItem>
              <MenuItem value="Aircraft">Aircraft</MenuItem>
              <MenuItem value="Ground">Ground</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Latitude"
            size="small"
            value={newAsset.lat}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset(prev => ({ ...prev, lat: e.target.value }))}
          />
          <TextField
            label="Longitude"
            size="small"
            value={newAsset.lon}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAsset(prev => ({ ...prev, lon: e.target.value }))}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Status</InputLabel>
            <Select
              value={newAsset.status}
              label="Status"
              onChange={(e: SelectChangeEvent) => setNewAsset(prev => ({ ...prev, status: e.target.value as any }))}
            >
              <MenuItem value="available">Available</MenuItem>
              <MenuItem value="tasked">Tasked</MenuItem>
              <MenuItem value="maintenance">Maintenance</MenuItem>
              <MenuItem value="deployed">Deployed</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={addAsset}
            disabled={!newAsset.name || !newAsset.lat || !newAsset.lon}
          >
            Add Asset
          </Button>
        </Box>

        {drawingMode && (
          <Box sx={{ p: 2, bgcolor: 'grey.200', borderRadius: 1, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">Click on map to set target location</Typography>
            {pendingTasking.target && (
              <Typography variant="body2">
                Target: {pendingTasking.target.lat.toFixed(4)}, {pendingTasking.target.lon.toFixed(4)}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button size="small" variant="contained" onClick={assignTasking} disabled={!pendingTasking.target}>Assign Task</Button>
              <Button size="small" variant="outlined" onClick={cancelTasking}>Cancel</Button>
            </Box>
          </Box>
        )}

        <Box sx={{ maxHeight: 300, overflowY: 'auto', spaceY: 2 }}>
          {assets.length === 0 && (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 4 }}>
              No ISR assets configured
            </Typography>
          )}
          {assets.map(asset => (
            <Box key={asset.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1 }}>
              {editingId === asset.id ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <TextField
                    size="small"
                    label="Name"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <FormControl fullWidth size="small">
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={editForm.type || ''}
                      label="Type"
                      onChange={(e: SelectChangeEvent) => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      <MenuItem value="UAV">UAV</MenuItem>
                      <MenuItem value="Satellite">Satellite</MenuItem>
                      <MenuItem value="Aircraft">Aircraft</MenuItem>
                      <MenuItem value="Ground">Ground</MenuItem>
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <TextField
                      size="small"
                      label="Latitude"
                      value={editForm.lat || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, lat: Number(e.target.value) }))}
                    />
                    <TextField
                      size="small"
                      label="Longitude"
                      value={editForm.lon || ''}
                      onChange={(e) => setEditForm(prev => ({ ...prev, lon: Number(e.target.value) }))}
                    />
                  </Box>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={editForm.status || ''}
                      label="Status"
                      onChange={(e: SelectChangeEvent) => setEditForm(prev => ({ ...prev, status: e.target.value as any }))}
                    >
                      <MenuItem value="available">Available</MenuItem>
                      <MenuItem value="tasked">Tasked</MenuItem>
                      <MenuItem value="maintenance">Maintenance</MenuItem>
                      <MenuItem value="deployed">Deployed</MenuItem>
                    </Select>
                  </FormControl>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="contained" onClick={saveEdit}><Save style={{ width: 16, height: 16 }} /></Button>
                    <Button size="small" variant="outlined" onClick={cancelEdit}><X style={{ width: 16, height: 16 }} /></Button>
                  </Box>
                </Box>
              ) : (
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="subtitle2">{asset.name}</Typography>
                      <Typography variant="caption" sx={{ bgcolor: 'grey.200', px: 1, borderRadius: 1 }}>{asset.type}</Typography>
                      <Typography variant="caption" sx={{
                        px: 1,
                        borderRadius: 1,
                        color: asset.status === 'available' ? 'success.main' : asset.status === 'tasked' ? 'warning.main' : asset.status === 'maintenance' ? 'error.main' : 'info.main',
                        bgcolor: asset.status === 'available' ? 'success.light' : asset.status === 'tasked' ? 'warning.light' : asset.status === 'maintenance' ? 'error.light' : 'info.light',
                      }}>
                        {asset.status}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Button size="small" variant="text" onClick={() => startTasking(asset.id)} sx={{ minWidth: 0, p: 0.5 }}>
                        <Target style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button size="small" variant="text" onClick={() => pushToMap(asset)} sx={{ minWidth: 0, p: 0.5 }}>
                        <MapPin style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button size="small" variant="text" onClick={() => startEdit(asset)} sx={{ minWidth: 0, p: 0.5 }}>
                        <Edit3 style={{ width: 16, height: 16 }} />
                      </Button>
                      <Button size="small" variant="text" color="error" onClick={() => deleteAsset(asset.id)} sx={{ minWidth: 0, p: 0.5 }}>
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </Button>
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {asset.lat.toFixed(4)}, {asset.lon.toFixed(4)}
                    {asset.metadata?.range && ` • Range: ${asset.metadata.range}km`}
                    {asset.metadata?.endurance && ` • Endurance: ${asset.metadata.endurance}h`}
                  </Typography>
                  {asset.tasking && (
                    <Typography variant="caption" sx={{ color: 'warning.main', bgcolor: 'warning.light', p: 0.5, borderRadius: 1, display: 'block', mt: 1 }}>
                      Tasked to: {asset.tasking.target.lat.toFixed(4)}, {asset.tasking.target.lon.toFixed(4)}
                      {asset.tasking.description && ` • ${asset.tasking.description}`}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}