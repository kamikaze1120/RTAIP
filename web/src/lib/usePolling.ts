"use client";

import { useEffect, useState } from "react";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  updatedAt: number | null;
}

/** Fetches a JSON endpoint now and then every intervalMs. Pass null to pause. */
export function usePolling<T>(url: string | null, intervalMs: number): PollState<T> {
  const [state, setState] = useState<PollState<T>>({ data: null, error: null, loading: Boolean(url), updatedAt: null });

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        const body = (await res.json()) as T & { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setState({ data: body, error: null, loading: false, updatedAt: Date.now() });
      } catch (err) {
        if (controller.signal.aborted) return;
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : "Request failed", loading: false }));
      }
    };
    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return state;
}
