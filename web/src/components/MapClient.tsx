"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { Pin } from "./command/types";

const CommandCenter = dynamic(() => import("./command/CommandCenter"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[calc(100dvh-3.5rem)] place-items-center bg-bg text-sm text-dim">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-pulse rounded-full border border-accent/60" />
        Starting the command center
      </div>
    </div>
  ),
});

export function MapClient() {
  const params = useSearchParams();
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const label = params.get("label") ?? "Selected location";
  const pin = useMemo<Pin | null>(() => (params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon, label: label.slice(0, 120) } : null), [params, lat, lon, label]);
  return <CommandCenter pin={pin} />;
}
