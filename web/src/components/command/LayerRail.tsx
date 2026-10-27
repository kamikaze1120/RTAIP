"use client";

import clsx from "clsx";
import { AlertTriangle, Loader2 } from "lucide-react";
import { GROUP_ORDER, RAIL, SAT_GROUP_LABELS, type RailId } from "@/lib/layerConfig";
import type { LayerStatus } from "@/lib/useLayers";
import { SAT_GROUPS, type SatGroup } from "@/lib/satellites";
import { LAYER_STYLE } from "@/lib/ui";
import type { LayerId } from "@/lib/types";

const COLORS: Record<RailId, string> = {
  ...Object.fromEntries(Object.entries(LAYER_STYLE).map(([k, v]) => [k, v.color])),
  satellites: "#a78bfa",
  radar: "#38bdf8",
  terminator: "#64748b",
} as Record<RailId, string>;

export function LayerRail(props: {
  enabled: ReadonlySet<string>;
  onToggle: (id: RailId) => void;
  status: Record<LayerId, LayerStatus>;
  satGroups: ReadonlySet<SatGroup>;
  onSatGroup: (g: SatGroup) => void;
  satCount: number;
  satLoading: boolean;
  satErrors: number;
  radarError: string | null;
}) {
  return (
    <nav aria-label="Layers" className="pointer-events-auto flex max-h-full w-64 flex-col overflow-auto rounded-xl border border-line bg-panel/90 py-1 backdrop-blur">
      {GROUP_ORDER.map((group) => (
        <div key={group} className="border-b border-line/60 py-1 last:border-b-0">
          <h3 className="px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{group}</h3>
          {RAIL.filter((r) => r.group === group).map((r) => {
            const on = props.enabled.has(r.id);
            const st = r.id in props.status ? props.status[r.id as LayerId] : null;
            let right: React.ReactNode = null;
            if (on) {
              if (r.id === "satellites") right = props.satLoading ? <Loader2 size={12} className="animate-spin" /> : <span className="tabular-nums">{props.satCount.toLocaleString()}</span>;
              else if (r.id === "radar") right = props.radarError ? <AlertTriangle size={12} className="text-warn" /> : null;
              else if (st?.loading) right = <Loader2 size={12} className="animate-spin" />;
              else if (st?.error && st.count === 0) right = <AlertTriangle size={12} className="text-warn" />;
              else if (st?.note) right = <span className="text-[10px] text-faint">{st.note}</span>;
              else if (st && r.id !== "terminator") right = <span className="tabular-nums">{st.count.toLocaleString()}</span>;
            }
            return (
              <div key={r.id}>
                <button type="button" onClick={() => props.onToggle(r.id)} aria-pressed={on} title={st?.error ? `${r.hint}. ${st.error}` : r.hint} className={clsx("flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-panel2/70", on ? "text-ink" : "text-dim")}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border" style={{ background: on ? COLORS[r.id] : "transparent", borderColor: COLORS[r.id] }} />
                  <span className="truncate">{r.label}</span>
                  <span className="ml-auto flex items-center text-[11px] text-dim">{right}</span>
                </button>
                {on && st?.stale ? <p className="px-3 pb-1 text-[10px] text-warn">Source is slow, showing cached data</p> : null}
                {on && r.id === "radar" && props.radarError ? <p className="px-3 pb-1 text-[10px] text-warn">{props.radarError}</p> : null}
                {on && r.id === "satellites" ? (
                  <div className="flex flex-wrap gap-1 px-3 pb-2 pt-0.5">
                    {(Object.keys(SAT_GROUPS) as SatGroup[]).map((g) => (
                      <button key={g} type="button" onClick={() => props.onSatGroup(g)} aria-pressed={props.satGroups.has(g)} className={clsx("rounded-full border px-2 py-0.5 text-[10px]", props.satGroups.has(g) ? "border-[#a78bfa] bg-[#a78bfa]/15 text-[#ddd6fe]" : "border-line text-faint hover:text-dim")}>
                        {SAT_GROUP_LABELS[g]}
                      </button>
                    ))}
                    {props.satErrors > 0 ? <p className="w-full text-[10px] text-warn">{props.satErrors} group{props.satErrors === 1 ? "" : "s"} unavailable right now</p> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
