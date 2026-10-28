import { GraphBuilder } from "./graph";
import { transformsFor } from "./transforms/registry";
import { scoreFindings, summarize } from "./analyze";
import type { Entity, Finding, StreamEvent } from "./types";
import type { ParsedSeed } from "./validate";

export interface InvestigateOptions {
  signal: AbortSignal;
  /** Total number of transform runs allowed in one investigation. */
  maxRuns?: number;
  /** Transforms running at the same time. */
  concurrency?: number;
}

/** Discovered entity types that are followed automatically. */
const FOLLOW = new Set(["ip", "domain", "subdomain", "nameserver", "mailserver", "email", "org"]);

export async function investigate(seed: ParsedSeed, emit: (e: StreamEvent) => void, opts: InvestigateOptions): Promise<void> {
  const { signal, maxRuns = 140, concurrency = 6 } = opts;
  const findings = new Map<string, Finding>();
  const used = new Map<string, number>();
  const done = new Set<string>();
  const queue: Entity[] = [];
  const queued = new Set<string>();
  let runs = 0;

  const enqueue = (entity: Entity): void => {
    if (queued.has(entity.id) || !FOLLOW.has(entity.type)) return;
    queued.add(entity.id);
    queue.push(entity);
  };

  const graph = new GraphBuilder((event) => {
    emit(event);
    if (event.kind === "entity") enqueue(event.entity);
  });

  const addFinding = (f: Omit<Finding, "id"> & { id?: string }): void => {
    const id = f.id ?? `${f.severity}:${f.title}:${f.entityId ?? ""}`;
    if (findings.has(id)) return;
    const finding: Finding = { ...f, id };
    findings.set(id, finding);
    emit({ kind: "finding", finding });
  };

  graph.entity(seed.type, seed.value, {
    confidence: 1,
    label: seed.value,
    provenance: { source: "Seed", fetchedAt: new Date().toISOString() },
  });

  const drain = async (): Promise<void> => {
    for (let entity = queue.shift(); entity && !signal.aborted; entity = queue.shift()) {
      for (const transform of transformsFor(entity.type)) {
        if (signal.aborted) return;
        const key = `${transform.id}:${entity.id}`;
        if (done.has(key)) continue;
        done.add(key);
        if (runs >= maxRuns || (used.get(transform.id) ?? 0) >= transform.budget) {
          emit({ kind: "progress", transform: transform.label, target: entity.value, status: "skipped", message: "investigation limit reached" });
          continue;
        }
        runs += 1;
        used.set(transform.id, (used.get(transform.id) ?? 0) + 1);
        emit({ kind: "progress", transform: transform.label, target: entity.value, status: "start" });
        try {
          await transform.run(entity, { graph, signal, finding: addFinding });
          emit({ kind: "progress", transform: transform.label, target: entity.value, status: "done" });
        } catch (err) {
          emit({ kind: "progress", transform: transform.label, target: entity.value, status: "error", message: err instanceof Error ? err.message : "failed" });
        }
      }
    }
  };

  // The queue grows while workers run, so keep starting workers until it is empty and all are idle.
  await new Promise<void>((resolve) => {
    let active = 0;
    const pump = (): void => {
      if (signal.aborted) return resolve();
      while (active < concurrency && queue.length > 0) {
        active += 1;
        void drain().finally(() => {
          active -= 1;
          pump();
        });
      }
      if (active === 0 && queue.length === 0) resolve();
    };
    pump();
  });

  const all = [...findings.values()];
  const { score, level } = scoreFindings(all);
  emit({
    kind: "done",
    score,
    level,
    summary: summarize(seed, all, graph.entities.size, graph.edges.size),
    entities: graph.entities.size,
    edges: graph.edges.size,
  });
}
