import type { GeoFeature } from "@/lib/layers/geo";
import type { LayerId } from "@/lib/types";

export interface Pin {
  lat: number;
  lon: number;
  label: string;
}

export type Selected = { kind: "feature"; id: string; layer: LayerId; center: [number, number] } | { kind: "sat"; id: number; center: [number, number] };

export interface SatInfo {
  id: number;
  name: string;
  group: string;
  lon: number;
  lat: number;
  altKm: number;
  speedKms: number;
  periodMin: number;
  inclination: number;
}

export type DockTab = "intel" | "selection" | "area" | "alerts";

export interface FeatureIndex {
  get(id: string): GeoFeature | undefined;
}
