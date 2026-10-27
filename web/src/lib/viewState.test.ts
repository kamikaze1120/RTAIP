import { describe, expect, it } from "vitest";
import { buildHash, parseHash } from "./viewState";

describe("viewState", () => {
  it("round trips a view", () => {
    const hash = buildHash({ center: [12.5, 41.9], zoom: 4.2, layers: ["military", "quakes"], sats: ["stations"], mode: "sat" });
    expect(parseHash(hash)).toEqual({ center: [12.5, 41.9], zoom: 4.2, layers: ["military", "quakes"], sats: ["stations"], mode: "sat" });
  });
  it("drops unknown ids and bad numbers", () => {
    const s = parseHash("#v=999,10,3&l=quakes,evil,fires&s=nope,visual&m=lava");
    expect(s.center).toBeUndefined();
    expect(s.layers).toEqual(["quakes", "fires"]);
    expect(s.sats).toEqual(["visual"]);
    expect(s.mode).toBeUndefined();
  });
  it("handles an empty hash", () => {
    expect(parseHash("")).toEqual({});
  });
});
