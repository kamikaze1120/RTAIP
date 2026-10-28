import { z } from "zod";
import { investigate } from "@/lib/investigate";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { parseSeed } from "@/lib/validate";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  type: z.enum(["auto", "domain", "ip", "email", "org"]).default("auto"),
  value: z.string().min(1).max(320),
});

export async function POST(request: Request): Promise<Response> {
  const rate = rateLimit(`investigate:${clientKey(request)}`, 12, 60_000);
  if (!rate.ok) return Response.json({ error: "Too many investigations. Wait a moment." }, { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const body = Body.safeParse(json);
  if (!body.success) return Response.json({ error: "Provide a value to investigate" }, { status: 400 });
  const parsed = parseSeed(body.data.type, body.data.value);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 422 });

  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const timeout = setTimeout(() => controller.abort(), 50_000);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const send = (event: StreamEvent) => {
        try {
          streamController.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          controller.abort();
        }
      };
      try {
        await investigate(parsed.seed, send, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
        try {
          streamController.close();
        } catch {
          /* client already left */
        }
      }
    },
    cancel() {
      controller.abort();
      clearTimeout(timeout);
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
