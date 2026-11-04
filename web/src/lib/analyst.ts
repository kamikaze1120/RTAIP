import type { Entity, Provenance, RiskLevel } from "./types";
import { ENTITY_STYLE, SEVERITY_STYLE } from "./ui";
import type { Snapshot } from "./useInvestigation";

/**
 * AI analyst — turns a completed public-source investigation into a cited,
 * decision-ready intelligence brief. Provider-agnostic: it talks to any
 * OpenAI-compatible `/chat/completions` endpoint (Anthropic, OpenAI, OpenRouter,
 * Ollama, …) configured through env, and degrades cleanly when no key is set.
 *
 * The analyst persona is adapted from the prompts.chat community library
 * ("Investigative Research Assistant" evidence standards + "Unified Research &
 * Source Analysis" citation format), narrowed to RTAIP's public-data-only,
 * provenance-first ethos.
 */

export interface AnalystConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AnalystMeta {
  score: number;
  level: RiskLevel;
  summary: string;
}

export interface RunAnalystOptions {
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

const DEFAULT_MODEL = "gpt-4o-mini";

export const ANALYST_SYSTEM_PROMPT = `You are the RTAIP intelligence analyst. You read a completed open-source investigation — entities, relationships, findings and an exposure score, all gathered from public and authorized sources — and write a concise, decision-ready intelligence brief for an analyst reading it cold.

Evidence discipline (non-negotiable):
- Separate and clearly label CONFIRMED FACTS, STRONG INDICATORS, and SPECULATION. Never present a guess as a fact.
- Cite every substantive claim with a bracketed source number like [1] that refers to the numbered SOURCES list in the evidence below. Never cite a source you were not given.
- Never invent sources, entities, quotes, numbers, relationships or events. If the evidence does not support a claim, do not make it.
- Flag uncertainty and gaps honestly. If the evidence is partial or ambiguous, say so plainly.
- Use only the evidence provided. Do not add outside knowledge and do not browse. This is a summary of the supplied public data, nothing more.

Scope and ethics:
- This is open-source exposure analysis of an organization, domain, IP or email footprint — not surveillance of a private individual. Do not profile, locate, or target any person.
- Stay neutral and factual. No speculation about any individual's intent, politics or character.

Output in Markdown, no preamble:
1. **Assessment** — a 2–4 sentence bottom line: what this footprint is and the headline exposure, with [n] citations.
2. **Key findings** — bullets, each prefixed with (Confirmed) / (Indicator) / (Speculation) and carrying [n] citations.
3. **Notable entities & relationships** — what connects to what, and why it matters.
4. **Gaps & next steps** — what is missing and which public-source pivots would resolve it.

Keep it tight and evidence-led. Prefer "not enough evidence" over filler.`;

/** Read the provider-agnostic LLM config from an env bag. Returns null (not configured) unless both base URL and key are present. */
export function readAnalystConfig(env: Record<string, string | undefined>): AnalystConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const apiKey = env.LLM_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model: env.LLM_MODEL?.trim() || DEFAULT_MODEL };
}

/** Serialize a snapshot into a plain-text evidence packet with a numbered SOURCES list the model can cite as [n]. */
export function buildEvidence(snap: Snapshot, meta: AnalystMeta): string {
  const order: string[] = [];
  const indexByKey = new Map<string, number>();
  const provByKey = new Map<string, Provenance>();
  const key = (p: Provenance): string => `${p.source}|${p.url ?? ""}`;
  const ref = (p: Provenance): number => {
    const k = key(p);
    if (!indexByKey.has(k)) {
      order.push(k);
      indexByKey.set(k, order.length);
      provByKey.set(k, p);
    }
    return indexByKey.get(k)!;
  };

  const lines: string[] = [];
  lines.push(`INVESTIGATION: ${snap.seeds.join(", ") || "(none)"}`);
  lines.push(`EXPOSURE SCORE: ${meta.score}/100 (${meta.level})`);
  if (meta.summary) lines.push(`SYSTEM SUMMARY: ${meta.summary}`);
  lines.push("");

  const findings = [...snap.findings].sort((a, b) => SEVERITY_STYLE[b.severity].rank - SEVERITY_STYLE[a.severity].rank);
  lines.push(`FINDINGS (${findings.length}):`);
  if (findings.length === 0) lines.push("- none recorded");
  for (const f of findings) {
    const label = SEVERITY_STYLE[f.severity]?.label ?? f.severity;
    lines.push(`- [${label}] ${f.title}${f.detail ? ` — ${f.detail}` : ""}`);
  }
  lines.push("");

  const byType = new Map<string, Entity[]>();
  for (const e of snap.entities) byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
  lines.push(`ENTITIES (${snap.entities.length}):`);
  for (const [type, ents] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const label = ENTITY_STYLE[type as keyof typeof ENTITY_STYLE]?.label ?? type;
    lines.push(`${label} (${ents.length}):`);
    for (const e of ents.slice(0, 80)) {
      const refs = [...new Set(e.provenance.map((p) => ref(p)))].map((n) => `[${n}]`).join("");
      lines.push(`  - ${e.value} (confidence ${e.confidence.toFixed(2)})${refs ? ` ${refs}` : ""}`);
    }
    if (ents.length > 80) lines.push(`  - and ${ents.length - 80} more`);
  }
  lines.push("");

  lines.push("SOURCES:");
  if (order.length === 0) lines.push("(no sources recorded)");
  order.forEach((k, i) => {
    const p = provByKey.get(k)!;
    lines.push(`[${i + 1}] ${p.source}${p.url ? ` — ${p.url}` : ""} (fetched ${p.fetchedAt})`);
  });

  return lines.join("\n");
}

/** Call the configured OpenAI-compatible chat endpoint and return the brief text. Throws on provider error or empty response. */
export async function runAnalyst(snap: Snapshot, meta: AnalystMeta, config: AnalystConfig, opts: RunAnalystOptions = {}): Promise<string> {
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      temperature: 0.2,
      messages: [
        { role: "system", content: ANALYST_SYSTEM_PROMPT },
        { role: "user", content: buildEvidence(snap, meta) },
      ],
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI analyst provider error ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("AI analyst returned an empty response");
  return content;
}
