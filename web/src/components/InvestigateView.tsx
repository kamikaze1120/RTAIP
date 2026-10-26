"use client";

import clsx from "clsx";
import { AlertTriangle, ArrowRight, Check, Copy, Download, Expand, Globe2, Loader2, Maximize2, Save, Search, Square, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveInvestigation, useSavedInvestigations, writeSaved } from "@/lib/saved";
import type { Entity, EntityType, Finding, SeedType } from "@/lib/types";
import { ENTITY_STYLE, RISK_STYLE, SEVERITY_STYLE } from "@/lib/ui";
import { useInvestigation } from "@/lib/useInvestigation";
import { GraphCanvas } from "./GraphCanvas";
import { buttonClass, Dot, Empty, ErrorNote, Panel, Pill } from "./ui";

const EXAMPLES = ["example.com", "8.8.8.8", "cloudflare.com"];
const EXPANDABLE: Partial<Record<EntityType, SeedType>> = { domain: "domain", ip: "ip", email: "email" };

function RiskCard({ score, level, summary, findings }: { score: number; level: keyof typeof RISK_STYLE; summary: string; findings: number }) {
  const style = RISK_STYLE[level];
  return (
    <Panel title="Exposure">
      <div className="p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-4xl font-semibold tabular-nums" style={{ color: style.color }}>
              {score}
            </div>
            <div className="text-xs text-dim">out of 100</div>
          </div>
          <Pill color={style.color}>{style.label}</Pill>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-panel2" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="Exposure score">
          <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: style.color }} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-dim">{summary}</p>
        <p className="mt-2 text-[11px] text-faint">{findings} finding{findings === 1 ? "" : "s"}. Score reflects only the checks that completed.</p>
      </div>
    </Panel>
  );
}

