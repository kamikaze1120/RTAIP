import type { Metadata } from "next";
import { Suspense } from "react";
import { MapClient } from "@/components/MapClient";

export const metadata: Metadata = { title: "Live map" };

export default function MapPage() {
  return (
    <Suspense fallback={null}>
      <MapClient />
    </Suspense>
  );
}
