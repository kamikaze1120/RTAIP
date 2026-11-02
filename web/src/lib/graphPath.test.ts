import { describe, expect, it } from "vitest";
import { shortestPath } from "./graphPath";
import type { Edge } from "./types";

const edge = (source: string, target: string): Edge => ({ id: `${source}|${target}`, source, target, type: "link", connector: "test", confidence: 1 });

describe("shortestPath", () => {
  it("returns the hop sequence along a simple chain", () => {
    const edges = [edge("a", "b"), edge("b", "c"), edge("c", "d")];
    expect(shortestPath(edges, "a", "d")).toEqual(["a", "b", "c", "d"]);
  });

  it("finds the fewest-hop route when several exist and treats edges as undirected", () => {
    // a-b-c-d (3 hops) vs a-e-d (2 hops); edges defined target->source to prove undirectedness.
    const edges = [edge("b", "a"), edge("c", "b"), edge("d", "c"), edge("e", "a"), edge("d", "e")];
    expect(shortestPath(edges, "a", "d")).toEqual(["a", "e", "d"]);
  });

  it("returns an empty array when the two nodes are not connected", () => {
    const edges = [edge("a", "b"), edge("c", "d")];
    expect(shortestPath(edges, "a", "d")).toEqual([]);
  });

  it("treats a node as its own trivial path", () => {
    expect(shortestPath([edge("a", "b")], "a", "a")).toEqual(["a"]);
  });
});
