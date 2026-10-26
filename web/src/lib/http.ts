export const USER_AGENT = "RTAIP/0.1 (+https://rtaip.vercel.app; open source intelligence research)";

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { timeoutMs = 10_000, headers = {}, signal } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT, ...headers },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, url);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (controller.signal.aborted) throw new HttpError(String((controller.signal.reason as Error)?.message ?? "aborted"), 0, url);
    throw new HttpError(err instanceof Error ? err.message : "network error", 0, url);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
