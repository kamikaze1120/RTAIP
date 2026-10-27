import { describe, expect, it } from "vitest";
import { countByLayer, evaluateGeofences, inArea, normalizeArea } from "./geofence";
import type { GeoFeature } from "./layers/geo";

const pt = (layer: GeoFeature["properties"]["layer"], id: string, lon: number, lat: number, extra: Record<string, unknown> = {}): GeoFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties: { id, layer, title: id, severity: 0.5, time: null, source: "t", ...extra },
});

describe("geofence", () => {
  const area = normalizeArea({ name: "Test", lon1: 10, lat1: 50, lon2: 0, lat2: 40 });
  it("orders corners and tests containment", () => {
    expect([area.west, area.south, area.east, area.north]).toEqual([0, 40, 10, 50]);
    expect(inArea(area, 5, 45)).toBe(true);
    expect(inArea(area, 11, 45)).toBe(false);
  });
  it("counts features per layer inside the area", () => {
    const counts = countByLayer(area, { quakes: [pt("quakes", "a", 5, 45), pt("quakes", "b", 50, 45)], fires: [pt("fires", "c", 1, 41)] });
    expect(counts).toEqual({ quakes: 1, fires: 1 });
  });
  it("raises alerts for emergencies and strong quakes only", () => {
    const alerts = evaluateGeofences([area], {
      aircraft: [pt("aircraft", "ac1", 5, 45, { emergency: true, detail: "squawk 7700" }), pt("aircraft", "ac2", 5, 45, { emergency: false })],
      quakes: [pt("quakes", "q1", 5, 45, { magnitude: 5.8 }), pt("quakes", "q2", 5, 45, { magnitude: 2.1 })],
    });
    expect(alerts.map((a) => a.id).sort()).toEqual([`${area.id}:ac1`, `${area.id}:q1`].sort());
    expect(alerts.find((a) => a.layer === "quakes")?.severity).toBe("critical");
  });
});
