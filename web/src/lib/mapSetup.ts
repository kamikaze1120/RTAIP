import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { BaseMode, RailId } from "./layerConfig";
import { LAYER_STYLE } from "./ui";

export const EMPTY = { type: "FeatureCollection", features: [] } as const;
const FONT = ["Montserrat Medium"];
const INK = "#060a10";

export const DATA_SOURCES = ["quakes", "disasters", "alerts", "aircraft", "military", "ships", "fires", "aurora", "cyber", "zones", "ports"] as const;

/** Which style layers belong to each rail toggle. */
export const LAYER_MAP: Record<RailId, string[]> = {
  quakes: ["quakes"],
  disasters: ["disasters"],
  alerts: ["alerts-fill", "alerts-line"],
  aircraft: ["aircraft"],
  military: ["military"],
  ships: ["ships"],
  fires: ["fires"],
  aurora: ["aurora"],
  cyber: ["cyber"],
  zones: ["zones-halo", "zones", "zones-label"],
  ports: ["ports", "ports-label"],
  cameras: ["cameras-cluster", "cameras-count", "cameras-point"],
  satellites: ["sat-track", "sats", "sats-label"],
  terminator: ["terminator"],
  radar: ["radar"],
};

export const INTERACTIVE = ["quakes", "disasters", "alerts-fill", "aircraft", "military", "ships", "fires", "cyber", "zones", "ports", "cameras-point", "sats"];

const col = (id: keyof typeof LAYER_STYLE): string => LAYER_STYLE[id].color;
const emergency: ExpressionSpecification = ["==", ["get", "emergency"], true];

export function addSources(map: MapLibreMap): void {
  for (const id of DATA_SOURCES) map.addSource(id, { type: "geojson", data: EMPTY as never });
  map.addSource("cameras", { type: "geojson", data: EMPTY as never, cluster: true, clusterRadius: 38, clusterMaxZoom: 11 });
  for (const id of ["sats", "sat-track", "terminator", "pin", "area", "selection"]) map.addSource(id, { type: "geojson", data: EMPTY as never });
}

