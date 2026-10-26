import type { GeoEventProps } from "../types";

export type Position = [number, number];
export interface PointGeometry {
  type: "Point";
  coordinates: Position;
}
export interface PolygonGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
}
export type FeatureGeometry = PointGeometry | PolygonGeometry;

export interface GeoFeature {
  type: "Feature";
  id?: string;
  geometry: FeatureGeometry;
  properties: GeoEventProps;
}

export interface GeoCollection {
  type: "FeatureCollection";
  features: GeoFeature[];
}

export const collection = (features: GeoFeature[]): GeoCollection => ({ type: "FeatureCollection", features });

export const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

export function validLonLat(lon: unknown, lat: unknown): lon is number {
  return typeof lon === "number" && typeof lat === "number" && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function ringCentroid(ring: Position[]): Position | null {
  if (ring.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const [lon, lat] of ring) {
    x += lon;
    y += lat;
  }
  return [x / ring.length, y / ring.length];
}
