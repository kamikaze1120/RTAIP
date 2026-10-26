"use client";

import { Check, X } from "lucide-react";
import { Empty, ErrorNote, Panel, Skeleton } from "@/components/ui";
import { timeAgo } from "@/lib/ui";
import { usePolling } from "@/lib/usePolling";

interface Check {
  id: string;
  label: string;
  group: "map" | "investigation" | "platform";
  ok: boolean;
  ms: number;
  error?: string;
}
interface Health {
  status: "ok" | "degraded" | "down";
  checkedAt: string;
  checks: Check[];
}

const GROUPS: Array<{ id: Check["group"]; title: string; blurb: string }> = [
  { id: "map", title: "Live map data", blurb: "Feeds behind the earthquake, natural event, weather and aircraft layers." },
  { id: "investigation", title: "Investigation sources", blurb: "Public records used to map a domain, IP address or email." },
  { id: "platform", title: "Platform", blurb: "Services RTAIP itself depends on." },
];

export default function SourcesPage() {
  const { data, error, loading } = usePolling<Health>("/api/health", 60_000);
  return (
    <div className="mx-auto max-w-[900px] space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-1 text-sm text-dim">Every source is checked live from the server. Nothing on this page is a placeholder.</p>
      </div>
      {error && !data ? <ErrorNote message={`Could not run the health check: ${error}`} /> : null}
      {loading ? (
        <Skeleton className="h-64" />
      ) : data ? (
        <>
          <p className="text-xs text-faint">Checked {timeAgo(data.checkedAt)}. Results refresh every minute.</p>
          {GROUPS.map((g) => {
            const rows = data.checks.filter((c) => c.group === g.id);
            if (rows.length === 0) return null;
            return (
              <Panel key={g.id} title={g.title}>
                <p className="border-b border-line px-4 py-2.5 text-xs text-dim">{g.blurb}</p>
                <ul className="divide-y divide-line">
                  {rows.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={c.ok ? "text-good" : "text-bad"}>{c.ok ? <Check size={16} /> : <X size={16} />}</span>
                      <span className="text-sm">{c.label}</span>
                      <span className="ml-auto text-xs tabular-nums text-faint">{c.ok ? `${c.ms} ms` : c.error ?? "failed"}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </>
      ) : (
        <Empty title="No data" />
      )}
      <Panel title="Data principles">
        <ul className="list-disc space-y-1.5 px-8 py-4 text-sm text-dim">
          <li>Public and authorized sources only. No private individual tracking.</li>
          <li>Every entity and relationship carries its source, link and time of retrieval.</li>
          <li>Email addresses are only used to reach their domain. No mailbox or breach lookups.</li>
          <li>Location from an IP address is a city level estimate, not a position.</li>
        </ul>
      </Panel>
    </div>
  );
}
