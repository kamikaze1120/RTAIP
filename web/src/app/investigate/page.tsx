import type { Metadata } from "next";
import { Suspense } from "react";
import { InvestigateView } from "@/components/InvestigateView";

export const metadata: Metadata = { title: "Investigate" };

export default function InvestigatePage() {
  return (
    <Suspense fallback={null}>
      <InvestigateView />
    </Suspense>
  );
}
