import { describe, expect, it } from "vitest";
import { GraphBuilder } from "./graph";
import type { StreamEvent } from "./types";

describe("GraphBuilder", () => {
  it("dedupes entities and merges attrs and provenance", () => {
    const events: StreamEvent[] = [];
    const g = new GraphBuilder((e) => events.push(e));
    const a = g.entity("ip", "1.1.1.1", { provenance: { source: "a", fetchedAt: "t" } });
    g.entity("ip", "1.1.1.1", { attrs: { country: "AU" }, provenance: { source: "b", fetchedAt: "t" } });
    expect(g.entities.size).toBe(1);
    expect(a.attrs.country).toBe("AU");
    expect(a.provenance).toHaveLength(2);
    expect(events.filter((e) => e.kind === "entity")).toHaveLength(2);
  });
  it("does not re-emit when nothing changed", () => {
    const events: StreamEvent[] = [];
    const g = new GraphBuilder((e) => events.push(e));
    g.entity("domain", "example.com", { attrs: { x: 1 } });
    g.entity("domain", "Example.com", { attrs: { x: 1 } });
    expect(events).toHaveLength(1);
  });
  it("dedupes edges and ignores self loops", () => {
    const g = new GraphBuilder();
    const a = g.entity("domain", "a.com");
    const b = g.entity("ip", "1.1.1.1");
    g.edge(a, "resolves_to", b, "dns");
    g.edge(a, "resolves_to", b, "dns");
    expect(g.edge(a, "x", a, "dns")).toBeNull();
    expect(g.edges.size).toBe(1);
  });
});
