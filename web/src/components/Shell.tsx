"use client";

import clsx from "clsx";
import { Activity, Command, Eye, FolderKanban, GitFork, Globe2, LogOut, Radio, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { usePolling } from "@/lib/usePolling";
import { AuthDialog } from "./AuthDialog";
import { CommandPalette } from "./CommandPalette";
import { Dot } from "./ui";

const NAV = [
  { href: "/", label: "Command", icon: Globe2 },
  { href: "/investigate", label: "Investigate", icon: GitFork },
  { href: "/cases", label: "Cases", icon: FolderKanban },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/sources", label: "Sources", icon: Radio },
];

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  checks: Array<{ id: string; ok: boolean }>;
}

function StatusBadge() {
  const { data, error, loading } = usePolling<HealthResponse>("/api/health", 60_000);
  let color = "#56667a";
  let label = "Checking";
  if (!loading && (error || !data)) {
    color = "#f43f5e";
    label = "Offline";
  } else if (data) {
    const ok = data.checks.filter((c) => c.ok).length;
    color = data.status === "ok" ? "#34d399" : data.status === "degraded" ? "#f5a524" : "#f43f5e";
    label = data.status === "ok" ? "All sources live" : `${ok}/${data.checks.length} sources live`;
  }
  return (
    <Link href="/sources" className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-dim hover:border-faint" title="Source health">
      <Dot color={color} pulse={label === "All sources live"} />
      {label}
    </Link>
  );
}

function AccountButton() {
  const { user, loading, openSignIn, signOut } = useAuth();
  if (loading) return <span className="h-8 w-24 animate-pulse rounded-lg bg-panel2" aria-hidden />;
  if (!user) {
    return (
      <button type="button" onClick={openSignIn} className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:bg-accent/90">
        <User size={13} /> Sign in
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="hidden max-w-[160px] truncate rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-dim lg:block" title={user.email ?? undefined}>{user.email}</span>
      <button type="button" onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="rounded-lg border border-line bg-panel p-1.5 text-dim hover:text-ink">
        <LogOut size={14} />
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [palette, setPalette] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-bg logo-glow">
              <Activity size={16} strokeWidth={2.6} />
            </span>
            <span className="text-sm font-semibold tracking-wide">RTAIP</span>
            <span className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-dim sm:inline">Intelligence</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors", active ? "bg-panel2 text-ink" : "text-dim hover:text-ink")}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setPalette(true)} className="hidden items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-dim hover:border-faint sm:flex" aria-label="Open command palette">
              <Command size={12} /> Search <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
            </button>
            <StatusBadge />
            <AccountButton />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg/95 backdrop-blur md:hidden" aria-label="Main mobile">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[10px]", active ? "text-accent" : "text-dim")}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <AuthDialog />
    </div>
  );
}
