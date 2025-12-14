import React from 'react';
import { cn } from '../lib/utils';

export function StatCard({ title, value, subtitle, icon, variant = 'default' }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const border = {
    default: 'border-primary/20',
    warning: 'border-warning/30',
    danger: 'border-destructive/30',
    success: 'border-success/30',
  }[variant];
  return (
    <div className={cn('clip-corner border bg-card/30', border)}>
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {icon && <div className="text-primary">{icon}</div>}
          <div>
            <div className="text-xs tracking-widest text-muted-foreground uppercase">{title}</div>
            <div className="text-2xl font-bold text-primary">{value}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StatCard;