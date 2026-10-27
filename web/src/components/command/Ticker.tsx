"use client";

import type { FeedItem } from "@/lib/feeds";
import { timeAgo } from "@/lib/ui";

const KIND_COLOR: Record<FeedItem["kind"], string> = { news: "#38bdf8", cyber: "#e879f9", space: "#4ade80" };

export function Ticker({ items, error }: { items: FeedItem[]; error: string | null }) {
  if (items.length === 0) {
    return <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 px-3 py-1.5 text-xs text-faint backdrop-blur">{error ? `Headlines unavailable: ${error}` : "Loading headlines"}</div>;
  }
  const row = items.slice(0, 40);
  const render = (copy: number) =>
    row.map((i) => (
      <a key={`${copy}:${i.id}`} href={i.url} target="_blank" rel="noopener noreferrer" className="mx-5 inline-flex items-baseline gap-2 text-xs text-dim hover:text-ink" aria-hidden={copy === 1 ? true : undefined} tabIndex={copy === 1 ? -1 : undefined}>
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: KIND_COLOR[i.kind] }}>{i.source}</span>
        <span>{i.title}</span>
        <span className="text-[10px] text-faint">{timeAgo(i.time)}</span>
      </a>
    ));
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 overflow-hidden border-t border-line bg-bg/90 py-1.5 backdrop-blur" aria-label="Live headlines">
      <div className="ticker-track flex w-max whitespace-nowrap">
        <div className="flex">{render(0)}</div>
        <div className="flex">{render(1)}</div>
      </div>
    </div>
  );
}
