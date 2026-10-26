"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";
import { GlobeControl, Map as MapLibreMap, Marker, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoCollection, GeoFeature } from "@/lib/layers/geo";
import { ringCentroid, type Position } from "@/lib/layers/geo";
import type { GeoEventProps, LayerId } from "@/lib/types";
import { LAYER_STYLE, timeAgo } from "@/lib/ui";
import { usePolling } from "@/lib/usePolling";
import { Dot, Empty, Panel } from "./ui";

// Served from /public (copied from the installed package) so the bundler never has to resolve the worker.
setWorkerUrl("/maplibre-gl-worker.mjs");

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const WINDOWS = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];
const LAYER_IDS: LayerId[] = ["quakes", "disasters", "alerts", "aircraft"];
const AIRCRAFT_MIN_ZOOM = 7;

interface LayerPayload {
  layer: LayerId;
  fetchedAt: string;
  stale: boolean;
  count: number;
  data: GeoCollection;
}

export interface Pin {
  lat: number;
  lon: number;
  label: string;
}

const EMPTY: GeoCollection = { type: "FeatureCollection", features: [] };

function featureCenter(f: GeoFeature): Position | null {
  if (f.geometry.type === "Point") return f.geometry.coordinates;
  const coords = f.geometry.coordinates as unknown;
  const ring = f.geometry.type === "Polygon" ? (coords as Position[][])[0] : (coords as Position[][][])[0]?.[0];
  return ring ? ringCentroid(ring) : null;
}

function popupContent(p: GeoEventProps): HTMLElement {
  const root = document.createElement("div");
  root.style.maxWidth = "260px";
  const tag = document.createElement("div");
  tag.textContent = LAYER_STYLE[p.layer]?.label ?? p.layer;
  tag.style.cssText = `font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${LAYER_STYLE[p.layer]?.color ?? "#8798ad"}`;
  const title = document.createElement("div");
  title.textContent = p.title;
  title.style.cssText = "font-weight:600;font-size:14px;margin-top:4px;line-height:1.3";
  root.append(tag, title);
  if (p.detail) {
    const d = document.createElement("div");
    d.textContent = String(p.detail);
    d.style.cssText = "font-size:12px;color:#8798ad;margin-top:4px;line-height:1.4";
    root.append(d);
  }
  const meta = document.createElement("div");
  meta.textContent = `${p.source}${p.time ? ` · ${timeAgo(p.time)}` : ""}`;
  meta.style.cssText = "font-size:11px;color:#56667a;margin-top:6px";
  root.append(meta);
  if (p.url && /^https?:\/\//i.test(p.url)) {
    const a = document.createElement("a");
    a.href = p.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open source record";
    a.style.cssText = "display:inline-block;margin-top:6px;font-size:12px;color:#38bdf8";
    root.append(a);
  }
  return root;
}