function FindingsList({ findings, onSelect }: { findings: Finding[]; onSelect: (id: string) => void }) {
  const sorted = [...findings].sort((a, b) => SEVERITY_STYLE[b.severity].rank - SEVERITY_STYLE[a.severity].rank);
  return (
    <Panel title={`Findings (${findings.length})`}>
      {sorted.length === 0 ? (
        <Empty title="No findings yet" hint="Issues appear here as checks complete." />
      ) : (
        <ul className="max-h-[320px] divide-y divide-line overflow-auto">
          {sorted.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => f.entityId && onSelect(f.entityId)} className="w-full px-4 py-3 text-left hover:bg-panel2/60">
                <div className="flex items-center gap-2">
                  <Dot color={SEVERITY_STYLE[f.severity].color} />
                  <span className="text-sm font-medium">{f.title}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider" style={{ color: SEVERITY_STYLE[f.severity].color }}>
                    {SEVERITY_STYLE[f.severity].label}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-dim">{f.detail}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NodePanel({
  entity,
  neighbors,
  onSelect,
  onExpand,
  onClose,
  busy,
}: {
  entity: Entity;
  neighbors: Array<{ id: string; label: string; type: EntityType; rel: string }>;
  onSelect: (id: string) => void;
  onExpand: (entity: Entity) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const style = ENTITY_STYLE[entity.type];
  const attrs = Object.entries(entity.attrs).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0));
  const expandable = EXPANDABLE[entity.type];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entity.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <Panel
      title="Selected"
      action={
        <button type="button" onClick={onClose} className="text-dim hover:text-ink" aria-label="Close details">
          <X size={14} />
        </button>
      }
    >
      <div className="space-y-4 p-4">
        <div>
          <Pill color={style.color}>{style.label}</Pill>
          <p className="mt-2 break-all font-mono text-sm">{entity.label}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-dim">
            <span>Confidence</span>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-panel2">
              <div className="h-full bg-accent" style={{ width: `${Math.round(entity.confidence * 100)}%` }} />
            </div>
            <span className="tabular-nums">{Math.round(entity.confidence * 100)}%</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {expandable ? (
            <button type="button" disabled={busy} onClick={() => onExpand(entity)} className={buttonClass("primary")}>
              <Expand size={14} /> Expand
            </button>
          ) : null}
          {entity.geo ? (
            <Link href={`/map?lat=${entity.geo.lat}&lon=${entity.geo.lon}&label=${encodeURIComponent(entity.label)}`} className={buttonClass()}>
              <Globe2 size={14} /> Show on map
            </Link>
          ) : null}
          <button type="button" onClick={copy} className={buttonClass()}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        {attrs.length > 0 ? (
          <dl className="space-y-1.5 text-xs">
            {attrs.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-faint">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                <dd className="break-words text-ink">{Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {neighbors.length > 0 ? (
          <div>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Connections ({neighbors.length})</h3>
            <ul className="max-h-40 space-y-1 overflow-auto text-xs">
              {neighbors.map((n) => (
                <li key={`${n.id}${n.rel}`}>
                  <button type="button" onClick={() => onSelect(n.id)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-panel2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ENTITY_STYLE[n.type].color }} />
                    <span className="truncate">{n.label}</span>
                    <span className="ml-auto shrink-0 text-faint">{n.rel.replace(/_/g, " ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">Provenance</h3>
          <ul className="space-y-1 text-xs text-dim">
            {entity.provenance.map((p, i) => (
              <li key={`${p.source}${i}`}>
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-accent2 hover:underline">
                    {p.source}
                  </a>
                ) : (
                  p.source
                )}
                <span className="text-faint"> · {new Date(p.fetchedAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

export function InvestigateView() {
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const { state, score, level, summary, run, stop, reset, load } = useInvestigation();
  const [input, setInput] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [fitToken, setFitToken] = useState(0);
  const saved = useSavedInvestigations();
  const [showSaved, setShowSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);
  const running = state.status === "running";

  useEffect(() => {
    if (initial && !started.current) {
      started.current = true;
      void run("auto", initial);
    }
  }, [initial, run]);

  const byId = useMemo(() => new Map(state.entities.map((e) => [e.id, e])), [state.entities]);
  const selectedEntity = selected ? byId.get(selected) ?? null : null;
  const seedIds = useMemo(() => new Set(state.entities.filter((e) => e.provenance.some((p) => p.source === "Seed")).map((e) => e.id)), [state.entities]);
  const typeCounts = useMemo(() => {
    const m = new Map<EntityType, number>();
    for (const e of state.entities) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [state.entities]);
  const neighbors = useMemo(() => {
    if (!selected) return [];
    const out: Array<{ id: string; label: string; type: EntityType; rel: string }> = [];
    for (const e of state.edges) {
      const otherId = e.source === selected ? e.target : e.target === selected ? e.source : null;
      const other = otherId ? byId.get(otherId) : undefined;
      if (other) out.push({ id: other.id, label: other.label, type: other.type, rel: e.type });
    }
    return out;
  }, [selected, state.edges, byId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || running) return;
    setSelected(null);
    setHidden(new Set());
    void run("auto", input);
  };

  const toggleType = (t: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const snapshot = () => ({ seeds: state.seeds, entities: state.entities, edges: state.edges, findings: state.findings });

  const onSave = () => {
    const next = saveInvestigation(snapshot());
    if (next) setNotice("Saved in this browser");
    else setNotice("Could not save. Browser storage is unavailable or full.");
    setTimeout(() => setNotice(null), 2500);
  };

  const onExport = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), score, level, summary, ...snapshot() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtaip-${(state.seeds[0] ?? "investigation").replace(/[^a-z0-9.-]/gi, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const failedSteps = state.progress.filter((p) => p.status === "error");
  const empty = state.entities.length === 0;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-5 lg:h-[calc(100vh-3.5rem)]">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Domain, IP address or email"
            aria-label="Investigate a domain, IP address or email"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-panel py-2.5 pl-9 pr-3 font-mono text-sm outline-none placeholder:font-sans placeholder:text-faint focus:border-accent"
          />
        </div>
        {running ? (
          <button type="button" onClick={stop} className={buttonClass()}>
            <Square size={14} /> Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} className={buttonClass("primary")}>
            Investigate <ArrowRight size={14} />
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setInput(ex)} className="rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-dim hover:border-faint hover:text-ink">
              {ex}
            </button>
          ))}
        </div>
        <div className="relative ml-auto flex items-center gap-2">
          {notice ? <span className="text-xs text-good">{notice}</span> : null}
          <button type="button" onClick={onSave} disabled={empty} className={buttonClass()} title="Save in this browser">
            <Save size={14} /> Save
          </button>
          <button type="button" onClick={() => setShowSaved((s) => !s)} className={buttonClass()} aria-expanded={showSaved}>
            Saved ({saved.length})
          </button>
          <button type="button" onClick={onExport} disabled={empty} className={buttonClass()} title="Download JSON">
            <Download size={14} />
          </button>
          {showSaved ? (
            <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-line bg-panel2 p-2 shadow-2xl">
              {saved.length === 0 ? (
                <Empty title="Nothing saved yet" />
              ) : (
                <ul className="max-h-72 overflow-auto">
                  {saved.map((s) => (
                    <li key={s.id} className="flex items-center gap-1 rounded-lg hover:bg-panel">
                      <button
                        type="button"
                        className="flex-1 px-3 py-2 text-left"
                        onClick={() => {
                          load(s);
                          setInput(s.title);
                          setSelected(null);
                          setShowSaved(false);
                        }}
                      >
                        <div className="truncate font-mono text-sm">{s.title}</div>
                        <div className="text-[11px] text-faint">
                          {s.entities.length} entities · {new Date(s.savedAt).toLocaleString()}
                        </div>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${s.title}`}
                        className="p-2 text-faint hover:text-bad"
                        onClick={() => {
                          writeSaved(saved.filter((x) => x.id !== s.id));
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      </form>

      {state.error ? <ErrorNote message={state.error} /> : null}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[320px_1fr_340px]">
        <div className="flex min-h-0 flex-col gap-4 overflow-auto lg:pr-1">
          {!empty || running ? <RiskCard score={score} level={level} summary={summary || "Working…"} findings={state.findings.length} /> : null}
          <FindingsList findings={state.findings} onSelect={setSelected} />
          <Panel title="Checks">
            {state.progress.length === 0 ? (
              <Empty title="No checks run" />
            ) : (
              <ul className="max-h-60 divide-y divide-line overflow-auto text-xs">
                {[...state.progress].reverse().map((p) => (
                  <li key={p.key} className="flex items-center gap-2 px-4 py-2">
                    {p.status === "start" ? <Loader2 size={13} className="animate-spin text-accent" /> : p.status === "done" ? <Check size={13} className="text-good" /> : p.status === "error" ? <AlertTriangle size={13} className="text-warn" /> : <span className="h-3 w-3 text-faint">·</span>}
                    <span className="truncate">{p.transform}</span>
                    <span className="ml-auto max-w-[45%] truncate font-mono text-faint" title={p.message ?? p.target}>
                      {p.status === "error" || p.status === "skipped" ? p.message : p.target}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {failedSteps.length > 0 && !running ? <p className="border-t border-line px-4 py-2 text-[11px] text-warn">{failedSteps.length} check{failedSteps.length === 1 ? "" : "s"} could not complete, so results may be partial.</p> : null}
          </Panel>
        </div>

        <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-line bg-panel/60 lg:min-h-0">
          {empty ? (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              {running ? (
                <div className="flex items-center gap-3 text-sm text-dim">
                  <Loader2 className="animate-spin text-accent" size={18} /> Resolving the first records…
                </div>
              ) : (
                <div className="max-w-sm">
                  <h2 className="text-lg font-semibold">Start with one thing you know</h2>
                  <p className="mt-2 text-sm leading-relaxed text-dim">
                    Enter a domain, an IP address or an email address. RTAIP maps the domains, servers, networks and certificates connected to it and flags exposure issues, using public sources only.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              <GraphCanvas entities={state.entities} edges={state.edges} hiddenTypes={hidden} selectedId={selected} seedIds={seedIds} fitToken={fitToken} onSelect={setSelected} />
              <div className="absolute left-3 top-3 flex max-w-[70%] flex-wrap gap-1.5">
                {typeCounts.map(([t, n]) => {
                  const off = hidden.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      aria-pressed={!off}
                      className={clsx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-opacity", off ? "border-line text-faint opacity-60" : "border-line bg-panel/90 text-ink")}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: ENTITY_STYLE[t].color }} />
                      {ENTITY_STYLE[t].label} <span className="text-dim">{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="absolute right-3 top-3 flex gap-2">
                <button type="button" onClick={() => setFitToken((n) => n + 1)} className={buttonClass()} aria-label="Fit graph to view">
                  <Maximize2 size={14} />
                </button>
                <button type="button" onClick={() => { reset(); setSelected(null); setInput(""); }} className={buttonClass()} aria-label="Clear graph">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="absolute bottom-3 left-3 rounded-md border border-line bg-panel/90 px-2.5 py-1.5 text-[11px] text-dim">
                {state.entities.length} entities · {state.edges.length} relationships {running ? "· updating live" : ""}
              </div>
            </>
          )}
        </div>

        <div className="min-h-0 overflow-auto">
          {selectedEntity ? (
            <NodePanel
              entity={selectedEntity}
              neighbors={neighbors}
              onSelect={setSelected}
              onClose={() => setSelected(null)}
              busy={running}
              onExpand={(ent) => {
                const t = EXPANDABLE[ent.type];
                if (t) void run(t, ent.value, { merge: true });
              }}
            />
          ) : (
            <Panel title="Details">
              <Empty title="Select a node" hint="Click anything in the graph to see its sources, attributes and connections. Drag to rearrange, scroll to zoom." />
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
