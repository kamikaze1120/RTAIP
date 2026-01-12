import React from 'react';
import { cn } from '../lib/utils';

export function StatCard({ title, value, subtitle, icon, variant = 'default', align = 'left', tooltip }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'success';
  align?: 'left' | 'center';
  tooltip?: string;
}) {
  const colors = {
    default: 'text-blue-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
    success: 'text-green-400',
  };

  return (
    <div className={cn(
      'relative group bg-white/10 backdrop-blur-xl rounded-lg p-6 shadow-xl transition-transform hover:scale-[1.02] hover:ring-1 hover:ring-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-violet-500/10',
      align === 'center' ? 'text-center' : ''
    )}>
      <div className="flex items-center gap-4">
        {icon && <div className={cn('text-3xl', colors[variant])}>{icon}</div>}
        <div>
          <div className="text-sm font-semibold text-gray-300 uppercase tracking-wider">{title}</div>
          <div className={cn('text-4xl font-bold', colors[variant])}>{value}</div>
          {subtitle && <div className="text-sm text-gray-400">{subtitle}</div>}
        </div>
      </div>
      {tooltip && (
        <div className="pointer-events-none absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="max-w-xs text-xs text-white bg-black/70 border border-white/10 rounded-md shadow-lg p-2">
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}

export default StatCard;