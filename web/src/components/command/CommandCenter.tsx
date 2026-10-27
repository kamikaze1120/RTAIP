"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import clsx from "clsx";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedItem } from "@/lib/feeds";
import { countByLayer, evaluateGeofences, featuresInArea, normalizeArea, type Area, type AreaAlert } from "@/lib/geofence";
import { AIRCRAFT_MIN_ZOOM, DEFAULT_ON, DEFAULT_SAT_GROUPS, MODES, type BaseMode, type RailId } from "@/lib/layerConfig";
import type { GeoFeature } from "@/lib/layers/geo";
import { ringCentroid, type Position } from "@/lib/layers/geo";
import { addLayers, addSources, applyMode, EMPTY, INTERACTIVE, LAYER_MAP, loadRadar, setVisible } from "@/lib/mapSetup";
import { registerIcons } from "@/lib/mapIcons";
import { buildSats, groundTrack, stateAt, type Sat } from "@/lib/satEngine";
import { SAT_GROUPS, type Omm, type SatGroup } from "@/lib/satellites";
import type { SpaceWeather } from "@/lib/spaceweather";
import { nightPolygon } from "@/lib/terminator";
import type { LayerId } from "@/lib/types";
import { useLayers, type View } from "@/lib/useLayers";
import { usePolling } from "@/lib/usePolling";
import { buildHash, parseHash } from "@/lib/viewState";
import { Dock, type IntelItem } from "./Dock";
import { Hud, type SearchHit } from "./Hud";
import { LayerRail } from "./LayerRail";
import { Ticker } from "./Ticker";
import type { DockTab, Pin, SatInfo, Selected } from "./types";

// Served from /public (copied from the installed package) so the bundler never has to resolve the worker.
setWorkerUrl("/maplibre-gl-worker.mjs");

const STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const AREAS_KEY = "rtaip.watchedAreas";
const MAX_SATS_PER_GROUP = 2500;
const SHORTCUTS: Array<[string, string]> = [
  ["G / M / S / N", "3D globe, 2D map, satellite imagery, night lights"],
  ["L", "Show or hide the layer list"],
  ["D", "Show or hide the side panels"],
  ["E", "Draw an area"],
  ["C", "Toggle traffic cameras"],
  ["/", "Search"],
  ["Esc", "Clear selection or cancel drawing"],
  ["?", "This help"],
];

const emptyFc = (features: unknown[] = []) => ({ type: "FeatureCollection", features }) as never;
const rectFeature = (a: { west: number; south: number; east: number; north: number }) => ({
  type: "Feature",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[a.west, a.south], [a.east, a.south], [a.east, a.north], [a.west, a.north], [a.west, a.south]]] },
});

function centerOf(f: GeoFeature): [number, number] | null {
  if (f.geometry.type === "Point") return f.geometry.coordinates;
  const coords = f.geometry.coordinates as unknown;
  const ring = f.geometry.type === "Polygon" ? (coords as Position[][])[0] : (coords as Position[][][])[0]?.[0];
  return ring ? ringCentroid(ring) : null;
}

function readAreas(): Area[] {
  try {
    const raw = JSON.parse(localStorage.getItem(AREAS_KEY) ?? "[]") as Area[];
    return Array.isArray(raw) ? raw.filter((a) => [a.west, a.south, a.east, a.north].every(Number.isFinite) && typeof a.id === "string") : [];
  } catch {
    return [];
  }
}

