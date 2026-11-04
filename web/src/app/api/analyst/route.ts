import { z } from "zod";
import { readAnalystConfig, runAnalyst, type AnalystMeta } from "@/lib/analyst";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { currentUserId } from "@/lib/supabase/server";
import type { Snapshot } from "@/lib/useInvestigation";

export const runtime = "nodejs";
export const maxDuration = 60;

const Prov = z.object({ source: z.string(), url: z.string().optional(), fetchedAt: z.string() });
const Ent = z.object({
  id: z.string(),
  type: z.string(),
  value: z.string(),
  label: z.string(),
  confidence: z.number(),
  attrs: z.record(z.string(), z.unknown()).default({}),
  provenance: z.array(Prov).default([]),
  geo: z.object({ lat: z.number(), lon: z.number() }).optional(),
});
const Edge = z.object({ id: z.string(), source: z.string(), target: z.string(), type: z.string(), connector: z.string(), confidence: z.number() });
const Finding = z.object({ id: z.string(), severity: z.enum(["info", "low", "medium", "high"]), title: z.string(), detail: z.string(), entityId: z.string().optional() });

const Body = z.object({
  snapshot: z.object({
    seeds: z.array(z.string()).max(50),
    entities: z.array(Ent).max(4000),
    edges: z.array(Edge).max(8000),
    findings: z.array(Finding).max(2000),
  }),
  meta: z.object({ score: z.number(), level: z.enum(["low", "guarded", "elevated", "high"]), summary: z.string().max(4000) }),
});

export async function POST(request: Request): Promise<Response> {
  const rate = rateLimit(`analyst:${clientKey(request)}`, 6, 60_000);
  if (!rate.ok) return Response.json({ error: "Too many analyst requests. Wait a moment." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } });

  // The AI analyst is for signed-in users only (the brief is an LLM call).
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in to use the AI analyst." }, { status: 401 });

  const config = readAnalystConfig(process.env);
  if (!config) return Response.json({ error: "AI analyst is not configured on this deployment.", configured: false }, { status: 503 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) return Response.json({ error: "Provide a valid investigation snapshot" }, { status: 400 });
  if (body.data.snapshot.entities.length === 0) return Response.json({ error: "Nothing to analyze yet. Run an investigation first." }, { status: 422 });

  const snap = body.data.snapshot as Snapshot;
  const meta = body.data.meta as AnalystMeta;

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const brief = await runAnalyst(snap, meta, config, { signal: controller.signal });
    return Response.json({ brief, configured: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "The AI analyst could not complete the brief.";
    return Response.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
