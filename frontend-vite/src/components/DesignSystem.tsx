import React, { useMemo, useRef, useState } from 'react'

export type SeverityLevel = 'critical' | 'warning' | 'info' | 'stable' | 'unknown'

function severityClass(level: SeverityLevel): string {
  if (level === 'critical') return 'severity-critical'
  if (level === 'warning') return 'severity-warning'
  if (level === 'info') return 'severity-info'
  if (level === 'stable') return 'severity-stable'
  return 'severity-unknown'
}

export function StatusBadge({ level, label }: { level: SeverityLevel; label?: string }) {
  return (
    <span className={`px-2 py-1 rounded text-[11px] border ${severityClass(level)} transition-soft`}>{label || level.toUpperCase()}</span>
  )
}

export function AlertCard({ title, subtitle, level, onClick, right }: { title: string; subtitle?: string; level: SeverityLevel; onClick?: () => void; right?: React.ReactNode }) {
  return (
    <div className="px-3 py-2 rounded-md bg-black/20 flex items-center justify-between gap-3 transition-soft hover-lift hover-bleed hover:ring-1 hover:ring-white/10" onClick={onClick} role={onClick ? 'button' : undefined}>
      <div className="flex items-center gap-3">
        <StatusBadge level={level} />
        <div className="text-xs font-medium text-gray-200">
          {title}
          {subtitle && (<div className="text-[11px] text-gray-400">{subtitle}</div>)}
        </div>
      </div>
      {right}
    </div>
  )
}

export function TooltipMeta({ children, content, position = 'top' }: { children: React.ReactNode; content: React.ReactNode; position?: 'top'|'bottom'|'left'|'right' }) {
  const pos = position === 'top' ? 'left-1/2 -translate-x-1/2 -top-2 -translate-y-full'
    : position === 'bottom' ? 'left-1/2 -translate-x-1/2 -bottom-2 translate-y-full'
    : position === 'left' ? 'right-full mr-2 top-1/2 -translate-y-1/2'
    : 'left-full ml-2 top-1/2 -translate-y-1/2'
  return (
    <span className="tooltip-wrap">
      {children}
      <span className={`tooltip-panel ${pos}`}>{content}</span>
    </span>
  )
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton skeleton-dark ${className||''}`} style={style} />
}

type Column<T> = { key: keyof T; label: string; width?: number | string; align?: 'left'|'center'|'right' }

export function DataTableVirtualized<T extends Record<string, unknown>>({ rows, columns, height = 320, rowHeight = 32 }: { rows: T[]; columns: Column<T>[]; height?: number; rowHeight?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const total = rows.length
  const visibleCount = Math.ceil(height / rowHeight) + 6
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 3)
  const end = Math.min(total, start + visibleCount)
  const slice = rows.slice(start, end)
  return (
    <div className="border border-white/10 rounded bg-white/5">
      <div className="grid" style={{ gridTemplateColumns: columns.map(c => typeof c.width === 'number' ? `${c.width}px` : c.width || '1fr').join(' ') }}>
        {columns.map((c, i) => (<div key={i} className="px-3 py-2 text-xs text-gray-300 bg-black/20">{c.label}</div>))}
      </div>
      <div ref={wrapRef} className="overflow-y-auto" style={{ height }} onScroll={e=>setScrollTop((e.target as HTMLDivElement).scrollTop)}>
        <div style={{ height: total * rowHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: start * rowHeight, left: 0, right: 0 }}>
            {slice.map((r, ri) => (
              <div key={start + ri} className="grid border-t border-white/5 hover:bg-white/5 transition-soft" style={{ height: rowHeight, gridTemplateColumns: columns.map(c => typeof c.width === 'number' ? `${c.width}px` : c.width || '1fr').join(' ') }}>
                {columns.map((c, ci) => (
                  <div key={ci} className={`px-3 py-2 text-xs ${c.align==='right'?'text-right':c.align==='center'?'text-center':'text-left'} text-gray-200`}>{String(r[c.key] ?? '')}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button className={`inline-flex items-center gap-2 px-2 py-1 rounded border border-white/10 ${checked?'bg-primary/20 text-primary':'bg-white/10 text-gray-300'} transition-soft`} onClick={()=>onChange(!checked)}>
      <span className={`inline-block w-4 h-4 rounded-full ${checked?'bg-primary':'bg-white/20'}`} />
      <span className="text-xs">{label || (checked ? 'On' : 'Off')}</span>
    </button>
  )
}

export function SliderSimple({ value, onChange, min = 0, max = 100, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} className="w-full appearance-none h-[6px] rounded bg-white/10 accent-[hsl(var(--primary))]" />
  )
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-popover text-popover-foreground border border-white/10 rounded-lg shadow-2xl w-[min(640px,90vw)] p-4">
        {title && (<div className="text-sm font-semibold mb-2">{title}</div>)}
        <div>{children}</div>
      </div>
    </div>
  )
}

export function SearchInput({ value, onChange, suggestions }: { value: string; onChange: (v: string) => void; suggestions: string[] }) {
  const [open, setOpen] = useState(false)
  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase(); if (!q) return suggestions.slice(0, 8)
    return suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 8)
  }, [value, suggestions])
  return (
    <div className="relative">
      <input value={value} onChange={e=>onChange(e.target.value)} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false), 150)} placeholder="Search" className="w-full px-3 py-2 rounded bg-black/20 border border-white/10 text-sm focus-ring" />
      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-popover text-popover-foreground border border-white/10 rounded shadow-xl p-2">
          {filtered.length===0 && (<div className="text-xs text-gray-400">No matches</div>)}
          {filtered.map((s,i)=>(<button key={i} className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-white/10" onMouseDown={()=>{ onChange(s); setOpen(false) }}>
            {s}
          </button>))}
        </div>
      )}
    </div>
  )
}