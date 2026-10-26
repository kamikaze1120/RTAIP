import { useMemo, useSyncExternalStore } from "react";
import type { Snapshot } from "./useInvestigation";

const KEY = "rtaip.investigations.v1";
const MAX = 20;
const EVENT = "rtaip:saved-changed";

export interface SavedInvestigation extends Snapshot {
  id: string;
  title: string;
  savedAt: string;
}

export function readSaved(): SavedInvestigation[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SavedInvestigation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeSaved(list: SavedInvestigation[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event(EVENT));
    return true;
  } catch {
    return false;
  }
}

export function saveInvestigation(snap: Snapshot): SavedInvestigation[] | null {
  const entry: SavedInvestigation = { ...snap, id: `${Date.now().toString(36)}`, title: snap.seeds[0] ?? "Investigation", savedAt: new Date().toISOString() };
  const next = [entry, ...readSaved().filter((s) => s.title !== entry.title)].slice(0, MAX);
  return writeSaved(next) ? next : null;
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function rawSnapshot(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

/** Saved investigations from this browser. Empty on the server and on first paint. */
export function useSavedInvestigations(): SavedInvestigation[] {
  const raw = useSyncExternalStore(subscribe, rawSnapshot, () => "[]");
  return useMemo(() => {
    try {
      const parsed = JSON.parse(raw) as SavedInvestigation[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [raw]);
}
