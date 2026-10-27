"use client";

import clsx from "clsx";
import { Bell, Camera, Crosshair, Download, ExternalLink, Eye, Satellite, Search, SquareDashed, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FeedItem } from "@/lib/feeds";
import type { Area, AreaAlert } from "@/lib/geofence";
import type { GeoFeature } from "@/lib/layers/geo";
import { orbitClass } from "@/lib/satEngine";
import type { LayerId } from "@/lib/types";
import { LAYER_STYLE, timeAgo } from "@/lib/ui";
import { Dot } from "../ui";
import type { DockTab, SatInfo, Selected } from "./types";

const HIDDEN_PROPS = new Set(["id", "layer", "title", "severity", "time", "source", "url", "detail", "imageUrl", "videoUrl", "heading"]);
const PROP_LABELS: Record<string, string> = { altitudeM: "Altitude (m)", speedMs: "Speed (m/s)", magnitude: "Magnitude", squawk: "Squawk", country: "Country" };

function point(f: GeoFeature): [number, number] | null {
  return f.geometry.type === "Point" ? f.geometry.coordinates : null;
}

export function CameraViewer({ feature }: { feature: GeoFeature }) {
  const base = String(feature.properties.imageUrl ?? "");
  const [tick, setTick] = useState(() => Date.now());
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);
  if (!/^https:\/\//.test(base)) return null;
  const src = `${base}${base.includes("?") ? "&" : "?"}t=${tick}`;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-black">
      {failed === base ? (
        <div className="grid h-40 place-items-center px-4 text-center text-xs text-dim">This camera is not returning an image right now.</div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`Live view: ${feature.properties.title}`} referrerPolicy="no-referrer" onError={() => setFailed(base)} onLoad={() => setFailed(null)} className="aspect-video w-full object-cover" />
      )}
      <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[10px] text-faint">
        <span>Refreshes every 10 seconds</span>
        {feature.properties.videoUrl ? <a href={String(feature.properties.videoUrl)} target="_blank" rel="noopener noreferrer" className="text-accent2 hover:underline">Open stream</a> : null}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <dt className="text-dim">{k}</dt>
      <dd className="truncate text-right font-mono text-ink">{v}</dd>
    </div>
  );
}

