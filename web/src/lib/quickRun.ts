import type { RiskLevel, StreamEvent } from "./types";

export interface QuickResult {
  score: number;
  level: RiskLevel;
  summary: string;
  entities: number;
}

/** Runs an investigation without a graph and resolves with its final result. */
export async function quickRun(value: string, signal?: AbortSignal): Promise<QuickResult> {
  const res = await fetch("/api/investigate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "auto", value }), signal });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: QuickResult | null = null;
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
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.kind === "done") result = { score: ev.score, level: ev.level, summary: ev.summary, entities: ev.entities };
        } catch {
          // Ignore a malformed line and keep reading.
        }
      }
      nl = buffer.indexOf("\n");
    }
  }
  if (!result) throw new Error("The investigation ended before it finished.");
  return result;
}
