import clsx from "clsx";
import type { ReactNode } from "react";

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("rounded-xl border border-line bg-panel/90 backdrop-blur", className)}>
      {title ? (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-dim">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Pill({ color, children, className }: { color: string; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium", className)}
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      {children}
    </span>
  );
}

export function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} /> : null}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-dim">{title}</p>
      {hint ? <p className="mt-1 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
      {message}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-md bg-panel2", className)} />;
}

export const buttonClass = (variant: "primary" | "ghost" = "ghost"): string =>
  clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    variant === "primary" ? "bg-accent text-bg hover:bg-accent/90" : "border border-line bg-panel2 text-ink hover:border-faint",
  );