export function addLayers(map: MapLibreMap): void {
  const label = (source: string, id: string, color: string, minzoom: number, size = 11) =>
    map.addLayer({
      id,
      type: "symbol",
      source,
      minzoom,
      layout: { "text-field": ["get", "title"], "text-font": FONT, "text-size": size, "text-offset": [0, 1.1], "text-anchor": "top", "text-optional": true, "text-max-width": 9 },
      paint: { "text-color": color, "text-halo-color": INK, "text-halo-width": 1.4 },
    });

  map.addLayer({ id: "terminator", type: "fill", source: "terminator", paint: { "fill-color": "#000814", "fill-opacity": 0.38 } });
  map.addLayer({ id: "alerts-fill", type: "fill", source: "alerts", paint: { "fill-color": col("alerts"), "fill-opacity": ["interpolate", ["linear"], ["get", "severity"], 0.2, 0.1, 1, 0.38] } });
  map.addLayer({ id: "alerts-line", type: "line", source: "alerts", paint: { "line-color": col("alerts"), "line-width": 1, "line-opacity": 0.7 } });
  map.addLayer({ id: "aurora", type: "circle", source: "aurora", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 5, 5, 26], "circle-color": col("aurora"), "circle-opacity": ["interpolate", ["linear"], ["get", "severity"], 0.2, 0.08, 1, 0.5], "circle-blur": 1 } });
  map.addLayer({ id: "fires", type: "circle", source: "fires", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 6, 3, 10, 6], "circle-color": ["interpolate", ["linear"], ["get", "severity"], 0, "#f59e0b", 0.4, "#ef4444", 1, "#fef08a"], "circle-opacity": 0.8, "circle-blur": 0.3 } });
  map.addLayer({ id: "zones-halo", type: "circle", source: "zones", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 14, 6, 46], "circle-color": col("zones"), "circle-opacity": ["interpolate", ["linear"], ["get", "severity"], 0.4, 0.1, 1, 0.26], "circle-blur": 0.7 } });
  map.addLayer({ id: "zones", type: "circle", source: "zones", paint: { "circle-radius": 5, "circle-color": col("zones"), "circle-stroke-color": "#fff", "circle-stroke-width": 1.2 } });
  label("zones", "zones-label", "#fecdd3", 2.2, 12);
  map.addLayer({ id: "ports", type: "circle", source: "ports", paint: { "circle-radius": 3.4, "circle-color": col("ports"), "circle-stroke-color": INK, "circle-stroke-width": 1 } });
  label("ports", "ports-label", "#bfdbfe", 3.6, 10);
  map.addLayer({
    id: "quakes",
    type: "circle",
    source: "quakes",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["get", "magnitude"], 1, 2.5, 3, 4, 5, 9, 7, 20],
      "circle-color": ["interpolate", ["linear"], ["get", "severity"], 0.1, "#fde68a", 0.45, "#f5a524", 0.7, "#f43f5e"],
      "circle-opacity": 0.78,
      "circle-stroke-color": INK,
      "circle-stroke-width": 0.8,
    },
  });
  map.addLayer({ id: "disasters", type: "circle", source: "disasters", paint: { "circle-radius": 6, "circle-color": col("disasters"), "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });
  map.addLayer({ id: "cyber", type: "circle", source: "cyber", paint: { "circle-radius": 5, "circle-color": col("cyber"), "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } });

  map.addLayer({ id: "cameras-cluster", type: "circle", source: "cameras", filter: ["has", "point_count"], paint: { "circle-radius": ["step", ["get", "point_count"], 13, 25, 17, 100, 22], "circle-color": "#1e293b", "circle-stroke-color": col("cameras"), "circle-stroke-width": 1.5 } });
  map.addLayer({ id: "cameras-count", type: "symbol", source: "cameras", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": FONT, "text-size": 11, "text-allow-overlap": true }, paint: { "text-color": "#f1f5f9" } });
  map.addLayer({ id: "cameras-point", type: "symbol", source: "cameras", filter: ["!", ["has", "point_count"]], layout: { "icon-image": "icon-camera", "icon-size": 0.55, "icon-allow-overlap": true }, paint: { "icon-color": col("cameras"), "icon-halo-color": INK, "icon-halo-width": 1 } });

  const moving = (id: "ships" | "aircraft" | "military", image: string, size: number, color: ExpressionSpecification | string) =>
    map.addLayer({
      id,
      type: "symbol",
      source: id,
      layout: { "icon-image": image, "icon-size": ["interpolate", ["linear"], ["zoom"], 2, size * 0.7, 8, size * 1.1], "icon-rotate": ["coalesce", ["get", "heading"], 0], "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true },
      paint: { "icon-color": color, "icon-halo-color": INK, "icon-halo-width": 1 },
    });
  moving("ships", "icon-ship", 0.34, col("ships"));
  moving("aircraft", "icon-plane", 0.42, ["case", emergency, "#f43f5e", col("aircraft")]);
  moving("military", "icon-plane", 0.5, ["case", emergency, "#f43f5e", col("military")]);

  map.addLayer({ id: "sat-track", type: "line", source: "sat-track", paint: { "line-color": "#a78bfa", "line-width": 1.4, "line-opacity": 0.85, "line-dasharray": [2, 2] } });
  map.addLayer({ id: "sats", type: "symbol", source: "sats", layout: { "icon-image": "icon-sat", "icon-size": 0.4, "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-color": "#c4b5fd", "icon-halo-color": INK, "icon-halo-width": 1 } });
  label("sats", "sats-label", "#ddd6fe", 3.2, 10);

  map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#2dd4bf", "fill-opacity": 0.1 } });
  map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#2dd4bf", "line-width": 1.6, "line-dasharray": [3, 2] } });
  map.addLayer({ id: "pin-halo", type: "circle", source: "pin", paint: { "circle-radius": 16, "circle-color": "#2dd4bf", "circle-opacity": 0.2 } });
  map.addLayer({ id: "pin-dot", type: "circle", source: "pin", paint: { "circle-radius": 6, "circle-color": "#2dd4bf", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
  map.addLayer({ id: "selection", type: "circle", source: "selection", paint: { "circle-radius": 14, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#2dd4bf", "circle-stroke-width": 2 } });
}

export function setVisible(map: MapLibreMap, ids: string[], on: boolean): void {
  for (const id of ids) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

function yesterday(): string {
  return new Date(Date.now() - 36 * 3_600_000).toISOString().slice(0, 10);
}

/** Switches the projection and the imagery under the labels. `beforeId` is the first basemap label layer. */
export function applyMode(map: MapLibreMap, mode: BaseMode, beforeId: string | undefined): void {
  map.setProjection({ type: mode === "flat" ? "mercator" : "globe" });
  if (map.getLayer("imagery")) map.removeLayer("imagery");
  if (map.getSource("imagery")) map.removeSource("imagery");
  if (mode === "sat" || mode === "night") {
    const tiles =
      mode === "sat"
        ? [`${GIBS}/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${yesterday()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`]
        : [`${GIBS}/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`];
    map.addSource("imagery", { type: "raster", tiles, tileSize: 256, maxzoom: mode === "sat" ? 9 : 8, attribution: "Imagery: NASA GIBS" });
    map.addLayer({ id: "imagery", type: "raster", source: "imagery", paint: { "raster-opacity": 1, "raster-fade-duration": 200 } }, beforeId);
  }
}

export async function loadRadar(map: MapLibreMap, signal: AbortSignal): Promise<void> {
  const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", { signal });
  if (!res.ok) throw new Error(`RainViewer HTTP ${res.status}`);
  const body = (await res.json()) as { host?: string; radar?: { past?: Array<{ path: string }> } };
  const frame = body.radar?.past?.at(-1);
  if (!body.host || !frame || !/^https:\/\//.test(body.host)) throw new Error("No radar frame available");
  if (map.getLayer("radar")) map.removeLayer("radar");
  if (map.getSource("radar")) map.removeSource("radar");
  map.addSource("radar", { type: "raster", tiles: [`${body.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`], tileSize: 256, maxzoom: 7, attribution: "Radar: RainViewer" });
  map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": 0.65 } }, "terminator");
}
