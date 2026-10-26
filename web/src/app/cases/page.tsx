"use client";

import { ChevronDown, ChevronUp, FileText, FolderOpen, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireSignIn } from "@/components/RequireSignIn";
import { buttonClass, Empty, ErrorNote, Pill, Skeleton } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { deleteCase, getCase, listCases, parseTags, updateCase, type CaseSummary } from "@/lib/cases";
import { download, markdownReport } from "@/lib/report";
import { RISK_STYLE, timeAgo } from "@/lib/ui";

function CaseCard({ c, onChanged }: { c: CaseSummary; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(c.notes);
  const [tags, setTags] = useState(c.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const risk = RISK_STYLE[c.level] ?? RISK_STYLE.low;

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage(ok);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const report = () =>
    run(async () => {
      const d = await getCase(c.id);
      download(`rtaip-report-${c.seed.replace(/[^a-z0-9.-]/gi, "_")}.md`, markdownReport({ seeds: d.graph.seeds, entities: d.graph.entities, edges: d.graph.edges, findings: d.findings }, { score: d.score, level: d.level, summary: d.summary, notes: d.notes }), "text/markdown");
    });

  return (
    <li className="rounded-xl border border-line bg-panel/90">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm font-medium">{c.title}</span>
            <Pill color={risk.color}>{risk.label}</Pill>
          </div>
          <div className="mt-1 truncate text-xs text-dim">{c.summary}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
            <span>Updated {timeAgo(c.updated_at)}</span>
            <span>Score {c.score}</span>
            {c.tags.map((t) => (
              <span key={t} className="rounded border border-line px-1.5 py-0.5 text-dim">{t}</span>
            ))}
          </div>
        </div>
        <Link href={`/investigate?case=${c.id}`} className={buttonClass("primary")}>
          <FolderOpen size={14} /> Open
        </Link>
        <button type="button" onClick={report} disabled={busy} className={buttonClass()} title="Download a Markdown report">
          <FileText size={14} /> Report
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClass()} aria-expanded={open}>
          Notes {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label={`Delete ${c.title}`}
          onClick={() => {
            if (window.confirm(`Delete the case for ${c.title}? This cannot be undone.`)) void run(async () => { await deleteCase(c.id); onChanged(); });
          }}
          className={buttonClass()}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-line p-4">
          <label className="block text-xs font-medium uppercase tracking-wider text-dim" htmlFor={`notes-${c.id}`}>Analyst notes</label>
          <textarea id={`notes-${c.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} maxLength={20000} className="w-full rounded-lg border border-line bg-bg p-3 text-sm outline-none focus:border-accent" placeholder="What did you find, and what should happen next?" />
          <label className="block text-xs font-medium uppercase tracking-wider text-dim" htmlFor={`tags-${c.id}`}>Tags (comma separated)</label>
          <input id={`tags-${c.id}`} value={tags} onChange={(e) => setTags(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" placeholder="vendor, priority" />
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy} onClick={() => run(async () => { await updateCase(c.id, { notes, tags: parseTags(tags) }); onChanged(); }, "Saved")} className={buttonClass("primary")}>Save notes</button>
            {message ? <span className="text-xs text-dim" role="status">{message}</span> : null}
          </div>
        </div>
      ) : message ? (
        <div className="border-t border-line px-4 py-2 text-xs text-bad" role="alert">{message}</div>
      ) : null}
    </li>
  );
}

function CasesList() {
  const { user } = useAuth();
  const [rows, setRows] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let live = true;
    listCases()
      .then((d) => live && (setRows(d), setError(null)))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [user?.id, tick]);

  const shown = (rows ?? []).filter((c) => !filter || `${c.title} ${c.summary} ${c.tags.join(" ")}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="mt-1 text-sm text-dim">Investigations you saved, with notes and tags. Only you can see them.</p>
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter cases" aria-label="Filter cases" className="w-56 rounded-lg border border-line bg-panel px-3 py-2 text-sm outline-none focus:border-accent" />
      </div>
      {error ? <ErrorNote message={error} /> : null}
      {rows === null && !error ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : shown.length === 0 && !error ? (
        <Empty title={rows?.length ? "No cases match" : "No cases yet"} hint={rows?.length ? "Try a different filter." : "Run an investigation and choose Save to cases."} />
      ) : (
        <ul className="space-y-3">{shown.map((c) => <CaseCard key={c.id + c.updated_at} c={c} onChanged={() => setTick((t) => t + 1)} />)}</ul>
      )}
    </div>
  );
}

export default function CasesPage() {
  return (
    <RequireSignIn title="Your cases" hint="Enter your email to keep investigations, notes and reports in a private workspace. No password needed.">
      <CasesList />
    </RequireSignIn>
  );
}
