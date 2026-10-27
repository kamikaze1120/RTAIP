import { describe, expect, it } from "vitest";
import { nightPolygon, subsolarPoint } from "./terminator";

describe("terminator", () => {
  it("puts the sun near the tropic at the June solstice noon", () => {
    const s = subsolarPoint(new Date("2026-06-21T12:00:00Z"));
    expect(s.lat).toBeGreaterThan(23);
    expect(s.lat).toBeLessThan(23.6);
    expect(Math.abs(s.lon)).toBeLessThan(6);
  });
  it("moves the sun west over time", () => {
    const a = subsolarPoint(new Date("2026-03-20T06:00:00Z"));
    const b = subsolarPoint(new Date("2026-03-20T12:00:00Z"));
    expect(a.lon).toBeGreaterThan(b.lon);
    expect(Math.abs(a.lat)).toBeLessThan(1);
  });
  it("builds a closed ring with valid coordinates", () => {
    const ring = nightPolygon(new Date("2026-10-27T14:00:00Z"));
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.every(([lon, lat]) => Math.abs(lon) <= 180 && Math.abs(lat) <= 90)).toBe(true);
  });
});
