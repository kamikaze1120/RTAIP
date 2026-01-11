import React from 'react';
import { cn } from '../lib/utils';

export function StatCard({ title, value, subtitle, icon, variant = 'default', align = 'left' }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'success';
  align?: 'left' | 'center';
}) {
  const colors = {
    default: 'text-blue-400',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
    success: 'text-green-400',
  };

  return (
    <div className={cn(
      'bg-white/10 backdrop-blur-md rounded-lg p-6 shadow-lg',
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
    </div>
  );
}

export default StatCard;