const INVESTIGATE_RE = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$|^\d{1,3}(?:\.\d{1,3}){3}$|^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function CommandCenter({ pin }: { pin: Pin | null }) {
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const firstSymbol = useRef<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const [init] = useState(() => parseHash(typeof window === "undefined" ? "" : window.location.hash));
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(init.layers ?? DEFAULT_ON));
  const [satGroups, setSatGroups] = useState<Set<SatGroup>>(() => new Set(init.sats ?? DEFAULT_SAT_GROUPS));
  const [mode, setMode] = useState<BaseMode>(init.mode ?? "globe");
  const [view, setView] = useState<View>({ zoom: init.zoom ?? 1.7, bbox: null });
  const [railOpen, setRailOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  const [dockOpen, setDockOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1100);
  const [tab, setTab] = useState<DockTab>("intel");
  const [selected, setSelected] = useState<Selected | null>(null);
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");

  const [drawing, setDrawing] = useState(false);
  const [area, setArea] = useState<Area | null>(null);
  const [watched, setWatched] = useState<Area[]>(readAreas);
  const drawingRef = useRef(false);
  const drawStart = useRef<[number, number] | null>(null);
  const [drawStarted, setDrawStarted] = useState(false);

  const [minute, setMinute] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setMinute(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { features, status } = useLayers(enabled, view);
  const space = usePolling<{ data: SpaceWeather }>("/api/spaceweather", 600_000);
  const feed = usePolling<{ items: FeedItem[] }>("/api/feed", 300_000);

  // Disabled layers keep their last data in the hooks, so hide them here.
  const visible = useMemo(() => {
    const out = {} as Record<LayerId, GeoFeature[]>;
    for (const id of Object.keys(features) as LayerId[]) {
      let list = enabled.has(id) ? features[id] : [];
      if (id === "alerts") {
        list = list.filter((f) => {
          const exp = Date.parse(String(f.properties.expires ?? ""));
          return !Number.isFinite(exp) || exp > minute;
        });
      }
      out[id] = list;
    }
    return out;
  }, [features, enabled, minute]);

  const index = useMemo(() => {
    const m = new Map<string, GeoFeature>();
    for (const list of Object.values(visible)) for (const f of list) m.set(f.properties.id, f);
    return m;
  }, [visible]);
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);

  // Satellites ---------------------------------------------------------------
  const satsRef = useRef(new Map<SatGroup, Sat[]>());
  const [satLoaded, setSatLoaded] = useState<Partial<Record<SatGroup, number | "error">>>({});
  const [satInfo, setSatInfo] = useState<SatInfo | null>(null);
  const selectedRef = useRef<Selected | null>(null);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!enabled.has("satellites")) return;
    const controller = new AbortController();
    for (const g of satGroups) {
      if (satsRef.current.has(g)) continue;
      void (async () => {
        try {
          const res = await fetch(`/api/satellites?group=${g}`, { signal: controller.signal });
          const body = (await res.json()) as { elements?: Omm[]; error?: string };
          if (!res.ok || !body.elements) throw new Error(body.error ?? `HTTP ${res.status}`);
          const sats = buildSats(g, body.elements).slice(0, MAX_SATS_PER_GROUP);
          satsRef.current.set(g, sats);
          setSatLoaded((s) => ({ ...s, [g]: sats.length }));
        } catch {
          if (!controller.signal.aborted) setSatLoaded((s) => ({ ...s, [g]: "error" }));
        }
      })();
    }
    return () => controller.abort();
  }, [enabled, satGroups]);

  const satCount = useMemo(() => {
    if (!enabled.has("satellites")) return 0;
    let n = 0;
    for (const g of satGroups) {
      const v = satLoaded[g];
      if (typeof v === "number") n += v;
    }
    return n;
  }, [enabled, satGroups, satLoaded]);
  const satLoading = enabled.has("satellites") && [...satGroups].some((g) => satLoaded[g] === undefined);
  const satErrors = enabled.has("satellites") ? [...satGroups].filter((g) => satLoaded[g] === "error").length : 0;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const tick = (): void => {
      const src = map.getSource("sats") as GeoJSONSource | undefined;
      if (!src) return;
      if (!enabled.has("satellites")) {
        src.setData(EMPTY as never);
        return;
      }
      const now = new Date();
      const out: unknown[] = [];
      let sel: SatInfo | null = null;
      const selNow = selectedRef.current;
      for (const g of satGroups) {
        for (const s of satsRef.current.get(g) ?? []) {
          const st = stateAt(s, now);
          if (!st) continue;
          out.push({ type: "Feature", geometry: { type: "Point", coordinates: [st.lon, st.lat] }, properties: { id: `sat:${s.id}`, satId: s.id, title: s.name, group: g } });
          if (selNow?.kind === "sat" && selNow.id === s.id) sel = { id: s.id, name: s.name, group: SAT_GROUPS[g].label, lon: st.lon, lat: st.lat, altKm: st.altKm, speedKms: st.speedKms, periodMin: s.periodMin, inclination: s.inclination };
        }
      }
      src.setData(emptyFc(out));
      setSatInfo(sel);
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [ready, enabled, satGroups, satLoaded]);

  // Ground track of the selected satellite.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("sat-track") as GeoJSONSource | undefined;
    if (!src) return;
    if (selected?.kind !== "sat") {
      src.setData(EMPTY as never);
      return;
    }
    for (const list of satsRef.current.values()) {
      const sat = list.find((s) => s.id === selected.id);
      if (sat) {
        src.setData(emptyFc(groundTrack(sat, new Date()).map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } }))));
        return;
      }
    }
  }, [selected, ready]);

  // Map ---------------------------------------------------------------------
  const writeHash = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    try {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${buildHash({ center: [c.lng, c.lat], zoom: map.getZoom(), layers: enabled, sats: satGroups, mode })}`);
    } catch {
      // History can be unavailable in sandboxed frames. Sharing is a convenience only.
    }
  }, [enabled, satGroups, mode]);
  const writeHashRef = useRef(writeHash);
  useEffect(() => {
    writeHashRef.current = writeHash;
  }, [writeHash]);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const map = new MapLibreMap({ container: el, style: STYLE_URL, center: init.center ?? [10, 24], zoom: init.zoom ?? 1.7, minZoom: 1, maxPitch: 70, attributionControl: { compact: true }, canvasContextAttributes: { antialias: true } });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");

    const syncView = (): void => {
      const b = map.getBounds();
      const q = new URLSearchParams({ south: b.getSouth().toFixed(2), west: Math.max(-180, b.getWest()).toFixed(2), north: b.getNorth().toFixed(2), east: Math.min(180, b.getEast()).toFixed(2) });
      setView({ zoom: map.getZoom(), bbox: q.toString() });
      writeHashRef.current();
    };

    map.on("load", () => {
      // Keep basemap labels above imagery by remembering the first label layer.
      firstSymbol.current = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
      registerIcons(map);
      addSources(map);
      addLayers(map);
      try {
        map.setSky({ "sky-color": "#0b1d33", "horizon-color": "#1b4f7a", "fog-color": "#060a10", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.4, "fog-ground-blend": 0.1, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] });
      } catch {
        // Older styles may not support sky. The globe still renders.
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
      timer = setTimeout(syncView, 350);
    });

    map.on("mousemove", (e: MapMouseEvent) => {
      if (drawingRef.current && drawStart.current) {
        const [lon1, lat1] = drawStart.current;
        const a = normalizeArea({ lon1, lat1, lon2: e.lngLat.lng, lat2: e.lngLat.lat });
        (map.getSource("area") as GeoJSONSource | undefined)?.setData(emptyFc([rectFeature(a)]));
        return;
      }
      const hit = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE.filter((id) => map.getLayer(id)) });
      map.getCanvas().style.cursor = drawingRef.current ? "crosshair" : hit.length ? "pointer" : "";
    });

    map.on("click", (e: MapMouseEvent) => {
      if (drawingRef.current) {
        if (!drawStart.current) {
          drawStart.current = [e.lngLat.lng, e.lngLat.lat];
          setDrawStarted(true);
          return;
        }
        const [lon1, lat1] = drawStart.current;
        drawStart.current = null;
        setDrawStarted(false);
        const a = normalizeArea({ lon1, lat1, lon2: e.lngLat.lng, lat2: e.lngLat.lat });
        if (a.east - a.west < 0.01 || a.north - a.south < 0.01) return;
        setArea(a);
        setDrawing(false);
        setDockOpen(true);
        setTab("area");
        return;
      }
      const layers = INTERACTIVE.filter((id) => map.getLayer(id));
      const hit = map.queryRenderedFeatures(e.point, { layers })[0];
      if (!hit) {
        setSelected(null);
        return;
      }
      const props = hit.properties as Record<string, unknown>;
      if (hit.layer.id === "cameras-point" || props.cluster) {
        if (props.cluster) {
          const src = map.getSource("cameras") as GeoJSONSource;
          void src.getClusterExpansionZoom(Number(props.cluster_id)).then((zoom) => map.easeTo({ center: (hit.geometry as unknown as { coordinates: [number, number] }).coordinates, zoom: zoom + 0.5 }));
          return;
        }
      }
      if (hit.layer.id === "sats") {
        setSelected({ kind: "sat", id: Number(props.satId), center: [e.lngLat.lng, e.lngLat.lat] });
        setDockOpen(true);
        setTab("selection");
        return;
      }
      const f = indexRef.current.get(String(props.id));
      if (!f) return;
      const c = centerOf(f) ?? [e.lngLat.lng, e.lngLat.lat];
      setSelected({ kind: "feature", id: f.properties.id, layer: f.properties.layer, center: c });
      setDockOpen(true);
      setTab("selection");
    });

    return () => {
      if (timer) clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // The map is created once. Mutable inputs flow through refs and the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base imagery and projection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyMode(map, mode, firstSymbol.current);
    writeHash();
  }, [mode, ready, writeHash]);

  // Layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const [id, layers] of Object.entries(LAYER_MAP)) setVisible(map, layers, enabled.has(id));
  }, [enabled, ready]);

  // Rain radar.
  const [radarError, setRadarError] = useState<string | null>(null);
  const radarOn = enabled.has("radar");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !radarOn) return;
    const controller = new AbortController();
    const load = (): void => {
      loadRadar(map, controller.signal).then(
        () => setRadarError(null),
        (err: unknown) => {
          if (!controller.signal.aborted) setRadarError(err instanceof Error ? err.message : "Radar unavailable");
        },
      );
    };
    load();
    const id = setInterval(load, 600_000);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [radarOn, ready]);

  // Day and night.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const update = (): void => {
      (map.getSource("terminator") as GeoJSONSource | undefined)?.setData(emptyFc([{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [nightPolygon(new Date())] } }]));
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [ready]);

  // Push data into the sources.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const id of Object.keys(visible) as LayerId[]) (map.getSource(id) as GeoJSONSource | undefined)?.setData(emptyFc(visible[id]));
  }, [visible, ready]);

  // Selection ring follows the selected item.
  const selectedFeature = selected?.kind === "feature" ? (index.get(selected.id) ?? null) : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const c = selected?.kind === "sat" ? (satInfo ? ([satInfo.lon, satInfo.lat] as [number, number]) : selected.center) : selectedFeature ? (centerOf(selectedFeature) ?? selected?.center) : null;
    (map.getSource("selection") as GeoJSONSource | undefined)?.setData(emptyFc(c ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } }] : []));
  }, [selected, selectedFeature, satInfo, ready]);

  // Area rectangle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource("area") as GeoJSONSource | undefined)?.setData(emptyFc(area ? [rectFeature(area)] : []));
  }, [area, ready]);

  // Investigation pin from the graph.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !pin) return;
    (map.getSource("pin") as GeoJSONSource | undefined)?.setData(emptyFc([{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [pin.lon, pin.lat] } }]));
    map.flyTo({ center: [pin.lon, pin.lat], zoom: 6, duration: 1600 });
  }, [pin, ready]);

  // Actions -------------------------------------------------------------------
  const fly = useCallback((center: [number, number], zoom = 6) => {
    mapRef.current?.flyTo({ center, zoom: Math.max(mapRef.current.getZoom(), zoom), duration: 1300, essential: true });
  }, []);

  const select = useCallback(
    (f: GeoFeature) => {
      const c = centerOf(f);
      if (!c) return;
      setSelected({ kind: "feature", id: f.properties.id, layer: f.properties.layer, center: c });
      setDockOpen(true);
      setTab("selection");
      fly(c, f.properties.layer === "zones" ? 4 : 7);
    },
    [fly],
  );

  const toggleLayer = useCallback((id: RailId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleSatGroup = useCallback((g: SatGroup) => {
    setSatGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }, []);

  const startDraw = useCallback(() => {
    drawStart.current = null;
    setDrawStarted(false);
    setArea(null);
    setDrawing((d) => !d);
    setDockOpen(true);
    setTab("area");
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(AREAS_KEY, JSON.stringify(watched));
    } catch {
      // Private mode or blocked storage: watched areas just last for this visit.
    }
  }, [watched]);

  const alerts = useMemo<AreaAlert[]>(() => evaluateGeofences(watched, visible), [watched, visible]);
  const areaCounts = useMemo(() => (area ? countByLayer(area, visible) : {}), [area, visible]);
  const areaCameras = useMemo(() => (area ? featuresInArea(area, visible.cameras) : []), [area, visible.cameras]);

  const exportArea = useCallback(() => {
    if (!area) return;
    const items = Object.values(visible).flatMap((list) => featuresInArea(area, list));
    const blob = new Blob([JSON.stringify({ type: "FeatureCollection", features: items }, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtaip-area-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [area, visible]);

  const share = useCallback(async () => {
    writeHash();
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  }, [writeHash]);

  // Priority events -----------------------------------------------------------
  const intel = useMemo<IntelItem[]>(() => {
    const out: IntelItem[] = [];
    const add = (f: GeoFeature, sub: string): void => {
      out.push({ id: f.properties.id, layer: f.properties.layer, title: f.properties.title, sub, severity: f.properties.severity, time: f.properties.time, center: centerOf(f) });
    };
    for (const f of visible.quakes) if (f.properties.severity >= 0.4) add(f, String(f.properties.detail ?? f.properties.source));
    for (const f of visible.disasters) add(f, String(f.properties.detail ?? f.properties.source));
    for (const f of visible.zones) add(f, String(f.properties.detail ?? "Conflict zone"));
    for (const f of visible.aircraft) if (f.properties.emergency) add(f, String(f.properties.detail ?? ""));
    for (const f of visible.military) if (f.properties.emergency) add(f, String(f.properties.detail ?? ""));
    for (const f of visible.alerts) if (f.properties.severity >= 0.8) add(f, String(f.properties.detail ?? f.properties.source));
    return out.sort((a, b) => b.severity - a.severity || Date.parse(b.time ?? "") - Date.parse(a.time ?? "")).slice(0, 60);
  }, [visible]);

  // Search --------------------------------------------------------------------
  const [geo, setGeo] = useState<Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setSearching(true);
      fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`, { signal: controller.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ results?: typeof geo }>) : { results: [] }))
        .then((b) => setGeo(b.results ?? []))
        .catch(() => {
          if (!controller.signal.aborted) setGeo([]);
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const lower = q.toLowerCase();
    const out: SearchHit[] = [];
    if (INVESTIGATE_RE.test(q)) out.push({ key: "investigate", label: `Investigate ${q}`, sub: "Map infrastructure, ownership and exposure", action: { type: "investigate", q } });
    if (lower.length >= 2) {
      let n = 0;
      for (const f of index.values()) {
        if (f.properties.layer === "fires" || f.properties.layer === "aurora") continue;
        if (f.properties.title.toLowerCase().includes(lower)) {
          out.push({ key: f.properties.id, label: f.properties.title, sub: `${f.properties.layer} · ${f.properties.source}`, action: { type: "feature", id: f.properties.id } });
          if (++n >= 6) break;
        }
      }
    }
    if (q.length >= 3) for (const g of geo) out.push({ key: `geo:${g.latitude}:${g.longitude}`, label: g.name, sub: [g.admin1, g.country].filter(Boolean).join(", "), action: { type: "place", lon: g.longitude, lat: g.latitude } });
    return out;
  }, [query, geo, index]);

  const onHit = useCallback(
    (h: SearchHit) => {
      setQuery("");
      if (h.action.type === "investigate") router.push(`/investigate?q=${encodeURIComponent(h.action.q)}`);
      else if (h.action.type === "place") fly([h.action.lon, h.action.lat], 8);
      else {
        const f = indexRef.current.get(h.action.id);
        if (f) select(f);
      }
    },
    [router, fly, select],
  );

  // Keyboard ------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const modeKey = MODES.find((m) => m.key.toLowerCase() === k);
      if (modeKey) setMode(modeKey.id);
      else if (k === "l") setRailOpen((v) => !v);
      else if (k === "d") setDockOpen((v) => !v);
      else if (k === "e") startDraw();
      else if (k === "c") toggleLayer("cameras");
      else if (k === "?") setHelp((v) => !v);
      else if (k === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (k === "escape") {
        setSelected(null);
        setHelp(false);
        if (drawingRef.current) {
          drawStart.current = null;
          setDrawStarted(false);
          setDrawing(false);
          (mapRef.current?.getSource("area") as GeoJSONSource | undefined)?.setData(emptyFc());
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startDraw, toggleLayer]);

  const entityCount = useMemo(() => {
    let n = satCount;
    for (const id of Object.keys(visible) as LayerId[]) if (id !== "zones" && id !== "ports" && id !== "aurora") n += visible[id].length;
    return n;
  }, [visible, satCount]);

  const selectedSat = selected?.kind === "sat" ? satInfo : null;

  return (
    <div className="relative h-[calc(100dvh-3.5rem-3.25rem)] overflow-hidden bg-bg md:h-[calc(100dvh-3.5rem)]">
      <div ref={container} className="absolute inset-0" style={{ position: "absolute", inset: 0 }} aria-label="Interactive world map" />

      <Hud
        mode={mode}
        onMode={setMode}
        space={space.data?.data ?? null}
        entityCount={entityCount}
        alertCount={alerts.length}
        hits={hits}
        onHit={onHit}
        searching={searching}
        query={query}
        onQuery={setQuery}
        onToggleRail={() => setRailOpen((v) => !v)}
        onToggleDock={() => setDockOpen((v) => !v)}
        onAlerts={() => {
          setDockOpen(true);
          setTab("alerts");
        }}
        onShare={() => void share()}
        onHelp={() => setHelp(true)}
        onPalette={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
        searchRef={searchRef}
        copied={copied}
      />

      {railOpen ? (
        <div className="pointer-events-none absolute bottom-9 left-3 top-16 z-10 flex flex-col gap-2">
          <div className="pointer-events-auto flex rounded-xl border border-line bg-panel/90 p-1 backdrop-blur sm:hidden" role="group" aria-label="Map mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id} className={clsx("flex-1 rounded-lg px-1 py-1.5 text-[11px]", mode === m.id ? "bg-accent/15 text-accent" : "text-dim")}>
                {m.label}
              </button>
            ))}
          </div>
          <LayerRail enabled={enabled} onToggle={toggleLayer} status={status} satGroups={satGroups} onSatGroup={toggleSatGroup} satCount={satCount} satLoading={satLoading} satErrors={satErrors} radarError={radarError} />
        </div>
      ) : null}

      {dockOpen ? (
        <div className="pointer-events-none absolute bottom-9 right-3 top-16 z-10 flex">
          <Dock
            tab={tab}
            onTab={setTab}
            alertCount={alerts.length}
            intel={{ items: intel, news: feed.data?.items ?? [], selectedZones: zoneFilter, onZone: setZoneFilter, onPick: (i) => { const f = index.get(i.id); if (f) select(f); else if (i.center) fly(i.center); } }}
            selection={{ feature: selectedFeature, sat: selectedSat, selected, onClear: () => setSelected(null), onFly: fly }}
            area={{ area, counts: areaCounts, cameras: areaCameras, watched, drawing, onDraw: startDraw, onClear: () => setArea(null), onWatch: () => {
              if (area) setWatched((w) => (w.some((x) => x.id === area.id) ? w : [...w, area]));
            }, onUnwatch: (id) => setWatched((w) => w.filter((x) => x.id !== id)), onExport: exportArea, onPickCamera: select, onFlyArea: (a) => { setArea(a); mapRef.current?.fitBounds([[a.west, a.south], [a.east, a.north]], { padding: 60, duration: 1200 }); } }}
            alerts={{ alerts, onPick: (a) => { const f = index.get(a.id.slice(a.areaId.length + 1)); if (f) select(f); } }}
          />
        </div>
      ) : null}

      {pin ? <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full border border-accent/50 bg-panel2/95 px-3 py-1 text-xs text-accent">Pinned: {pin.label}</div> : null}
      {drawing ? <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full border border-accent bg-panel2/95 px-3 py-1.5 text-xs text-ink">{drawStarted ? "Click the opposite corner" : "Click the first corner of the area. Esc to cancel"}</div> : null}
      {enabled.has("aircraft") && view.zoom < AIRCRAFT_MIN_ZOOM ? <div className="pointer-events-none absolute bottom-12 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line bg-panel2/95 px-3 py-1.5 text-xs text-dim">Zoom in to load civil aircraft for the visible area</div> : null}
      {mapError ? <div className="absolute left-3 top-16 z-10 max-w-sm rounded-lg border border-warn/40 bg-panel2 px-3 py-2 text-xs text-warn">{mapError}</div> : null}

      <Ticker items={feed.data?.items ?? []} error={feed.error} />

      {help ? (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/60 p-4" onClick={() => setHelp(false)} role="dialog" aria-label="Keyboard shortcuts">
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-sm font-semibold">Keyboard shortcuts</h2>
            <dl className="divide-y divide-line/60">
              {SHORTCUTS.map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <dt><kbd className="rounded border border-line bg-panel2 px-1.5 py-0.5 font-mono text-xs">{k}</kbd></dt>
                  <dd className="text-right text-dim">{d}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
