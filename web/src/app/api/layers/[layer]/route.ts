import { clientKey, rateLimit } from "@/lib/ratelimit";
import { HttpError } from "@/lib/http";
import { getLayer, isLayerId } from "@/lib/layers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request, ctx: { params: Promise<{ layer: string }> }): Promise<Response> {
  const { layer } = await ctx.params;
  if (!isLayerId(layer)) return Response.json({ error: "Unknown layer" }, { status: 404 });

  const rate = rateLimit(`layer:${clientKey(request)}`, 120, 60_000);
  if (!rate.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } });

  try {
    const result = await getLayer(layer, new URL(request.url).searchParams, request.signal);
    return Response.json(result, { headers: { "cache-control": "public, s-maxage=10, stale-while-revalidate=60" } });
  } catch (err) {
    if (err instanceof RangeError) return Response.json({ error: err.message }, { status: 400 });
    const status = err instanceof HttpError && err.status === 429 ? 429 : 502;
    const message = err instanceof HttpError ? `Upstream source unavailable (${err.message})` : "Upstream source unavailable";
    return Response.json({ error: message, layer }, { status });
  }
}
