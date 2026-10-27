import { getFeed } from "@/lib/feeds";
import { clientKey, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(request: Request): Promise<Response> {
  const rate = rateLimit(`feed:${clientKey(request)}`, 60, 60_000);
  if (!rate.ok) return Response.json({ error: "Too many requests" }, { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } });
  try {
    return Response.json(await getFeed(), { headers: { "cache-control": "public, s-maxage=120, stale-while-revalidate=600" } });
  } catch {
    return Response.json({ error: "Feeds unavailable" }, { status: 502 });
  }
}
