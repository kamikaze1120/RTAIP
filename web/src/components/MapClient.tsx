"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Skeleton } from "./ui";
import type { Pin } from "./MapExplorer";

const MapExplorer = dynamic(() => import("./MapExplorer"), {
  ssr: false,
  loading: () => (
    <div className="p-4">
      <Skeleton className="h-[70vh] w-full" />
    </div>
  ),
});

export function MapClient() {
  const params = useSearchParams();
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const label = params.get("label") ?? "Selected location";
  const pin = useMemo<Pin | null>(() => (params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon, label: label.slice(0, 120) } : null), [params, lat, lon, label]);
  return <MapExplorer pin={pin} />;
}
