import React from 'react';

export default function CorrelationMatrix({ matrix }: { matrix: Record<string, Record<string, number>> }) {
  const sources = Object.keys(matrix);
  const maxVal = Math.max(1, ...sources.flatMap(a => Object.values(matrix[a] || {})));
  const color = (v: number) => {
    const t = Math.min(1, v / maxVal);
    const hue = 35 - Math.round(t * 35); // green→orange
    const alpha = 0.15 + t * 0.7;
    return `hsl(${hue} 100% 50% / ${alpha})`;
  };
  return (
    <div className="overflow-auto">
      <table className="text-xs w-full border border-primary/20 clip-corner">
        <thead>
          <tr>
            <th className="p-2 text-left">Source</th>
            {sources.map(s => (<th key={s} className="p-2 text-left">{s.toUpperCase()}</th>))}
          </tr>
        </thead>
        <tbody>
          {sources.map(a => (
            <tr key={a}>
              <td className="p-2 text-muted-foreground">{a.toUpperCase()}</td>
              {sources.map(b => {
                const v = matrix[a]?.[b] ?? 0;
                return (
                  <td key={`${a}-${b}`} style={{ background: color(v) }} className="p-2 border-t border-primary/10">{Math.round(v*100)}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}