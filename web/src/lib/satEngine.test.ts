import { describe, expect, it } from "vitest";
import { buildSats, groundTrack, orbitClass, stateAt } from "./satEngine";
import type { Omm } from "./satellites";

const ATLAS: Omm = {
  OBJECT_NAME: "ATLAS CENTAUR 2",
  OBJECT_ID: "1963-047A",
  EPOCH: "2026-10-27T06:49:49.149696",
  MEAN_MOTION: 14.12879724,
  ECCENTRICITY: 0.0544478,
  INCLINATION: 30.3573,
  RA_OF_ASC_NODE: 340.495,
  ARG_OF_PERICENTER: 322.7483,
  MEAN_ANOMALY: 33.6505,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 694,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 16439,
  BSTAR: 0.00018101518,
  MEAN_MOTION_DOT: 1.594e-5,
  MEAN_MOTION_DDOT: 0,
};

describe("satEngine", () => {
  const sats = buildSats("visual", [ATLAS]);
  const t = new Date("2026-10-27T08:00:00Z");

  it("builds a satellite and propagates to a plausible position", () => {
    expect(sats).toHaveLength(1);
    const s = stateAt(sats[0]!, t);
    expect(s).not.toBeNull();
    expect(Math.abs(s!.lat)).toBeLessThanOrEqual(30.4 + 0.5);
    expect(s!.altKm).toBeGreaterThan(300);
    expect(s!.altKm).toBeLessThan(2000);
    expect(s!.speedKms).toBeGreaterThan(6);
    expect(s!.speedKms).toBeLessThan(8.5);
    expect(sats[0]!.periodMin).toBeCloseTo(101.9, 0);
  });

  it("splits ground tracks at the antimeridian", () => {
    const lines = groundTrack(sats[0]!, t, 200);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) for (let i = 1; i < line.length; i++) expect(Math.abs(line[i]![0] - line[i - 1]![0])).toBeLessThan(180);
  });

  it("skips broken element sets and labels orbits", () => {
    expect(buildSats("visual", [{ ...ATLAS, ECCENTRICITY: 5 }])).toHaveLength(0);
    expect(orbitClass(420)).toBe("Low Earth orbit");
    expect(orbitClass(35_786)).toBe("Geostationary orbit");
  });
});
