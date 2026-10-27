import { degreesLat, degreesLong, eciToGeodetic, gstime, json2satrec, propagate, type SatRec } from "satellite.js";
import type { Omm, SatGroup } from "./satellites";

export interface Sat {
  id: number;
  name: string;
  group: SatGroup;
  rec: SatRec;
  inclination: number;
  periodMin: number;
}

export interface SatState {
  lon: number;
  lat: number;
  altKm: number;
  speedKms: number;
}

export function buildSats(group: SatGroup, elements: Omm[]): Sat[] {
  const out: Sat[] = [];
  for (const e of elements) {
    try {
      const rec = json2satrec(e as unknown as Parameters<typeof json2satrec>[0]);
      if (rec.error) continue;
      out.push({ id: e.NORAD_CAT_ID, name: e.OBJECT_NAME, group, rec, inclination: e.INCLINATION, periodMin: 1440 / e.MEAN_MOTION });
    } catch {
      // Skip an element set the propagator rejects.
    }
  }
  return out;
}

export function stateAt(sat: Sat, date: Date): SatState | null {
  const pv = propagate(sat.rec, date);
  if (!pv || !pv.position || typeof pv.position === "boolean") return null;
  const gmst = gstime(date);
  const geo = eciToGeodetic(pv.position, gmst);
  const lon = degreesLong(geo.longitude);
  const lat = degreesLat(geo.latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(geo.height)) return null;
  const v = pv.velocity && typeof pv.velocity !== "boolean" ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
  return { lon, lat, altKm: geo.height, speedKms: v };
}

/** Ground track for the next `minutes`, split wherever it crosses the antimeridian. */
export function groundTrack(sat: Sat, from: Date, minutes = 100, steps = 150): Array<Array<[number, number]>> {
  const lines: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  let prevLon: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const s = stateAt(sat, new Date(from.getTime() + (i / steps) * minutes * 60_000));
    if (!s) continue;
    if (prevLon !== null && Math.abs(s.lon - prevLon) > 180) {
      if (current.length > 1) lines.push(current);
      current = [];
    }
    current.push([s.lon, s.lat]);
    prevLon = s.lon;
  }
  if (current.length > 1) lines.push(current);
  return lines;
}

export function orbitClass(altKm: number): string {
  if (altKm < 2000) return "Low Earth orbit";
  if (altKm < 35_000) return "Medium Earth orbit";
  if (altKm < 36_500) return "Geostationary orbit";
  return "High Earth orbit";
}
