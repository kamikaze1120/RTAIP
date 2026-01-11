import React from 'react';

type Stat = { label: string; value: number; color?: string };

export default function SystemStats({ stats }: { stats: Stat[] }) {
  return (
    <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg">
      <div className="px-4 py-3 text-sm text-gray-300 tracking-widest uppercase">System Status</div>
      <div className="px-4 pb-4 space-y-3">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xs text-gray-400 mb-1">{s.label}</div>
            <div className="h-2 bg-black/20 rounded-full">
              <div className="h-2 rounded-full" style={{ width: `${s.value}%`, backgroundColor: s.color || 'hsl(180 100% 50% / 0.7)' }} />
            </div>
            <div className="text-[11px] text-gray-500 mt-1">{s.value}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}