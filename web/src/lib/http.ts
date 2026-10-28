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

async function fetchRaw(url: string, accept: string, opts: FetchOptions): Promise<Response> {
  const { timeoutMs = 10_000, headers = {}, signal } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, {
      headers: { accept, "user-agent": USER_AGENT, ...headers },
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    if (!res.ok) throw new HttpError(`HTTP ${res.status}`, res.status, url);
    return res;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (controller.signal.aborted) throw new HttpError(String((controller.signal.reason as Error)?.message ?? "aborted"), 0, url);
    throw new HttpError(err instanceof Error ? err.message : "network error", 0, url);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetchRaw(url, "application/json", opts);
  return (await res.json()) as T;
}

/** Fetch a text/XML/CSV body with the same timeout, header and abort handling as fetchJson.
 *  Decodes by byte-order mark so UTF-16 feeds (e.g. some government CSVs) are read correctly. */
export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  const res = await fetchRaw(url, "text/csv, text/xml, application/xml, text/plain, */*", opts);
  const buf = new Uint8Array(await res.arrayBuffer());
  let encoding = "utf-8";
  if (buf[0] === 0xff && buf[1] === 0xfe) encoding = "utf-16le";
  else if (buf[0] === 0xfe && buf[1] === 0xff) encoding = "utf-16be";
  return new TextDecoder(encoding).decode(buf);
}
