import { collection, type GeoCollection, type GeoFeature } from "./geo";

export type ZoneTier = "active" | "high" | "elevated";

export interface Zone {
  id: string;
  name: string;
  tier: ZoneTier;
  lat: number;
  lon: number;
  keywords: string[];
}

const TIER_SEVERITY: Record<ZoneTier, number> = { active: 0.95, high: 0.75, elevated: 0.5 };
const TIER_LABEL: Record<ZoneTier, string> = { active: "Active conflict", high: "High tension", elevated: "Elevated tension" };

/** An editorial list kept by hand. It is not a live measurement and is reviewed periodically. */
export const ZONES: Zone[] = [
  { id: "ukraine", name: "Ukraine", tier: "active", lat: 48.4, lon: 31.2, keywords: ["ukraine", "kyiv", "kharkiv", "donbas", "zaporizhzhia"] },
  { id: "gaza", name: "Gaza and Israel", tier: "active", lat: 31.45, lon: 34.4, keywords: ["gaza", "hamas", "israel", "west bank"] },
  { id: "sudan", name: "Sudan", tier: "active", lat: 15.5, lon: 32.5, keywords: ["sudan", "khartoum", "darfur", "rsf"] },
  { id: "myanmar", name: "Myanmar", tier: "active", lat: 21.9, lon: 96.0, keywords: ["myanmar", "burma", "junta"] },
  { id: "drc", name: "Eastern DR Congo", tier: "active", lat: -1.7, lon: 29.0, keywords: ["congo", "goma", "m23", "kivu"] },
  { id: "yemen", name: "Yemen", tier: "active", lat: 15.5, lon: 47.5, keywords: ["yemen", "houthi", "sanaa", "aden"] },
  { id: "syria", name: "Syria", tier: "high", lat: 35.0, lon: 38.5, keywords: ["syria", "damascus", "aleppo", "idlib"] },
  { id: "lebanon", name: "Lebanon", tier: "high", lat: 33.9, lon: 35.9, keywords: ["lebanon", "beirut", "hezbollah"] },
  { id: "sahel", name: "Sahel", tier: "high", lat: 14.5, lon: 0.0, keywords: ["sahel", "mali", "niger", "burkina faso"] },
  { id: "somalia", name: "Somalia", tier: "high", lat: 5.1, lon: 46.2, keywords: ["somalia", "mogadishu", "al-shabaab"] },
  { id: "redsea", name: "Red Sea", tier: "high", lat: 15.0, lon: 41.5, keywords: ["red sea", "bab el-mandeb", "shipping attack"] },
  { id: "taiwan", name: "Taiwan Strait", tier: "elevated", lat: 24.0, lon: 119.5, keywords: ["taiwan", "taipei", "taiwan strait"] },
  { id: "korea", name: "Korean DMZ", tier: "elevated", lat: 38.0, lon: 127.0, keywords: ["north korea", "pyongyang", "dmz", "kim jong"] },
  { id: "iraq", name: "Iraq", tier: "elevated", lat: 33.0, lon: 44.0, keywords: ["iraq", "baghdad", "mosul"] },
  { id: "ethiopia", name: "Ethiopia", tier: "elevated", lat: 9.0, lon: 40.0, keywords: ["ethiopia", "tigray", "amhara", "addis ababa"] },
];

export function zoneFeatures(): GeoCollection {
  const features: GeoFeature[] = ZONES.map((z) => ({
    type: "Feature",
    id: z.id,
    geometry: { type: "Point", coordinates: [z.lon, z.lat] },
    properties: {
      id: `zone:${z.id}`,
      layer: "zones",
      title: z.name,
      severity: TIER_SEVERITY[z.tier],
      time: null,
      source: "RTAIP editorial list",
      detail: `${TIER_LABEL[z.tier]}. Curated list, not a live measurement.`,
      tier: z.tier,
      zoneId: z.id,
    },
  }));
  return collection(features);
}

export function matchZones(text: string): Zone[] {
  const t = text.toLowerCase();
  return ZONES.filter((z) => z.keywords.some((k) => t.includes(k)));
}

interface Spot {
  id: string;
  name: string;
  kind: "chokepoint" | "port";
  lat: number;
  lon: number;
  note: string;
}

