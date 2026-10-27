import { cached } from "./cache";
import { fetchJson } from "./http";

export interface SpaceWeather {
  kp: number | null;
  kpTime: string | null;
  scale: string;
  alerts: Array<{ id: string; time: string; text: string }>;
}

export function kpScale(kp: number | null): string {
  if (kp === null) return "unknown";
  if (kp >= 9) return "G5 extreme storm";
  if (kp >= 8) return "G4 severe storm";
  if (kp >= 7) return "G3 strong storm";
  if (kp >= 6) return "G2 moderate storm";
  if (kp >= 5) return "G1 minor storm";
  if (kp >= 4) return "Active";
  return "Quiet";
}

export function normalizeSpaceWeather(kpRows: Array<Record<string, unknown>>, alertRows: Array<{ product_id: string; issue_datetime: string; message: string }>): SpaceWeather {
  const last = [...kpRows].reverse().find((r) => typeof r.Kp === "number");
  const kp = last ? (last.Kp as number) : null;
  const alerts = alertRows.slice(0, 8).map((a) => ({
    id: `${a.product_id}:${a.issue_datetime}`,
    time: new Date(`${a.issue_datetime.replace(" ", "T")}Z`).toISOString(),
    text: (a.message.split(/\r?\n/).find((l) => /^(ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT|EXTENDED WARNING)/i.test(l.trim())) ?? a.message.split(/\r?\n/)[0] ?? "").trim().slice(0, 200),
  }));
  return { kp, kpTime: last ? new Date(`${String(last.time_tag)}Z`).toISOString() : null, scale: kpScale(kp), alerts };
}

export async function getSpaceWeather(signal?: AbortSignal): Promise<{ fetchedAt: string; data: SpaceWeather }> {
  const res = await cached("spaceweather", 5 * 60_000, async () => {
    const [kp, alerts] = await Promise.all([
      fetchJson<Array<Record<string, unknown>>>("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", { signal, timeoutMs: 10_000 }),
      fetchJson<Array<{ product_id: string; issue_datetime: string; message: string }>>("https://services.swpc.noaa.gov/products/alerts.json", { signal, timeoutMs: 10_000 }).catch(() => []),
    ]);
    return normalizeSpaceWeather(kp, alerts);
  });
  return { fetchedAt: new Date(res.fetchedAt).toISOString(), data: res.value };
}
