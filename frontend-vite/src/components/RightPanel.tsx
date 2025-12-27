import React from 'react';
import { Box } from '@mui/material';
import AlertList from './AlertList';
import SystemStats from './SystemStats';
import CommanderPanel from './CommanderPanel';
import ISRAssetsPanel from './ISRAssetsPanel';
import ReadinessPanel from './ReadinessPanel';
import { RtaEvent } from '../services/data';

interface RightPanelProps {
  alerts: { event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' }[];
  stats: { label: string; value: number; color?: string }[];
  events: RtaEvent[];
  onSelect: (event: RtaEvent) => void;
}

const RightPanel: React.FC<RightPanelProps> = ({ alerts, stats, events, onSelect }) => {
  return (
    <Box sx={{ height: 'calc(100vh - 200px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <AlertList alerts={alerts} onSelect={onSelect} />
      <SystemStats stats={stats} />
      <CommanderPanel events={events} />
      <ISRAssetsPanel />
      <ReadinessPanel events={events} />
    </Box>
  );
};

export default RightPanel;