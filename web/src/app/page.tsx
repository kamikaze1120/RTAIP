import type { Metadata } from "next";
import { Suspense } from "react";
import { MapClient } from "@/components/MapClient";

export const metadata: Metadata = { title: { absolute: "RTAIP: Real Time Analysis and Intelligence Platform" } };

export default function CommandPage() {
  return (
    <Suspense fallback={null}>
      <MapClient />
    </Suspense>
  );
}
