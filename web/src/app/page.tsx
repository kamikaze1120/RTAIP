"use client";

import { Activity, ArrowRight, Eye, Flame, FolderKanban, Plane, Search, Waves } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Dot, Empty, ErrorNote, Panel, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useSavedInvestigations } from "@/lib/saved";
import type { GeoCollection } from "@/lib/layers/geo";
import type { GeoEventProps, LayerId } from "@/lib/types";
import { LAYER_STYLE, timeAgo } from "@/lib/ui";
import { usePolling } from "@/lib/usePolling";

interface LayerPayload {
  layer: LayerId;
  fetchedAt: string;
  stale: boolean;
  count: number;
  data: GeoCollection;
}

function Stat({ icon, label, value, sub, color, loading, error }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string; loading: boolean; error: string | null }) {
  return (
    <div className="rounded-xl border border-line bg-panel/90 p-4">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-20" />
      ) : error ? (
        <div className="mt-3 text-sm text-warn">Unavailable</div>
      ) : (
        <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
      )}
      <div className="mt-1 text-xs text-dim">{error ? "The source did not respond" : sub}</div>
    </div>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const [seed, setSeed] = useState("");
  const saved = useSavedInvestigations();
  const { user, openSignIn } = useAuth();
  const quakes = usePolling<LayerPayload>("/api/layers/quakes", 60_000);
  const disasters = usePolling<LayerPayload>("/api/layers/disasters", 300_000);
  const alerts = usePolling<LayerPayload>("/api/layers/alerts", 300_000);

  // Derived from the time the data was fetched, so rendering stays pure.
  const day = (quakes.updatedAt ?? 0) - 86_400_000;
  const quakes24 = useMemo(() => (quakes.data?.data.features ?? []).filter((f) => Date.parse(f.properties.time ?? "") >= day), [quakes.data, day]);
  const strongest = useMemo(() => quakes24.reduce<GeoEventProps | null>((best, f) => (!best || Number(f.properties.magnitude) > Number(best.magnitude) ? f.properties : best), null), [quakes24]);
  const severeAlerts = (alerts.data?.data.features ?? []).filter((f) => f.properties.severity >= 0.8).length;

  const top = useMemo(() => {
    const all: GeoEventProps[] = [
      ...quakes24.map((f) => f.properties),
      ...(disasters.data?.data.features ?? []).map((f) => f.properties),
      ...(alerts.data?.data.features ?? []).map((f) => f.properties),
    ];
    return all.sort((a, b) => b.severity - a.severity || Date.parse(b.time ?? "") - Date.parse(a.time ?? "")).slice(0, 8);
  }, [quakes24, disasters.data, alerts.data]);

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (seed.trim()) router.push(`/investigate?q=${encodeURIComponent(seed.trim())}`);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-8">
      <div className="rounded-2xl border border-line bg-gradient-to-br from-accent/10 via-panel/60 to-transparent p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Real time analysis and intelligence</h1>
        <p className="mt-1 max-w-2xl text-sm text-dim">Map what is connected to a domain, IP or email, and watch what is happening around the world, from public and authorized sources only.</p>
      </div>

      <form onSubmit={go} className="flex flex-wrap gap-2 rounded-xl border border-line bg-panel/90 p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Investigate a domain, IP address or email"
            aria-label="Investigate a domain, IP address or email"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-bg py-2.5 pl-9 pr-3 font-mono text-sm outline-none placeholder:font-sans placeholder:text-faint focus:border-accent"
          />
        </div>
        <button type="submit" disabled={!seed.trim()} className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-bg hover:bg-accent/90 disabled:opacity-50">
          Investigate <ArrowRight size={14} />
        </button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Activity size={14} />} label="Earthquakes 24h" value={String(quakes24.length)} sub={strongest ? `Strongest: M${Number(strongest.magnitude).toFixed(1)}` : "None recorded"} color={LAYER_STYLE.quakes.color} loading={quakes.loading} error={quakes.error && !quakes.data ? quakes.error : null} />
        <Stat icon={<Flame size={14} />} label="Open natural events" value={String(disasters.data?.count ?? 0)} sub="Fires, storms, volcanoes" color={LAYER_STYLE.disasters.color} loading={disasters.loading} error={disasters.error && !disasters.data ? disasters.error : null} />
        <Stat icon={<Waves size={14} />} label="Severe weather alerts" value={String(severeAlerts)} sub={`${alerts.data?.count ?? 0} active with a mapped area`} color={LAYER_STYLE.alerts.color} loading={alerts.loading} error={alerts.error && !alerts.data ? alerts.error : null} />
        <Link href="/map" className="group rounded-xl border border-line bg-panel/90 p-4 transition-colors hover:border-accent/60">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">
            <Plane size={14} className="text-accent2" /> Live aircraft
          </div>
          <div className="mt-2 text-lg font-semibold">Open the map</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-dim">
            Zoom in to any region <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel title="Highest priority right now" action={<Link href="/map" className="text-xs text-accent hover:underline">View on map</Link>}>
          {quakes.loading && disasters.loading ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : top.length === 0 ? (
            <Empty title="No events to show" hint="Sources may be unreachable. Check the Sources page." />
          ) : (
            <ul className="divide-y divide-line">
              {top.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Dot color={LAYER_STYLE[p.layer].color} />
                  <div className="min-w-0">
                    <div className="truncate text-sm">{p.title}</div>
                    <div className="truncate text-xs text-dim">{p.detail ?? p.source}</div>
                  </div>
                  <div className="ml-auto shrink-0 text-xs text-faint">{timeAgo(p.time)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel title="Your workspace">
            {user ? (
              <div className="divide-y divide-line">
                <Link href="/cases" className="flex items-center justify-between px-4 py-3 hover:bg-panel2/50">
                  <span className="flex items-center gap-2 text-sm"><FolderKanban size={14} className="text-accent" /> Cases</span>
                  <span className="text-xs text-dim">Notes, tags and reports</span>
                </Link>
                <Link href="/watchlist" className="flex items-center justify-between px-4 py-3 hover:bg-panel2/50">
                  <span className="flex items-center gap-2 text-sm"><Eye size={14} className="text-accent" /> Watchlist</span>
                  <span className="text-xs text-dim">Track exposure over time</span>
                </Link>
                {saved.length > 0 ? (
                  <div className="px-4 py-3 text-xs text-dim">
                    {saved.length} investigation{saved.length === 1 ? "" : "s"} saved only in this browser.{" "}
                    <Link href="/investigate" className="text-accent hover:underline">Open one and save it to your cases</Link>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 p-4">
                <p className="text-sm text-dim">Enter your email to keep cases, notes and a watchlist in a private workspace. There is no password to create or remember.</p>
                <button type="button" onClick={openSignIn} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-bg hover:bg-accent/90">
                  Continue with email <ArrowRight size={14} />
                </button>
                {saved.length > 0 ? (
                  <ul className="divide-y divide-line border-t border-line pt-1">
                    {saved.slice(0, 4).map((s) => (
                      <li key={s.id}>
                        <Link href={`/investigate?q=${encodeURIComponent(s.title)}`} className="flex items-center justify-between py-2.5 hover:text-accent">
                          <span className="truncate font-mono text-sm">{s.title}</span>
                          <span className="ml-3 shrink-0 text-xs text-faint">{s.entities.length} entities</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}
          </Panel>
          <Panel title="Quick start">
            <div className="flex flex-wrap gap-2 p-4">
              {["example.com", "cloudflare.com", "8.8.8.8", "github.com"].map((ex) => (
                <Link key={ex} href={`/investigate?q=${encodeURIComponent(ex)}`} className="rounded-full border border-line px-3 py-1.5 font-mono text-xs text-dim hover:border-accent hover:text-ink">
                  {ex}
                </Link>
              ))}
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-faint">Press Ctrl K anywhere to search or jump to a page.</p>
          </Panel>
          {quakes.error && quakes.data ? <ErrorNote message={`Earthquake feed is delayed: ${quakes.error}`} /> : null}
        </div>
      </div>
    </div>
  );
}
