"use client";

import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { buttonClass, Skeleton } from "./ui";

export function RequireSignIn({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  const { user, loading, openSignIn } = useAuth();
  if (loading) {
    return (
      <div className="mx-auto max-w-[1000px] space-y-3 px-4 py-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-line bg-panel text-accent">
          <Lock size={20} />
        </span>
        <h1 className="mt-5 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-dim">{hint}</p>
        <button type="button" onClick={openSignIn} className={`${buttonClass("primary")} mt-6`}>Continue with email</button>
      </div>
    );
  }
  return <>{children}</>;
}
