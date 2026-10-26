interface Entry<T> {
  value: T;
  storedAt: number;
}

const MAX_ENTRIES = 500;
const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface CachedResult<T> {
  value: T;
  stale: boolean;
  fetchedAt: number;
}

/**
 * Read through cache with in flight de duplication. When the loader fails and an
 * older value exists, that value is served and marked stale instead of failing.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<CachedResult<T>> {
  const hit = store.get(key) as Entry<T> | undefined;
  const now = Date.now();
  if (hit && now - hit.storedAt < ttlMs) return { value: hit.value, stale: false, fetchedAt: hit.storedAt };

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  try {
    const value = await pending;
    store.set(key, { value, storedAt: Date.now() });
    if (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
    return { value, stale: false, fetchedAt: Date.now() };
  } catch (err) {
    if (hit) return { value: hit.value, stale: true, fetchedAt: hit.storedAt };
    throw err;
  }
}

export function clearCache(): void {
  store.clear();
  inflight.clear();
}
