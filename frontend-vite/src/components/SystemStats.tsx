import React from 'react';

type Stat = { label: string; value: number; color?: string };

export default function SystemStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="clip-corner border border-primary/20">
      <div className="px-4 py-3 text-sm text-primary tracking-widest uppercase">System Status</div>
      <div className="px-4 pb-4 space-y-3">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className="h-2 bg-secondary clip-corner-sm">
              <div className="h-2" style={{ width: `${s.value}%`, backgroundColor: s.color || 'hsl(180 100% 50% / 0.7)' }} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">{s.value}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}