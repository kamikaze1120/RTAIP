"use client";

import clsx from "clsx";
import { Activity, GitFork, Globe2, LayoutDashboard, Radio } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { usePolling } from "@/lib/usePolling";
import { Dot } from "./ui";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/investigate", label: "Investigate", icon: GitFork },
  { href: "/map", label: "Map", icon: Globe2 },
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

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-bg">
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
          <div className="ml-auto">
            <StatusBadge />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <nav className="sticky bottom-0 z-30 grid grid-cols-4 border-t border-line bg-bg/95 backdrop-blur md:hidden" aria-label="Main mobile">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={active ? "page" : undefined} className={clsx("flex flex-col items-center gap-1 py-2.5 text-[11px]", active ? "text-accent" : "text-dim")}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
