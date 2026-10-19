// RTAIP Graph API client. Talks to the FastAPI /graph/* endpoints.
// Public / authorized data only (see docs/ETHICS.md).
import { getBackendBase } from './data';

export type GNode = {
  id: number;
  etype: string;
  value: string;
  label: string;
  confidence: number;
  attrs?: Record<string, unknown>;
  first_seen?: string | null;
  last_seen?: string | null;
};

export type GLink = {
  id: number;
  source: number;
  target: number;
  type: string;
  connector: string;
  confidence: number;
};

export type GraphData = { nodes: GNode[]; links: GLink[] };
export type EnrichResult = GraphData & {
  seed?: { etype: string; value: string };
  stats?: { nodes: number; links: number };
};
export type GraphStats = {
  entities: number;
  relationships: number;
  by_type: Record<string, number>;
};

function base(): string {
  return (getBackendBase() || '').replace(/\/$/, '');
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const t = window.localStorage.getItem('access_token');
    if (t) h.Authorization = `Bearer ${t}`;
  } catch {
    /* ignore */
  }
  return h;
}

const EMPTY: GraphData = { nodes: [], links: [] };

export async function fetchFull(limit = 400): Promise<GraphData> {
  const b = base();
  if (!b) return EMPTY;
  const r = await fetch(`${b}/graph/full?limit=${limit}`, { headers: authHeaders() });
  if (!r.ok) return EMPTY;
  return (await r.json()) as GraphData;
}

export async function enrich(value: string, type = 'domain'): Promise<EnrichResult> {
  const b = base();
  if (!b) throw new Error('No backend configured. Set VITE_BACKEND_URL / backendUrl.');
  const r = await fetch(`${b}/graph/enrich`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ type, value }),
  });
  if (!r.ok) throw new Error(`Enrich failed (${r.status})`);
  return (await r.json()) as EnrichResult;
}

export async function pivot(id: number): Promise<GraphData> {
  const b = base();
  if (!b) return EMPTY;
  const r = await fetch(`${b}/graph/pivot/${id}`, { headers: authHeaders() });
  if (!r.ok) return EMPTY;
  return (await r.json()) as GraphData;
}

export async function graphStats(): Promise<GraphStats | null> {
  const b = base();
  if (!b) return null;
  const r = await fetch(`${b}/graph/stats`, { headers: authHeaders() });
  if (!r.ok) return null;
  return (await r.json()) as GraphStats;
}
