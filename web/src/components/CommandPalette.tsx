"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { guessSeedType } from "@/lib/validate";

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user, openSignIn, signOut } = useAuth();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => router.push(href);
    const list: Command[] = [
      { id: "overview", label: "Go to Overview", run: go("/") },
      { id: "investigate", label: "Go to Investigate", run: go("/investigate") },
      { id: "map", label: "Go to Map", run: go("/map") },
      { id: "cases", label: "Go to Cases", run: go("/cases") },
      { id: "watchlist", label: "Go to Watchlist", run: go("/watchlist") },
      { id: "sources", label: "Go to Sources", run: go("/sources") },
      user ? { id: "signout", label: "Sign out", hint: user.email ?? undefined, run: () => void signOut() } : { id: "signin", label: "Continue with email", run: openSignIn },
    ];
    const q = query.trim();
    if (q && guessSeedType(q)) list.unshift({ id: "run", label: `Investigate ${q}`, hint: "Run now", run: go(`/investigate?q=${encodeURIComponent(q)}`) });
    return q ? list.filter((c) => c.id === "run" || c.label.toLowerCase().includes(q.toLowerCase())) : list;
  }, [query, router, user, openSignIn, signOut]);

  if (!open) return null;

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    setQuery("");
    setIndex(0);
    c.run();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, commands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(commands[index]);
    } else if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKey}
            placeholder="Type a domain, IP or email, or search commands"
            aria-label="Search commands"
            spellCheck={false}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-dim">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-auto p-2" role="listbox">
          {commands.length === 0 ? <li className="px-3 py-6 text-center text-sm text-dim">No matching commands</li> : null}
          {commands.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === index}>
              <button type="button" onMouseEnter={() => setIndex(i)} onClick={() => choose(c)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm ${i === index ? "bg-panel2 text-ink" : "text-dim"}`}>
                <span className="truncate">{c.label}</span>
                <span className="flex items-center gap-2 text-xs text-faint">
                  {c.hint}
                  {i === index ? <CornerDownLeft size={12} /> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
