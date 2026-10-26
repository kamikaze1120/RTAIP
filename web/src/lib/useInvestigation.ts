"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { scoreFindings, summarize } from "./analyze";
import type { Edge, Entity, Finding, StreamEvent, TransformStatus } from "./types";
import type { SeedType } from "./types";

export interface ProgressItem {
  key: string;
  transform: string;
  target: string;
  status: TransformStatus;
  message?: string;
}

export type RunStatus = "idle" | "running" | "done" | "error";

export interface InvestigationState {
  status: RunStatus;
  error: string | null;
  seeds: string[];
  entities: Entity[];
  edges: Edge[];
  findings: Finding[];
  progress: ProgressItem[];
}

const EMPTY: InvestigationState = { status: "idle", error: null, seeds: [], entities: [], edges: [], findings: [], progress: [] };

export interface Snapshot {
  seeds: string[];
  entities: Entity[];
  edges: Edge[];
  findings: Finding[];
}

export function useInvestigation() {
  const [state, setState] = useState<InvestigationState>(EMPTY);
  const entities = useRef(new Map<string, Entity>());
  const edges = useRef(new Map<string, Edge>());
  const findings = useRef(new Map<string, Finding>());
  const progress = useRef(new Map<string, ProgressItem>());
  const seeds = useRef<string[]>([]);
  const abort = useRef<AbortController | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const publish = useCallback((patch: Partial<InvestigationState> = {}) => {
    setState((s) => ({
      ...s,
      ...patch,
      seeds: [...seeds.current],
      entities: [...entities.current.values()],
      edges: [...edges.current.values()],
      findings: [...findings.current.values()],
      progress: [...progress.current.values()].slice(-60),
    }));
  }, []);

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => {
    abort.current?.abort();
    stopTimer();
  }, [stopTimer]);

  const apply = useCallback((ev: StreamEvent) => {
    dirty.current = true;
    switch (ev.kind) {
      case "entity":
        entities.current.set(ev.entity.id, ev.entity);
        break;
      case "edge":
        edges.current.set(ev.edge.id, ev.edge);
        break;
      case "finding":
        findings.current.set(ev.finding.id, ev.finding);
        break;
      case "progress": {
        const key = `${ev.transform}:${ev.target}`;
        progress.current.delete(key);
        progress.current.set(key, { key, transform: ev.transform, target: ev.target, status: ev.status, message: ev.message });
        break;
      }
      default:
        break;
    }
  }, []);

  const run = useCallback(
    async (type: SeedType | "auto", value: string, opts: { merge?: boolean } = {}): Promise<void> => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      if (!opts.merge) {
        entities.current.clear();
        edges.current.clear();
        findings.current.clear();
        progress.current.clear();
        seeds.current = [];
      }
      seeds.current = [...seeds.current, value.trim()];
      dirty.current = false;
      publish({ status: "running", error: null });
      stopTimer();
      timer.current = setInterval(() => {
        if (dirty.current) {
          dirty.current = false;
          publish();
        }
      }, 120);

      try {
        const res = await fetch("/api/investigate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, value }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(chunk, { stream: true });
          let nl = buffer.indexOf("\n");
          while (nl >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (line) {
              try {
                apply(JSON.parse(line) as StreamEvent);
              } catch {
                /* ignore a malformed line */
              }
            }
            nl = buffer.indexOf("\n");
          }
        }
        stopTimer();
        publish({ status: "done" });
      } catch (err) {
        stopTimer();
        if (controller.signal.aborted) {
          publish({ status: "idle" });
          return;
        }
        publish({ status: "error", error: err instanceof Error ? err.message : "Investigation failed" });
      }
    },
    [apply, publish, stopTimer],
  );

  const stop = useCallback(() => {
    abort.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    stopTimer();
    entities.current.clear();
    edges.current.clear();
    findings.current.clear();
    progress.current.clear();
    seeds.current = [];
    setState(EMPTY);
  }, [stopTimer]);

  const load = useCallback(
    (snap: Snapshot) => {
      abort.current?.abort();
      stopTimer();
      entities.current = new Map(snap.entities.map((e) => [e.id, e]));
      edges.current = new Map(snap.edges.map((e) => [e.id, e]));
      findings.current = new Map(snap.findings.map((f) => [f.id, f]));
      progress.current.clear();
      seeds.current = snap.seeds;
      publish({ status: "done", error: null });
    },
    [publish, stopTimer],
  );

  const { score, level } = scoreFindings(state.findings);
  const summary = state.seeds[0]
    ? summarize({ type: "domain", value: state.seeds[0] }, state.findings, state.entities.length, state.edges.length)
    : "";

  return { state, score, level, summary, run, stop, reset, load };
}
