import { SAT_GROUPS, type SatGroup } from "./satellites";
import { RAIL, type BaseMode, type RailId } from "./layerConfig";

export interface ViewState {
  center?: [number, number];
  zoom?: number;
  layers?: RailId[];
  sats?: SatGroup[];
  mode?: BaseMode;
}

const RAIL_IDS = new Set<string>(RAIL.map((r) => r.id));
const MODES = new Set<string>(["globe", "flat", "sat", "night"]);

/** Parses the shareable URL fragment. Anything malformed is ignored, never thrown. */
export function parseHash(hash: string): ViewState {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: ViewState = {};
  const v = params.get("v")?.split(",").map(Number);
  if (v && v.length === 3 && v.every(Number.isFinite) && Math.abs(v[0]!) <= 180 && Math.abs(v[1]!) <= 90 && v[2]! >= 0 && v[2]! <= 22) {
    out.center = [v[0]!, v[1]!];
    out.zoom = v[2]!;
  }
  const l = params.get("l");
  if (l !== null) out.layers = l.split(",").filter((x): x is RailId => RAIL_IDS.has(x));
  const s = params.get("s");
  if (s !== null) out.sats = s.split(",").filter((x): x is SatGroup => x in SAT_GROUPS);
  const m = params.get("m");
  if (m && MODES.has(m)) out.mode = m as BaseMode;
  return out;
}

export function buildHash(s: { center: [number, number]; zoom: number; layers: Iterable<string>; sats: Iterable<string>; mode: BaseMode }): string {
  const p = new URLSearchParams();
  p.set("v", `${s.center[0].toFixed(3)},${s.center[1].toFixed(3)},${s.zoom.toFixed(2)}`);
  p.set("l", [...s.layers].join(","));
  p.set("s", [...s.sats].join(","));
  p.set("m", s.mode);
  return `#${p.toString().replace(/%2C/g, ",")}`;
}
