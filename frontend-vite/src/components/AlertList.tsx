import React from 'react';
import { Button } from '@mui/material';

import { RtaEvent } from '../services/data';

type Alert = { event: RtaEvent, id: string; title: string; source: string; ago: string; severity: 'low'|'medium'|'high' };

export default function AlertList({ alerts, onSelect }: { alerts: Alert[], onSelect: (alert: Alert) => void }) {
  return (
    <div className="clip-corner border border-primary/20">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-primary tracking-widest uppercase">Alert Channel</div>
        <div className="text-xs text-muted-foreground">{alerts.length} active</div>
      </div>
      <div className="px-2 pb-3 space-y-2">
        {alerts.map(a => (
          <div key={a.id} className="px-3 py-2 border clip-corner-sm bg-card/20 flex items-center justify-between gap-3"
            style={{ borderColor: a.severity === 'high' ? 'hsl(0 85% 55% / 0.35)' : a.severity === 'medium' ? 'hsl(35 100% 50% / 0.35)' : 'hsl(180 100% 50% / 0.25)' }}>
            <div className="text-xs font-medium">
              {a.title}
              <div className="text-[11px] text-muted-foreground">{a.source} • {a.ago}</div>
            </div>
            <Button size="small" variant="outlined" onClick={() => onSelect(a)}>Focus</Button>
          </div>
        ))}
      </div>
    </div>
  );
}