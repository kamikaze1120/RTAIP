import { supabase } from "./supabase/client";
import type { Snapshot } from "./useInvestigation";
import type { Finding, RiskLevel } from "./types";
import { guessSeedType } from "./validate";

export interface CaseSummary {
  id: string;
  title: string;
  seed: string;
  seed_type: string;
  notes: string;
  tags: string[];
  score: number;
  level: RiskLevel;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface CaseDetail extends CaseSummary {
  graph: { seeds: string[]; entities: Snapshot["entities"]; edges: Snapshot["edges"] };
  findings: Finding[];
}

const SUMMARY_COLS = "id,title,seed,seed_type,notes,tags,score,level,summary,created_at,updated_at";

function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? "Request failed");
}

export async function listCases(): Promise<CaseSummary[]> {
  const { data, error } = await supabase().from("cases").select(SUMMARY_COLS).order("updated_at", { ascending: false }).limit(200);
  if (error) fail(error);
  return (data ?? []) as CaseSummary[];
}

export async function getCase(id: string): Promise<CaseDetail> {
  const { data, error } = await supabase().from("cases").select(`${SUMMARY_COLS},graph,findings`).eq("id", id).single();
  if (error) fail(error);
  return data as CaseDetail;
}

export async function saveCase(snap: Snapshot, meta: { score: number; level: RiskLevel; summary: string }): Promise<string> {
  const seed = snap.seeds[0] ?? "investigation";
  const { data, error } = await supabase()
    .from("cases")
    .insert({
      title: seed.slice(0, 200),
      seed: seed.slice(0, 253),
      seed_type: guessSeedType(seed) ?? "domain",
      score: meta.score,
      level: meta.level,
      summary: meta.summary,
      graph: { seeds: snap.seeds, entities: snap.entities, edges: snap.edges },
      findings: snap.findings,
    })
    .select("id")
    .single();
  if (error) fail(error);
  return (data as { id: string }).id;
}

export async function updateCase(id: string, patch: Partial<Pick<CaseSummary, "title" | "notes" | "tags">>): Promise<void> {
  const { error } = await supabase().from("cases").update(patch).eq("id", id);
  if (error) fail(error);
}

export async function deleteCase(id: string): Promise<void> {
  const { error } = await supabase().from("cases").delete().eq("id", id);
  if (error) fail(error);
}

export function parseTags(input: string): string[] {
  return [...new Set(input.split(",").map((t) => t.trim().toLowerCase().slice(0, 32)).filter(Boolean))].slice(0, 12);
}
