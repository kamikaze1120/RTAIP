import React from 'react';

export default function TacticalGrid() {
  return (
    <div className="clip-corner border border-primary/20 bg-background/30">
      <div className="relative h-[420px]">
        <div className="absolute inset-2 border border-primary/20" />
        <div className="absolute inset-0">
          <svg width="100%" height="100%">
            <circle cx="50%" cy="55%" r="60" fill="none" stroke="hsl(180 100% 50% / 0.15)" />
            <circle cx="50%" cy="55%" r="30" fill="none" stroke="hsl(180 100% 50% / 0.12)" />
            {[
              { cx: '20%', cy: '30%', color: 'hsl(150 80% 45% / 0.9)' },
              { cx: '78%', cy: '62%', color: 'hsl(180 100% 50% / 0.9)' },
              { cx: '62%', cy: '45%', color: 'hsl(0 85% 55% / 0.9)' },
              { cx: '30%', cy: '80%', color: 'hsl(35 100% 50% / 0.9)' },
            ].map((p, i) => (
              <circle key={i} cx={p.cx} cy={p.cy} r={6} fill={p.color} />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}