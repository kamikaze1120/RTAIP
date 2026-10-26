import { supabase } from "./supabase/client";
import type { QuickResult } from "./quickRun";
import { guessSeedType } from "./validate";

export interface WatchItem {
  id: string;
  value: string;
  kind: string;
  last_score: number | null;
  last_level: string | null;
  last_summary: string | null;
  last_checked: string | null;
  created_at: string;
}

const COLS = "id,value,kind,last_score,last_level,last_summary,last_checked,created_at";

export async function listWatch(): Promise<WatchItem[]> {
  const { data, error } = await supabase().from("watchlist").select(COLS).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as WatchItem[];
}

export async function addWatch(raw: string): Promise<void> {
  const value = raw.trim().toLowerCase();
  const kind = guessSeedType(value);
  if (!kind) throw new Error("Enter a domain, an IP address or an email address.");
  const { error } = await supabase().from("watchlist").insert({ value, kind });
  if (error) throw new Error(error.code === "23505" ? "Already on your watchlist." : error.message);
}

export async function recordCheck(id: string, r: QuickResult): Promise<void> {
  const { error } = await supabase().from("watchlist").update({ last_score: r.score, last_level: r.level, last_summary: r.summary, last_checked: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function removeWatch(id: string): Promise<void> {
  const { error } = await supabase().from("watchlist").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