export const MARITIME_SPOTS: Spot[] = [
  { id: "hormuz", name: "Strait of Hormuz", kind: "chokepoint", lat: 26.57, lon: 56.25, note: "Connects the Persian Gulf to the Gulf of Oman" },
  { id: "malacca", name: "Strait of Malacca", kind: "chokepoint", lat: 2.5, lon: 101.5, note: "Main route between the Indian and Pacific oceans" },
  { id: "babelmandeb", name: "Bab el-Mandeb", kind: "chokepoint", lat: 12.6, lon: 43.3, note: "Links the Red Sea to the Gulf of Aden" },
  { id: "suez", name: "Suez Canal", kind: "chokepoint", lat: 30.5, lon: 32.35, note: "Connects the Mediterranean and Red seas" },
  { id: "panama", name: "Panama Canal", kind: "chokepoint", lat: 9.1, lon: -79.7, note: "Connects the Atlantic and Pacific oceans" },
  { id: "gibraltar", name: "Strait of Gibraltar", kind: "chokepoint", lat: 35.97, lon: -5.5, note: "Entrance to the Mediterranean" },
  { id: "bosphorus", name: "Bosphorus", kind: "chokepoint", lat: 41.12, lon: 29.07, note: "Connects the Black Sea to the Sea of Marmara" },
  { id: "dover", name: "Dover Strait", kind: "chokepoint", lat: 51.0, lon: 1.5, note: "Busiest shipping lane in the English Channel" },
  { id: "danish", name: "Danish Straits", kind: "chokepoint", lat: 55.7, lon: 12.7, note: "Gateway between the Baltic and the North Sea" },
  { id: "capegood", name: "Cape of Good Hope", kind: "chokepoint", lat: -34.36, lon: 18.47, note: "Alternative route around Africa" },
  { id: "shanghai", name: "Shanghai", kind: "port", lat: 31.23, lon: 121.5, note: "Container port" },
  { id: "singapore", name: "Singapore", kind: "port", lat: 1.26, lon: 103.84, note: "Container and transshipment hub" },
  { id: "ningbo", name: "Ningbo-Zhoushan", kind: "port", lat: 29.93, lon: 121.85, note: "Container and bulk port" },
  { id: "shenzhen", name: "Shenzhen", kind: "port", lat: 22.48, lon: 113.9, note: "Container port" },
  { id: "guangzhou", name: "Guangzhou", kind: "port", lat: 22.75, lon: 113.58, note: "Container port" },
  { id: "busan", name: "Busan", kind: "port", lat: 35.1, lon: 129.04, note: "Container and transshipment hub" },
  { id: "qingdao", name: "Qingdao", kind: "port", lat: 36.07, lon: 120.32, note: "Container and bulk port" },
  { id: "hongkong", name: "Hong Kong", kind: "port", lat: 22.3, lon: 114.15, note: "Container port" },
  { id: "tianjin", name: "Tianjin", kind: "port", lat: 38.98, lon: 117.75, note: "Container port" },
  { id: "rotterdam", name: "Rotterdam", kind: "port", lat: 51.95, lon: 4.1, note: "Largest port in Europe" },
  { id: "jebelali", name: "Jebel Ali, Dubai", kind: "port", lat: 25.0, lon: 55.06, note: "Largest port in the Middle East" },
  { id: "klang", name: "Port Klang", kind: "port", lat: 3.0, lon: 101.37, note: "Container port" },
  { id: "antwerp", name: "Antwerp-Bruges", kind: "port", lat: 51.3, lon: 4.3, note: "Container and chemicals port" },
  { id: "kaohsiung", name: "Kaohsiung", kind: "port", lat: 22.6, lon: 120.28, note: "Container port" },
  { id: "la", name: "Los Angeles and Long Beach", kind: "port", lat: 33.73, lon: -118.26, note: "Largest US container gateway" },
  { id: "hamburg", name: "Hamburg", kind: "port", lat: 53.54, lon: 9.97, note: "Container port" },
  { id: "newyork", name: "New York and New Jersey", kind: "port", lat: 40.67, lon: -74.05, note: "Largest US East Coast port" },
  { id: "colombo", name: "Colombo", kind: "port", lat: 6.95, lon: 79.85, note: "Transshipment hub" },
  { id: "piraeus", name: "Piraeus", kind: "port", lat: 37.94, lon: 23.63, note: "Mediterranean container port" },
  { id: "santos", name: "Santos", kind: "port", lat: -23.98, lon: -46.3, note: "Largest port in Latin America" },
  { id: "durban", name: "Durban", kind: "port", lat: -29.87, lon: 31.03, note: "Largest port in southern Africa" },
  { id: "yokohama", name: "Yokohama", kind: "port", lat: 35.45, lon: 139.65, note: "Container port" },
  { id: "jnpt", name: "Jawaharlal Nehru, Mumbai", kind: "port", lat: 18.95, lon: 72.95, note: "Largest container port in India" },
  { id: "algeciras", name: "Algeciras", kind: "port", lat: 36.13, lon: -5.43, note: "Mediterranean gateway port" },
  { id: "tangermed", name: "Tanger Med", kind: "port", lat: 35.89, lon: -5.5, note: "Container and transshipment port" },
];

export function portFeatures(): GeoCollection {
  return collection(
    MARITIME_SPOTS.map((s) => ({
      type: "Feature" as const,
      id: s.id,
      geometry: { type: "Point" as const, coordinates: [s.lon, s.lat] as [number, number] },
      properties: {
        id: `port:${s.id}`,
        layer: "ports" as const,
        title: s.name,
        severity: s.kind === "chokepoint" ? 0.45 : 0.15,
        time: null,
        source: "RTAIP reference data",
        detail: `${s.kind === "chokepoint" ? "Chokepoint" : "Major port"}. ${s.note}`,
        kind: s.kind,
      },
    })),
  );
}