function SelectionPanel({ feature, sat, selected, onClear, onFly }: { feature: GeoFeature | null; sat: SatInfo | null; selected: Selected | null; onClear: () => void; onFly: (c: [number, number], zoom?: number) => void }) {
  if (!selected) return <div className="px-4 py-10 text-center text-sm text-dim">Click anything on the map to see its details.<p className="mt-1 text-xs text-faint">Aircraft, ships, satellites, cameras, quakes, fires and more.</p></div>;
  if (selected.kind === "sat") {
    if (!sat) return <div className="px-4 py-10 text-center text-sm text-dim">Satellite not in the loaded set.</div>;
    return (
      <div className="space-y-3 p-4">
        <Head color="#a78bfa" tag="Satellite" title={sat.name} onClear={onClear} />
        <dl className="divide-y divide-line/60">
          <Row k="NORAD ID" v={String(sat.id)} />
          <Row k="Group" v={sat.group} />
          <Row k="Orbit" v={orbitClass(sat.altKm)} />
          <Row k="Altitude" v={`${sat.altKm.toFixed(0)} km`} />
          <Row k="Speed" v={`${sat.speedKms.toFixed(2)} km/s`} />
          <Row k="Period" v={`${sat.periodMin.toFixed(1)} min`} />
          <Row k="Inclination" v={`${sat.inclination.toFixed(1)} degrees`} />
          <Row k="Position" v={`${sat.lat.toFixed(2)}, ${sat.lon.toFixed(2)}`} />
        </dl>
        <p className="text-[11px] text-faint">Computed in your browser from public orbital elements (CelesTrak). The dashed line is the next 100 minutes of ground track.</p>
        <button type="button" onClick={() => onFly([sat.lon, sat.lat], 3)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-dim hover:text-ink"><Crosshair size={12} /> Center on satellite</button>
      </div>
    );
  }
  if (!feature) return <div className="px-4 py-10 text-center text-sm text-dim">This item is no longer in the live data.<button type="button" onClick={onClear} className="mt-2 block w-full text-xs text-accent hover:underline">Clear</button></div>;
  const p = feature.properties;
  const style = LAYER_STYLE[p.layer];
  const extras = Object.entries(p).filter(([k, v]) => !HIDDEN_PROPS.has(k) && v !== null && v !== undefined && typeof v !== "object" && v !== "");
  const c = point(feature);
  return (
    <div className="space-y-3 p-4">
      <Head color={style.color} tag={style.label} title={p.title} onClear={onClear} />
      {p.detail ? <p className="text-sm text-dim">{String(p.detail)}</p> : null}
      {p.layer === "cameras" ? <CameraViewer feature={feature} /> : null}
      {extras.length > 0 ? (
        <dl className="divide-y divide-line/60">
          {extras.slice(0, 12).map(([k, v]) => (
            <Row key={k} k={PROP_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())} v={typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v)} />
          ))}
        </dl>
      ) : null}
      <div className="text-[11px] text-faint">{p.source}{p.time ? ` · ${timeAgo(p.time)}` : ""}</div>
      <div className="flex flex-wrap gap-2">
        {c ? <button type="button" onClick={() => onFly(c, 8)} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-dim hover:text-ink"><Crosshair size={12} /> Zoom to</button> : null}
        {p.layer === "cyber" ? <Link href={`/investigate?q=${encodeURIComponent(String(p.ip ?? p.title))}`} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-bg"><Search size={12} /> Investigate</Link> : null}
        {p.url && /^https?:\/\//i.test(p.url) ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-accent2 hover:underline"><ExternalLink size={12} /> Source record</a> : null}
      </div>
    </div>
  );
}

function Head({ color, tag, title, onClear }: { color: string; tag: string; title: string; onClear: () => void }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>{tag}</div>
        <h3 className="break-words text-base font-semibold leading-snug">{title}</h3>
      </div>
      <button type="button" onClick={onClear} aria-label="Clear selection" className="ml-auto shrink-0 rounded p-1 text-faint hover:text-ink"><X size={14} /></button>
    </div>
  );
}

export interface IntelItem {
  id: string;
  layer: LayerId;
  title: string;
  sub: string;
  severity: number;
  time: string | null;
  center: [number, number] | null;
}

function IntelPanel({ items, news, onPick, selectedZones, onZone }: { items: IntelItem[]; news: FeedItem[]; onPick: (i: IntelItem) => void; selectedZones: string | null; onZone: (z: string | null) => void }) {
  const shownNews = news.filter((n) => (selectedZones ? n.zones.includes(selectedZones) : true)).slice(0, 30);
  return (
    <div>
      <h3 className="sticky top-0 border-b border-line bg-panel px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Priority events ({items.length})</h3>
      {items.length === 0 ? <p className="px-4 py-6 text-center text-xs text-dim">Nothing urgent on the enabled layers.</p> : null}
      <ul className="divide-y divide-line/60">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onPick(i)} className="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-panel2/60">
              <span className="mt-1.5"><Dot color={LAYER_STYLE[i.layer].color} /></span>
              <span className="min-w-0">
                <span className="block truncate text-sm">{i.title}</span>
                <span className="block truncate text-[11px] text-dim">{i.sub}</span>
              </span>
              <span className="ml-auto shrink-0 text-[11px] text-faint">{i.time ? timeAgo(i.time) : ""}</span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="sticky top-0 flex items-center justify-between border-y border-line bg-panel px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
        Headlines
        {selectedZones ? <button type="button" onClick={() => onZone(null)} className="normal-case tracking-normal text-accent">Clear zone filter</button> : null}
      </h3>
      {shownNews.length === 0 ? <p className="px-4 py-6 text-center text-xs text-dim">No headlines loaded.</p> : null}
      <ul className="divide-y divide-line/60">
        {shownNews.map((n) => (
          <li key={n.id}>
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 hover:bg-panel2/60">
              <span className="block text-sm leading-snug">{n.title}</span>
              <span className="block text-[11px] text-dim">{n.source} · {timeAgo(n.time)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AreaPanel(props: {
  area: Area | null;
  counts: Partial<Record<LayerId, number>>;
  cameras: GeoFeature[];
  watched: Area[];
  drawing: boolean;
  onDraw: () => void;
  onClear: () => void;
  onWatch: () => void;
  onUnwatch: (id: string) => void;
  onExport: () => void;
  onPickCamera: (f: GeoFeature) => void;
  onFlyArea: (a: Area) => void;
}) {
  const total = Object.values(props.counts).reduce((a, b) => a + (b ?? 0), 0);
  const isWatched = props.area ? props.watched.some((w) => w.id === props.area?.id) : false;
  return (
    <div className="space-y-4 p-4">
      {!props.area ? (
        <div className="rounded-lg border border-dashed border-line p-4 text-center">
          <SquareDashed size={20} className="mx-auto text-accent" />
          <p className="mt-2 text-sm">{props.drawing ? "Click two opposite corners on the map" : "Draw an area to see everything inside it"}</p>
          <button type="button" onClick={props.onDraw} className="mt-3 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg">{props.drawing ? "Cancel" : "Draw area (E)"}</button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold">{props.area.name}</h3>
            <button type="button" onClick={props.onClear} aria-label="Remove area" className="ml-auto rounded p-1 text-faint hover:text-ink"><X size={14} /></button>
          </div>
          <p className="text-xs text-dim">{total.toLocaleString()} tracked item{total === 1 ? "" : "s"} inside</p>
          <ul className="grid grid-cols-2 gap-2">
            {(Object.entries(props.counts) as Array<[LayerId, number]>).sort((a, b) => b[1] - a[1]).map(([id, n]) => (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs">
                <Dot color={LAYER_STYLE[id].color} /> <span className="truncate text-dim">{LAYER_STYLE[id].label}</span> <span className="ml-auto tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
          {props.cameras.length > 0 ? (
            <div>
              <h4 className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint"><Camera size={11} /> Cameras in this area</h4>
              <ul className="max-h-48 divide-y divide-line/60 overflow-auto rounded-lg border border-line">
                {props.cameras.slice(0, 40).map((c) => (
                  <li key={c.properties.id}><button type="button" onClick={() => props.onPickCamera(c)} className="w-full truncate px-3 py-1.5 text-left text-xs hover:bg-panel2/60">{c.properties.title}</button></li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={props.onWatch} disabled={isWatched} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-bg disabled:opacity-50"><Eye size={12} /> {isWatched ? "Watching" : "Watch for alerts"}</button>
            <button type="button" onClick={props.onExport} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-dim hover:text-ink"><Download size={12} /> Export GeoJSON</button>
            <button type="button" onClick={props.onDraw} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-dim hover:text-ink">Redraw</button>
          </div>
        </>
      )}
      {props.watched.length > 0 ? (
        <div>
          <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Watched areas</h4>
          <ul className="divide-y divide-line/60 rounded-lg border border-line">
            {props.watched.map((w) => (
              <li key={w.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <button type="button" onClick={() => props.onFlyArea(w)} className="min-w-0 flex-1 truncate text-left hover:text-accent">{w.name}</button>
                <button type="button" onClick={() => props.onUnwatch(w.id)} aria-label={`Stop watching ${w.name}`} className="text-faint hover:text-bad"><Trash2 size={12} /></button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-faint">Alerts fire while this page is open: aircraft emergencies, military aircraft, quakes M4 and up, severe natural events and active botnet servers.</p>
        </div>
      ) : null}
    </div>
  );
}

function AlertsPanel({ alerts, onPick }: { alerts: AreaAlert[]; onPick: (a: AreaAlert) => void }) {
  if (alerts.length === 0) return <div className="px-4 py-10 text-center text-sm text-dim">No alerts.<p className="mt-1 text-xs text-faint">Draw an area, choose Watch for alerts, and events inside it appear here.</p></div>;
  return (
    <ul className="divide-y divide-line/60">
      {alerts.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onPick(a)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-panel2/60">
            <span className="mt-1.5"><Dot color={a.severity === "critical" ? "#f43f5e" : a.severity === "warn" ? "#f5a524" : "#38bdf8"} pulse={a.severity === "critical"} /></span>
            <span className="min-w-0">
              <span className="block text-sm">{a.title}</span>
              <span className="block truncate text-[11px] text-dim">{a.areaName}{a.detail ? ` · ${a.detail}` : ""}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const TABS: Array<{ id: DockTab; label: string; icon: React.ReactNode }> = [
  { id: "intel", label: "Intel", icon: <Satellite size={13} /> },
  { id: "selection", label: "Selected", icon: <Crosshair size={13} /> },
  { id: "area", label: "Area", icon: <SquareDashed size={13} /> },
  { id: "alerts", label: "Alerts", icon: <Bell size={13} /> },
];

export function Dock(props: {
  tab: DockTab;
  onTab: (t: DockTab) => void;
  alertCount: number;
  intel: React.ComponentProps<typeof IntelPanel>;
  selection: React.ComponentProps<typeof SelectionPanel>;
  area: React.ComponentProps<typeof AreaPanel>;
  alerts: React.ComponentProps<typeof AlertsPanel>;
}) {
  return (
    <aside aria-label="Details" className="pointer-events-auto flex max-h-full w-[min(360px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-panel/92 backdrop-blur">
      <div role="tablist" className="flex shrink-0 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={props.tab === t.id} type="button" onClick={() => props.onTab(t.id)} className={clsx("flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs transition-colors", props.tab === t.id ? "border-accent text-ink" : "border-transparent text-dim hover:text-ink")}>
            {t.icon}
            {t.label}
            {t.id === "alerts" && props.alertCount > 0 ? <span className="rounded-full bg-bad px-1.5 text-[10px] text-white">{props.alertCount}</span> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {props.tab === "intel" ? <IntelPanel {...props.intel} /> : null}
        {props.tab === "selection" ? <SelectionPanel {...props.selection} /> : null}
        {props.tab === "area" ? <AreaPanel {...props.area} /> : null}
        {props.tab === "alerts" ? <AlertsPanel {...props.alerts} /> : null}
      </div>
    </aside>
  );
}
