import { HttpError } from "@/lib/http";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { getSatellites, isSatGroup } from "@/lib/satellites";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request): Promise<Response> {
  const group = new URL(request.url).searchParams.get("group") ?? "stations";
  if (!isSatGroup(group)) return Response.json({ error: "Unknown satellite group" }, { status: 404 });
  const rate = rateLimit(`sats:${clientKey(request)}`, 60, 60_000);
  if (!rate.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } });
  try {
    return Response.json(await getSatellites(group, request.signal), { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (err) {
    return Response.json({ error: err instanceof HttpError ? `Upstream source unavailable (${err.message})` : "Upstream source unavailable", group }, { status: 502 });
  }
}
