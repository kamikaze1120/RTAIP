"use client";

import clsx from "clsx";
import { Bell, Command, HelpCircle, Layers, Link2, Loader2, PanelRight, Search, Satellite, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MODES, type BaseMode } from "@/lib/layerConfig";
import type { SpaceWeather } from "@/lib/spaceweather";

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = now.toISOString();
  return (
    <div className="hidden text-right font-mono leading-tight lg:block" title="Coordinated Universal Time">
      <div className="text-sm tabular-nums text-ink">{t.slice(11, 19)}<span className="ml-1 text-[10px] text-dim">UTC</span></div>
      <div className="text-[10px] text-dim">{t.slice(0, 10)}</div>
    </div>
  );
}

export interface SearchHit {
  key: string;
  label: string;
  sub: string;
  action: { type: "investigate"; q: string } | { type: "feature"; id: string } | { type: "place"; lon: number; lat: number };
}

export function Hud({ mode, onMode, space, entityCount, alertCount, hits, onHit, searching, query, onQuery, onToggleRail, onToggleDock, onAlerts, onShare, onHelp, onPalette, searchRef, copied }: {
  mode: BaseMode;
  onMode: (m: BaseMode) => void;
  space: SpaceWeather | null;
  entityCount: number;
  alertCount: number;
  hits: SearchHit[];
  onHit: (h: SearchHit) => void;
  searching: boolean;
  query: string;
  onQuery: (q: string) => void;
  onToggleRail: () => void;
  onToggleDock: () => void;
  onAlerts: () => void;
  onShare: () => void;
  onHelp: () => void;
  onPalette: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  copied: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const kp = space?.kp ?? null;
  const kpColor = kp === null ? "#56667a" : kp >= 7 ? "#f43f5e" : kp >= 5 ? "#f5a524" : kp >= 4 ? "#facc15" : "#34d399";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2.5 sm:gap-3 sm:p-3">
      <div className="pointer-events-auto flex gap-1.5">
        <button type="button" onClick={onToggleRail} aria-label="Toggle layers" title="Layers (L)" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel/90 text-dim backdrop-blur hover:text-ink">
          <Layers size={16} />
        </button>
      </div>

      <div ref={wrap} className="pointer-events-auto relative min-w-0 flex-1 sm:max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) onHit(hits[0]);
            if (e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Search a place, a vessel, or investigate a domain, IP or email"
          aria-label="Search"
          autoComplete="off"
          spellCheck={false}
          className="h-10 w-full rounded-xl border border-line bg-panel/90 pl-9 pr-9 text-sm outline-none backdrop-blur placeholder:text-faint focus:border-accent"
        />
        {searching ? <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-dim" /> : <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1 text-[10px] text-faint sm:block">/</kbd>}
        {focus && query.trim() ? (
          <ul className="absolute left-0 right-0 top-12 max-h-80 overflow-auto rounded-xl border border-line bg-panel2/95 py-1 shadow-xl backdrop-blur">
            {hits.length === 0 ? <li className="px-3 py-2 text-xs text-dim">{searching ? "Searching" : "No matches"}</li> : null}
            {hits.map((h) => (
              <li key={h.key}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onHit(h)} className="flex w-full flex-col px-3 py-2 text-left hover:bg-panel">
                  <span className="truncate text-sm">{h.label}</span>
                  <span className="truncate text-[11px] text-dim">{h.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="pointer-events-auto ml-auto hidden items-center gap-3 rounded-xl border border-line bg-panel/90 px-3 py-1.5 backdrop-blur md:flex">
        <Clock />
        <div className="hidden h-7 w-px bg-line lg:block" />
        <div className="flex items-center gap-1.5 text-xs" title={space ? `Planetary Kp index ${kp ?? "unknown"}: geomagnetic ${space.scale}` : "Space weather loading"}>
          <Sun size={14} style={{ color: kpColor }} />
          <span className="tabular-nums text-ink">Kp {kp === null ? "n/a" : kp.toFixed(1)}</span>
        </div>
        <div className="h-7 w-px bg-line" />
        <div className="flex items-center gap-1.5 text-xs" title="Entities currently on the map">
          <Satellite size={14} className="text-accent" />
          <span className="tabular-nums text-ink">{entityCount.toLocaleString()}</span>
          <span className="text-dim">tracked</span>
        </div>
      </div>

      <div className="pointer-events-auto hidden rounded-xl border border-line bg-panel/90 p-1 backdrop-blur sm:flex" role="group" aria-label="Map mode">
        {MODES.map((m) => (
          <button key={m.id} type="button" onClick={() => onMode(m.id)} aria-pressed={mode === m.id} title={`${m.label} (${m.key})`} className={clsx("rounded-lg px-2.5 py-1.5 text-xs transition-colors", mode === m.id ? "bg-accent/15 text-accent" : "text-dim hover:text-ink")}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="pointer-events-auto flex gap-1.5">
        <button type="button" onClick={onAlerts} aria-label="Area alerts" title="Area alerts" className={clsx("relative grid h-10 w-10 place-items-center rounded-xl border bg-panel/90 backdrop-blur hover:text-ink", alertCount > 0 ? "border-bad/60 text-bad" : "border-line text-dim")}>
          <Bell size={16} />
          {alertCount > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">{alertCount > 99 ? "99+" : alertCount}</span> : null}
        </button>
        <button type="button" onClick={onShare} aria-label="Copy a link to this view" title="Copy link to this view" className="hidden h-10 items-center gap-1.5 rounded-xl border border-line bg-panel/90 px-3 text-xs text-dim backdrop-blur hover:text-ink sm:flex">
          <Link2 size={14} /> {copied ? "Copied" : "Share"}
        </button>
        <button type="button" onClick={onPalette} aria-label="Command palette" title="Command palette (Ctrl K)" className="hidden h-10 w-10 place-items-center rounded-xl border border-line bg-panel/90 text-dim backdrop-blur hover:text-ink lg:grid">
          <Command size={15} />
        </button>
        <button type="button" onClick={onHelp} aria-label="Keyboard shortcuts" title="Shortcuts (?)" className="hidden h-10 w-10 place-items-center rounded-xl border border-line bg-panel/90 text-dim backdrop-blur hover:text-ink lg:grid">
          <HelpCircle size={15} />
        </button>
        <button type="button" onClick={onToggleDock} aria-label="Toggle panels" title="Panels (D)" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-panel/90 text-dim backdrop-blur hover:text-ink">
          <PanelRight size={16} />
        </button>
      </div>
    </div>
  );
}
