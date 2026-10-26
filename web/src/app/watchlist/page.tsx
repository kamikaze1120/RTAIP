"use client";

import { ArrowDownRight, ArrowUpRight, Eye, Minus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RequireSignIn } from "@/components/RequireSignIn";
import { buttonClass, Empty, ErrorNote, Pill, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { quickRun } from "@/lib/quickRun";
import type { RiskLevel } from "@/lib/types";
import { RISK_STYLE, timeAgo } from "@/lib/ui";
import { addWatch, listWatch, recordCheck, removeWatch, type WatchItem } from "@/lib/watchlist";

type Delta = { from: number; to: number };

function WatchList() {
  const { user } = useAuth();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [tick, setTick] = useState(0);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [deltas, setDeltas] = useState<Record<string, Delta>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    listWatch()
      .then((d) => live && (setItems(d), setError(null)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [user?.id, tick]);

  useEffect(() => () => abort.current?.abort(), []);

  const check = useCallback(async (item: WatchItem) => {
    abort.current ??= new AbortController();
    setChecking((s) => new Set(s).add(item.id));
    setFailed((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== item.id)));
    try {
      const r = await quickRun(item.value, abort.current.signal);
      if (item.last_score !== null && item.last_score !== r.score) setDeltas((d) => ({ ...d, [item.id]: { from: item.last_score as number, to: r.score } }));
      await recordCheck(item.id, r);
      setTick((t) => t + 1);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFailed((f) => ({ ...f, [item.id]: e instanceof Error ? e.message : "Check failed" }));
    } finally {
      setChecking((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  }, []);

  const checkAll = async () => {
    for (const item of items ?? []) await check(item);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addWatch(input);
      setInput("");
      setTick((t) => t + 1);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    }
  };

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
          <p className="mt-1 text-sm text-dim">Track the exposure of domains, IPs and emails over time. Re-check any time to see what changed.</p>
        </div>
        <button type="button" onClick={checkAll} disabled={!items?.length || checking.size > 0} className={buttonClass()}>
          <RefreshCw size={14} className={checking.size ? "animate-spin" : ""} /> Check all
        </button>
      </div>
      <form onSubmit={add} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Add a domain, IP address or email" aria-label="Add to watchlist" spellCheck={false} className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2.5 font-mono text-sm outline-none placeholder:font-sans placeholder:text-faint focus:border-accent" />
        <button type="submit" disabled={!input.trim()} className={buttonClass("primary")}>
          <Eye size={14} /> Watch
        </button>
      </form>
      {error ? <ErrorNote message={error} /> : null}
      {items === null && !error ? (
        <Skeleton className="h-24" />
      ) : items?.length === 0 ? (
        <Empty title="Nothing watched yet" hint="Add an asset you care about, then check it whenever you want a fresh read." />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-panel/90">
          {(items ?? []).map((it) => {
            const risk = it.last_level ? RISK_STYLE[it.last_level as RiskLevel] : null;
            const d = deltas[it.id];
            return (
              <li key={it.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/investigate?q=${encodeURIComponent(it.value)}`} className="truncate font-mono text-sm font-medium hover:text-accent">{it.value}</Link>
                    {risk ? <Pill color={risk.color}>{risk.label}</Pill> : <Pill color="#56667a">Not checked</Pill>}
                  </div>
                  <div className="mt-1 truncate text-xs text-dim">{failed[it.id] ?? it.last_summary ?? "Run a check to get a baseline."}</div>
                  <div className="mt-1 text-[11px] text-faint">{it.last_checked ? `Checked ${timeAgo(it.last_checked)}` : `Added ${timeAgo(it.created_at)}`}</div>
                </div>
                <div className="flex items-center gap-2 text-sm tabular-nums">
                  {it.last_score !== null ? <span className="text-lg font-semibold">{it.last_score}</span> : null}
                  {d ? (
                    <span className={d.to > d.from ? "flex items-center text-xs text-bad" : "flex items-center text-xs text-good"} title={`Changed from ${d.from} to ${d.to}`}>
                      {d.to > d.from ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {Math.abs(d.to - d.from)}
                    </span>
                  ) : it.last_score !== null && checking.has(it.id) === false ? (
                    <Minus size={14} className="text-faint" aria-label="No change since last view" />
                  ) : null}
                </div>
                <button type="button" onClick={() => check(it)} disabled={checking.has(it.id)} className={buttonClass()}>
                  <RefreshCw size={14} className={checking.has(it.id) ? "animate-spin" : ""} /> Check
                </button>
                <button type="button" aria-label={`Stop watching ${it.value}`} onClick={() => removeWatch(it.id).then(() => setTick((t) => t + 1)).catch((e: Error) => setError(e.message))} className={buttonClass()}>
                  <Trash2 size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function WatchlistPage() {
  return (
    <RequireSignIn title="Your watchlist" hint="Enter your email to watch assets and see how their exposure changes. No password needed.">
      <WatchList />
    </RequireSignIn>
  );
}
