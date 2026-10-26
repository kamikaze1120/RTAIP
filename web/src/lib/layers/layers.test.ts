import { describe, expect, it } from "vitest";
import { bboxCircle, normalizeAdsb, normalizeAircraft, parseBbox } from "./aircraft";
import { normalizeAlerts } from "./alerts";
import { normalizeDisasters } from "./disasters";
import { normalizeQuakes } from "./quakes";

describe("normalizeQuakes", () => {
  it("maps magnitude to severity and drops bad coordinates", () => {
    const out = normalizeQuakes({
      features: [
        { id: "a", geometry: { coordinates: [-122.1, 37.2, 8.4] }, properties: { mag: 6.4, place: "10 km N of Somewhere", time: 1_760_000_000_000, url: "https://x" } },
        { id: "b", geometry: { coordinates: [999, 37.2, 8.4] }, properties: { mag: 2, place: "bad", time: 1_760_000_000_000 } },
      ],
    });
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.severity).toBeCloseTo(0.8);
    expect(out.features[0]?.properties.title).toBe("M6.4 10 km N of Somewhere");
  });
});

describe("normalizeDisasters", () => {
  it("uses the latest geometry and centroids for polygons", () => {
    const out = normalizeDisasters({
      events: [
        { id: "E1", title: "Fire", categories: [{ id: "wildfires", title: "Wildfires" }], geometry: [{ date: "2026-10-01T00:00:00Z", type: "Point", coordinates: [10, 10] }, { date: "2026-10-02T00:00:00Z", type: "Point", coordinates: [11, 12] }] },
        { id: "E2", title: "Storm", categories: [{ id: "severeStorms", title: "Severe Storms" }], geometry: [{ date: "2026-10-02T00:00:00Z", type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] }] },
        { id: "E3", title: "No geometry", geometry: [] },
      ],
    });
    expect(out.features).toHaveLength(2);
    expect(out.features[0]?.geometry).toEqual({ type: "Point", coordinates: [11, 12] });
    expect(out.features[1]?.geometry).toEqual({ type: "Point", coordinates: [1, 1] });
  });
});

describe("normalizeAlerts", () => {
  it("keeps only alerts with polygon geometry", () => {
    const out = normalizeAlerts({
      features: [
        { id: "1", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, properties: { event: "Flood Warning", severity: "Severe", headline: "h" } },
        { id: "2", geometry: null, properties: { event: "Zone alert" } },
      ],
    });
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.properties.severity).toBe(0.8);
  });
});

describe("normalizeAircraft", () => {
  it("skips grounded aircraft and flags emergency squawks", () => {
    const row = (icao: string, onGround: boolean, squawk: string | null) =>
      [icao, "TEST123 ", "United States", 1, 1_760_000_000, -100, 40, 10000, onGround, 220, 90, 0, null, 10100, squawk, false, 0] as never;
    const out = normalizeAircraft({ states: [row("a1", false, "7700"), row("a2", true, null), row("a3", false, "1200")] });
    expect(out.features.map((f) => f.properties.id)).toEqual(["opensky:a1", "opensky:a3"]);
    expect(out.features[0]?.properties.emergency).toBe(true);
    expect(out.features[0]?.properties.severity).toBe(1);
    expect(out.features[1]?.properties.emergency).toBe(false);
  });
  it("validates bounding boxes", () => {
    expect(parseBbox(new URLSearchParams("south=10&west=-10&north=20&east=10"))).toEqual({ south: 10, west: -10, north: 20, east: 10 });
    expect(parseBbox(new URLSearchParams("south=20&west=-10&north=10&east=10"))).toBeNull();
    expect(parseBbox(new URLSearchParams("south=a"))).toBeNull();
  });
});

describe("normalizeAdsb", () => {
  const bbox = { south: 40, west: -75, north: 41, east: -73 };
  it("converts units, drops grounded and out of view aircraft, flags emergencies", () => {
    const out = normalizeAdsb(
      {
        ac: [
          { hex: "a1", flight: "UAL12  ", lat: 40.5, lon: -74, alt_baro: 35000, gs: 400, track: 90, squawk: "1200", t: "B738" },
          { hex: "a2", lat: 40.5, lon: -74, alt_baro: "ground" },
          { hex: "a3", lat: 10, lon: 10, alt_baro: 1000 },
          { hex: "a4", flight: "MAYDAY", lat: 40.6, lon: -74.1, alt_baro: 9000, squawk: "7700" },
          { hex: "a5", lat: 40.7, lon: -74.2, alt_baro: 5000, emergency: "lifeguard" },
        ],
      },
      bbox,
      "test",
      1_760_000_000_000,
    );
    expect(out.features.map((f) => f.properties.id)).toEqual(["adsb:a1", "adsb:a4", "adsb:a5"]);
    expect(out.features[0]?.properties.altitudeM).toBe(10668);
    expect(out.features[0]?.properties.title).toBe("UAL12");
    expect(out.features[1]?.properties.emergency).toBe(true);
    expect(out.features[2]?.properties.emergency).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/registration/i);
  });
  it("sizes the query circle from the view", () => {
    const c = bboxCircle(bbox);
    expect(c.lat).toBe(40.5);
    expect(c.radiusNm).toBeGreaterThan(50);
    expect(c.radiusNm).toBeLessThan(90);
  });
});