export default function MapExplorer({ pin }: { pin: Pin | null }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<Set<LayerId>>(new Set(["quakes", "disasters", "alerts", "aircraft"]));
  const [hours, setHours] = useState(24);
  const [view, setView] = useState<{ zoom: number; bbox: string | null }>({ zoom: 1.6, bbox: null });

  const quakes = usePolling<LayerPayload>(enabled.has("quakes") ? "/api/layers/quakes" : null, 60_000);
  const disasters = usePolling<LayerPayload>(enabled.has("disasters") ? "/api/layers/disasters" : null, 300_000);
  const alerts = usePolling<LayerPayload>(enabled.has("alerts") ? "/api/layers/alerts" : null, 300_000);
  const aircraftUrl = enabled.has("aircraft") && view.zoom >= AIRCRAFT_MIN_ZOOM && view.bbox ? `/api/layers/aircraft?${view.bbox}` : null;
  const aircraft = usePolling<LayerPayload>(aircraftUrl, 20_000);

  const payloads: Record<LayerId, ReturnType<typeof usePolling<LayerPayload>>> = { quakes, disasters, alerts, aircraft };

  const filtered = useMemo(() => {
    const out = {} as Record<LayerId, GeoCollection>;
    for (const id of LAYER_IDS) {
      const data = enabled.has(id) ? payloads[id].data?.data : undefined;
      const now = payloads[id].updatedAt ?? 0;
      const cutoff = now - hours * 3_600_000;
      if (!data) {
        out[id] = EMPTY;
        continue;
      }
      if (id === "aircraft") {
        out[id] = data;
        continue;
      }
      out[id] = {
        type: "FeatureCollection",
        features: data.features.filter((f) => {
          if (id === "alerts") {
            const exp = Date.parse(String(f.properties.expires ?? ""));
            return !Number.isFinite(exp) || exp > now;
          }
          const t = f.properties.time ? Date.parse(f.properties.time) : NaN;
          return !Number.isFinite(t) || t >= cutoff;
        }),
      };
    }
    return out;
    // payloads is rebuilt every render; its data fields drive recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quakes.data, disasters.data, alerts.data, aircraft.data, enabled, hours]);

  // Create the map once.
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const map = new MapLibreMap({ container: el, style: STYLE_URL, center: [10, 24], zoom: 1.6, minZoom: 1, attributionControl: { compact: true }, cooperativeGestures: false });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new GlobeControl(), "top-right");

    const syncView = () => {
      const b = map.getBounds();
      const q = new URLSearchParams({ south: b.getSouth().toFixed(2), west: Math.max(-180, b.getWest()).toFixed(2), north: b.getNorth().toFixed(2), east: Math.min(180, b.getEast()).toFixed(2) });
      setView({ zoom: map.getZoom(), bbox: q.toString() });
    };

    map.on("load", () => {
      for (const id of LAYER_IDS) map.addSource(id, { type: "geojson", data: EMPTY as never });
      map.addSource("pin", { type: "geojson", data: EMPTY as never });

      map.addLayer({ id: "alerts-fill", type: "fill", source: "alerts", paint: { "fill-color": "#a78bfa", "fill-opacity": ["interpolate", ["linear"], ["get", "severity"], 0.2, 0.1, 1, 0.38] } });
      map.addLayer({ id: "alerts-line", type: "line", source: "alerts", paint: { "line-color": "#a78bfa", "line-width": 1, "line-opacity": 0.7 } });
      map.addLayer({
        id: "quakes",
        type: "circle",
        source: "quakes",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "magnitude"], 1, 2.5, 3, 4, 5, 9, 7, 20],
          "circle-color": ["interpolate", ["linear"], ["get", "severity"], 0.1, "#fde68a", 0.45, "#f5a524", 0.7, "#f43f5e"],
          "circle-opacity": 0.78,
          "circle-stroke-color": "#060a10",
          "circle-stroke-width": 0.8,
        },
      });
      map.addLayer({ id: "disasters", type: "circle", source: "disasters", paint: { "circle-radius": 6, "circle-color": "#f43f5e", "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
      map.addLayer({
        id: "aircraft",
        type: "circle",
        source: "aircraft",
        paint: {
          "circle-radius": ["case", ["==", ["get", "emergency"], true], 7, 2.6],
          "circle-color": ["case", ["==", ["get", "emergency"], true], "#f43f5e", "#38bdf8"],
          "circle-opacity": 0.9,
          "circle-stroke-color": ["case", ["==", ["get", "emergency"], true], "#ffffff", "#060a10"],
          "circle-stroke-width": ["case", ["==", ["get", "emergency"], true], 1.5, 0.4],
        },
      });
      map.addLayer({ id: "pin-halo", type: "circle", source: "pin", paint: { "circle-radius": 16, "circle-color": "#2dd4bf", "circle-opacity": 0.2 } });
      map.addLayer({ id: "pin-dot", type: "circle", source: "pin", paint: { "circle-radius": 6, "circle-color": "#2dd4bf", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });

      const interactive = ["quakes", "disasters", "aircraft", "alerts-fill"];
      map.on("click", (e: MapMouseEvent) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: interactive });
        const first = hits[0];
        if (!first) return;
        const props = first.properties as unknown as GeoEventProps & { emergency?: boolean };
        popupRef.current?.remove();
        popupRef.current = new Popup({ closeButton: true, offset: 10, maxWidth: "300px" }).setLngLat(e.lngLat).setDOMContent(popupContent(props)).addTo(map);
      });
      for (const layer of interactive) {
        map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
      }
      syncView();
      setReady(true);
    });
    map.on("error", (ev) => {
      if (!map.isStyleLoaded() && !map.getLayer("quakes")) setMapError(ev.error?.message ? "The basemap could not be loaded. Data layers may still be available once it recovers." : "The basemap could not be loaded.");
    });

    let timer: ReturnType<typeof setTimeout> | null = null;
    map.on("moveend", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(syncView, 400);
    });

    return () => {
      if (timer) clearTimeout(timer);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Push data into the sources.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of LAYER_IDS) (map.getSource(id) as GeoJSONSource | undefined)?.setData(filtered[id] as never);
  }, [filtered, ready]);

  // Layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const vis = (on: boolean) => (on ? "visible" : "none");
    map.setLayoutProperty("quakes", "visibility", vis(enabled.has("quakes")));
    map.setLayoutProperty("disasters", "visibility", vis(enabled.has("disasters")));
    map.setLayoutProperty("aircraft", "visibility", vis(enabled.has("aircraft")));
    map.setLayoutProperty("alerts-fill", "visibility", vis(enabled.has("alerts")));
    map.setLayoutProperty("alerts-line", "visibility", vis(enabled.has("alerts")));
  }, [enabled, ready]);

  // Investigation pin from the graph.
  const pinMarker = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pin) return;
    (map.getSource("pin") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [pin.lon, pin.lat] } }] } as never);
    map.flyTo({ center: [pin.lon, pin.lat], zoom: 6, duration: 1600 });
    popupRef.current?.remove();
    const el = document.createElement("div");
    el.textContent = pin.label;
    el.style.cssText = "font-size:12px;font-weight:600";
    popupRef.current = new Popup({ closeButton: false, offset: 18 }).setLngLat([pin.lon, pin.lat]).setDOMContent(el).addTo(map);
    pinMarker.current = null;
  }, [pin, ready]);

  const feed = useMemo(() => {
    const items: Array<{ props: GeoEventProps; center: Position }> = [];
    for (const id of LAYER_IDS) {
      for (const f of filtered[id].features) {
        if (id === "aircraft" && !f.properties.emergency) continue;
        const center = featureCenter(f);
        if (center) items.push({ props: f.properties, center });
      }
    }
    return items.sort((a, b) => b.props.severity - a.props.severity || Date.parse(b.props.time ?? "") - Date.parse(a.props.time ?? "")).slice(0, 80);
  }, [filtered]);

  const toggle = (id: LayerId) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const fly = (center: Position, props: GeoEventProps) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center, zoom: Math.max(map.getZoom(), 5), duration: 1200 });
    popupRef.current?.remove();
    popupRef.current = new Popup({ offset: 10, maxWidth: "300px" }).setLngLat(center).setDOMContent(popupContent(props)).addTo(map);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem-3.25rem)] flex-col md:h-[calc(100vh-3.5rem)] md:flex-row">
      <aside className="order-2 flex max-h-[45vh] w-full shrink-0 flex-col gap-3 overflow-auto border-t border-line bg-bg/90 p-3 md:order-1 md:max-h-none md:w-[340px] md:border-r md:border-t-0">
        <Panel title="Layers">
          <ul className="divide-y divide-line">
            {LAYER_IDS.map((id) => {
              const st = payloads[id];
              const on = enabled.has(id);
              const needsZoom = id === "aircraft" && on && view.zoom < AIRCRAFT_MIN_ZOOM;
              return (
                <li key={id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-panel2/50">
                    <input type="checkbox" checked={on} onChange={() => toggle(id)} className="h-4 w-4 accent-[#2dd4bf]" />
                    <Dot color={LAYER_STYLE[id].color} />
                    <span className="text-sm">{LAYER_STYLE[id].label}</span>
                    <span className="ml-auto text-xs tabular-nums text-dim">
                      {!on ? "off" : needsZoom ? "zoom in" : st.error && !st.data ? "unavailable" : st.loading ? "loading" : `${filtered[id].features.length}`}
                    </span>
                  </label>
                  {on && st.error ? <p className="px-4 pb-2 text-[11px] text-warn">{st.data ? "Showing last good data. " : ""}{st.error}</p> : null}
                  {on && st.data?.stale ? <p className="px-4 pb-2 text-[11px] text-warn">Source is slow. Showing cached data from {timeAgo(st.data.fetchedAt)}.</p> : null}
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Time window">
          <div className="flex gap-1.5 p-3" role="group" aria-label="Time window">
            {WINDOWS.map((w) => (
              <button key={w.hours} type="button" onClick={() => setHours(w.hours)} aria-pressed={hours === w.hours} className={clsx("flex-1 rounded-lg border px-2 py-1.5 text-xs", hours === w.hours ? "border-accent bg-accent/10 text-accent" : "border-line text-dim hover:text-ink")}>
                {w.label}
              </button>
            ))}
          </div>
          <p className="px-4 pb-3 text-[11px] text-faint">Applies to earthquakes and natural events. Alerts show while active. Aircraft are always live.</p>
        </Panel>

        <Panel title={`Priority feed (${feed.length})`} className="min-h-0 flex-1">
          {feed.length === 0 ? (
            <Empty title="Nothing in this window" hint="Widen the time window or enable more layers." />
          ) : (
            <ul className="divide-y divide-line">
              {feed.map(({ props, center }) => (
                <li key={props.id}>
                  <button type="button" onClick={() => fly(center, props)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-panel2/60">
                    <span className="mt-1.5"><Dot color={LAYER_STYLE[props.layer].color} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{props.title}</span>
                      <span className="block truncate text-[11px] text-dim">{props.detail ?? props.source}</span>
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-faint">{timeAgo(props.time)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </aside>

      <div className="relative order-1 min-h-[300px] flex-1 md:order-2">
        <div ref={container} className="absolute inset-0" style={{ position: "absolute", inset: 0 }} aria-label="Interactive world map" />
        {mapError ? <div className="absolute left-3 top-3 max-w-sm rounded-lg border border-warn/40 bg-panel2 px-3 py-2 text-xs text-warn">{mapError}</div> : null}
        {enabled.has("aircraft") && view.zoom < AIRCRAFT_MIN_ZOOM ? <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-line bg-panel2/95 px-3 py-1.5 text-xs text-dim">Zoom in to load live aircraft</div> : null}
      </div>
    </div>
  );
}
