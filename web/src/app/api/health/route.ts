import { getHealth } from "@/lib/health";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(): Promise<Response> {
  const health = await getHealth();
  return Response.json(health, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
}
