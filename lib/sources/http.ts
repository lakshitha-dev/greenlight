/** Shared fetch helpers. Every outbound call is time-boxed so a slow source
 *  can never hang a research run — a source that times out becomes a
 *  "not found", which is a finding, not a crash. */

export type Prov = "verified" | "sourced" | "claimed" | "none";

export type Fact<T = unknown> = {
  value: T | null;
  prov: Prov;
  src: string;
  url?: string;
};

export const fact = <T>(value: T | null, prov: Prov, src = "", url?: string): Fact<T> => ({
  value,
  prov,
  src,
  url,
});

export const notFound = (src = ""): Fact<never> => ({ value: null, prov: "none", src });

export type Step = {
  source: string;
  result: string;
  kind: "done" | "hit" | "miss";
  url?: string;
  ms?: number;
};

const DEFAULT_TIMEOUT = 12_000;

export async function getJson<T>(
  url: string,
  opts: { timeout?: number; headers?: Record<string, string>; method?: string; body?: unknown } = {}
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout ?? DEFAULT_TIMEOUT);
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": "GreenLight/1.0 (BISTEC Global internal approval tooling)",
        ...(opts.body ? { "content-type": "application/json" } : {}),
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null; // timeout, DNS, offline — all become "no data"
  } finally {
    clearTimeout(timer);
  }
}

/** Simple in-process TTL cache. Keeps the 1.7 MB KEV catalogue out of the
 *  request path after the first fetch. */
const store = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  if (value !== null && value !== undefined) store.set(key, { at: Date.now(), value });
  return value;
}

/** Drops every cached response. Tests need it, and a cache with no way to
 *  invalidate it is a liability in its own right — a poisoned entry otherwise
 *  persists for the full TTL. */
export function clearCache(): void {
  store.clear();
}

/** Loose product matching. Requires 3+ chars so short names like "Go"
 *  cannot match half the catalogue. */
export function nameMatches(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase().trim();
  const n = needle.toLowerCase().trim();
  if (n.length < 3 || h.length < 3) return false;
  return h.includes(n) || n.includes(h);
}
