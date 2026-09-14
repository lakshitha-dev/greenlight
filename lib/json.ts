/** Parsing stored JSON columns.
 *
 *  Every JSON column in this schema was written by us, which is exactly why a
 *  corrupt one is worth defending against: it means something upstream went
 *  wrong, and the right response is to degrade that row — not to take down a
 *  page listing a hundred healthy ones.
 *
 *  `expect` guards the second failure mode, which is nastier than a throw:
 *  JSON that parses cleanly but is the wrong shape. `JSON.parse("null")`
 *  succeeds, and the TypeError then surfaces three call frames away. */

export function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : (value as T);
  } catch {
    return fallback;
  }
}

/** Parse and confirm the shape, or take the fallback. */
export function expect<T>(
  raw: string | null | undefined,
  is: (v: unknown) => boolean,
  fallback: T
): T {
  const value = safeParse<unknown>(raw, null);
  return value !== null && is(value) ? (value as T) : fallback;
}

export const isArray = (v: unknown): boolean => Array.isArray(v);
export const isObject = (v: unknown): boolean =>
  typeof v === "object" && v !== null && !Array.isArray(v);
