import { cached } from "./cache";
import { fetchJson } from "./http";

export const SAT_GROUPS = {
  stations: { label: "Space stations", celestrak: "stations" },
  visual: { label: "Brightest", celestrak: "visual" },
  galileo: { label: "Galileo", celestrak: "galileo" },
  beidou: { label: "BeiDou", celestrak: "beidou" },
  geo: { label: "Geostationary", celestrak: "geo" },
  military: { label: "Military", celestrak: "military" },
  science: { label: "Science", celestrak: "science" },
  resource: { label: "Earth resources", celestrak: "resource" },
  spire: { label: "Spire", celestrak: "spire" },
  intelsat: { label: "Intelsat", celestrak: "intelsat" },
  cubesat: { label: "CubeSats", celestrak: "cubesat" },
  starlink: { label: "Starlink", celestrak: "starlink" },
} as const;

export type SatGroup = keyof typeof SAT_GROUPS;

export function isSatGroup(v: string): v is SatGroup {
  return v in SAT_GROUPS;
}

export interface Omm {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

const REQUIRED: Array<keyof Omm> = ["OBJECT_NAME", "EPOCH", "MEAN_MOTION", "ECCENTRICITY", "INCLINATION", "RA_OF_ASC_NODE", "ARG_OF_PERICENTER", "MEAN_ANOMALY", "NORAD_CAT_ID", "BSTAR"];

/** Keeps only well formed orbital element sets. */
export function validOmm(list: unknown): Omm[] {
  if (!Array.isArray(list)) return [];
  return list.filter((o): o is Omm => typeof o === "object" && o !== null && REQUIRED.every((k) => (o as Record<string, unknown>)[k] !== undefined && (o as Record<string, unknown>)[k] !== null));
}

export async function getSatellites(group: SatGroup, signal?: AbortSignal): Promise<{ group: SatGroup; fetchedAt: string; stale: boolean; count: number; elements: Omm[] }> {
  const res = await cached(`sats:${group}`, 3 * 3_600_000, async () => {
    const list = await fetchJson<unknown>(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${SAT_GROUPS[group].celestrak}&FORMAT=json`, { signal, timeoutMs: 20_000 });
    const elements = validOmm(list);
    if (elements.length === 0) throw new Error("empty element set");
    return elements;
  });
  return { group, fetchedAt: new Date(res.fetchedAt).toISOString(), stale: res.stale, count: res.value.length, elements: res.value };
}
