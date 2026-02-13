import React, { useEffect, useMemo, useRef, useState } from 'react';

type Command = { id: string; label: string; hint?: string; run: () => void };

export default function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(''); setSel(0); }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); filtered[sel]?.run(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(c => c.label.toLowerCase().includes(s) || (c.hint||'').toLowerCase().includes(s));
  }, [q, commands]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] bg-black/60">
      <div className="max-w-2xl mx-auto mt-24 bg-gray-900 border border-white/10 rounded-lg shadow-2xl">
        <div className="p-3 border-b border-white/10">
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)} placeholder="Type a command…" className="w-full bg-black/30 text-white px-3 py-2 rounded" />
        </div>
        <div className="max-h-72 overflow-y-auto">
          {filtered.map((c, i) => (
            <button key={c.id} className={`w-full text-left px-4 py-2 text-sm ${sel===i?'bg-white/10':'bg-transparent'}`} onClick={()=>{ c.run(); onClose(); }}>
              <div className="text-white">{c.label}</div>
              {c.hint && (<div className="text-xs text-gray-400">{c.hint}</div>)}
            </button>
          ))}
          {filtered.length===0 && (<div className="px-4 py-3 text-xs text-gray-400">No commands</div>)}
        </div>
      </div>
    </div>
  );
}