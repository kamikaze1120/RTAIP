import { SAT_GROUPS, type SatGroup } from "./satellites";
import type { LayerId } from "./types";

export type RailId = LayerId | "satellites" | "radar" | "terminator";

export interface RailItem {
  id: RailId;
  group: "Air" | "Sea" | "Space" | "Earth" | "Cyber" | "Geopolitics" | "Cameras";
  label: string;
  hint: string;
  defaultOn: boolean;
}

export const RAIL: RailItem[] = [
  { id: "aircraft", group: "Air", label: "Civil aircraft", hint: "Zoom in to load the visible area", defaultOn: false },
  { id: "military", group: "Air", label: "Military aircraft", hint: "Worldwide, community ADS-B", defaultOn: true },
  { id: "ships", group: "Sea", label: "Ships", hint: "AIS, Baltic and Nordic coverage", defaultOn: false },
  { id: "ports", group: "Sea", label: "Ports and chokepoints", hint: "Reference locations", defaultOn: true },
  { id: "satellites", group: "Space", label: "Satellites", hint: "Propagated live in your browser", defaultOn: true },
  { id: "aurora", group: "Space", label: "Aurora", hint: "NOAA forecast", defaultOn: false },
  { id: "terminator", group: "Space", label: "Day and night", hint: "Solar terminator", defaultOn: true },
  { id: "quakes", group: "Earth", label: "Earthquakes", hint: "USGS", defaultOn: true },
  { id: "disasters", group: "Earth", label: "Natural events", hint: "NASA EONET and GDACS", defaultOn: true },
  { id: "fires", group: "Earth", label: "Fires", hint: "NASA FIRMS, last 24h", defaultOn: false },
  { id: "alerts", group: "Earth", label: "Weather alerts", hint: "US National Weather Service", defaultOn: false },
  { id: "radar", group: "Earth", label: "Rain radar", hint: "RainViewer", defaultOn: false },
  { id: "cyber", group: "Cyber", label: "Botnet C2 servers", hint: "abuse.ch Feodo Tracker", defaultOn: false },
  { id: "zones", group: "Geopolitics", label: "Conflict zones", hint: "Curated list, not a live measurement", defaultOn: true },
  { id: "cameras", group: "Cameras", label: "Traffic cameras", hint: "London, New York, California, Singapore, New Zealand, Finland", defaultOn: false },
];

export const GROUP_ORDER = ["Air", "Sea", "Space", "Earth", "Cyber", "Geopolitics", "Cameras"] as const;

export const DEFAULT_SAT_GROUPS: SatGroup[] = ["stations", "visual"];
export const SAT_GROUP_LABELS = Object.fromEntries(Object.entries(SAT_GROUPS).map(([k, v]) => [k, v.label])) as Record<SatGroup, string>;

export const POLL_MS: Record<LayerId, number> = {
  quakes: 60_000,
  disasters: 300_000,
  alerts: 300_000,
  aircraft: 20_000,
  military: 30_000,
  ships: 60_000,
  cameras: 3_600_000,
  fires: 900_000,
  aurora: 600_000,
  cyber: 1_800_000,
  zones: 3_600_000,
  ports: 3_600_000,
};

export const AIRCRAFT_MIN_ZOOM = 5.2;
export const DEFAULT_ON: RailId[] = RAIL.filter((r) => r.defaultOn).map((r) => r.id);

export type BaseMode = "globe" | "flat" | "sat" | "night";
export const MODES: Array<{ id: BaseMode; label: string; key: string }> = [
  { id: "globe", label: "3D globe", key: "G" },
  { id: "flat", label: "2D map", key: "M" },
  { id: "sat", label: "Satellite", key: "S" },
  { id: "night", label: "Night lights", key: "N" },
];
