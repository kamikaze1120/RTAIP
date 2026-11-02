import type { Edge } from "./types";

/**
 * Breadth-first shortest path between two entities over the **undirected** edge set.
 * Returns the ordered list of entity ids from `sourceId` to `targetId` inclusive, or an
 * empty array when the two are not connected. A node is its own trivial path.
 *
 * Pure and side-effect free so it can be unit-tested and reused by the graph UI.
 */
export function shortestPath(edges: readonly Edge[], sourceId: string, targetId: string): string[] {
  if (sourceId === targetId) return [sourceId];

  const adj = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    const list = adj.get(a);
    if (list) list.push(b);
    else adj.set(a, [b]);
  };
  for (const e of edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }

  const prev = new Map<string, string>();
  const seen = new Set<string>([sourceId]);
  let frontier = [sourceId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of adj.get(id) ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        prev.set(neighbor, id);
        if (neighbor === targetId) {
          const path = [targetId];
          let cur = targetId;
          while (cur !== sourceId) {
            cur = prev.get(cur) as string;
            path.push(cur);
          }
          return path.reverse();
        }
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return [];
}
