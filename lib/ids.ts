/** Request identifiers.
 *
 *  These used to be minted as `SR-${count + offset}` in two places with
 *  different offsets (1100 in the intake form, 1200 in the endpoint raise
 *  route). Past roughly a hundred rows the two ranges overlap and collide on
 *  the primary key — deterministic, not a race. One generator, one range, and
 *  it asks the database what already exists rather than counting rows. */

import { db } from "./db";

const PREFIX = "SR-";
const FIRST = 1000;

export async function nextRequestId(): Promise<string> {
  const latest = await db.request.findMany({
    where: { id: { startsWith: PREFIX } },
    select: { id: true },
  });

  const highest = latest.reduce((max, r) => {
    const n = Number.parseInt(r.id.slice(PREFIX.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, FIRST);

  return `${PREFIX}${highest + 1}`;
}

/** Retries once on the unique-constraint violation two concurrent callers can
 *  still produce. Serialising every intake behind a lock would cost more than
 *  this is worth. */
export async function withUniqueId<T>(
  create: (id: string) => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await create(await nextRequestId());
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== "P2002") throw e;
      lastError = e;
    }
  }
  throw lastError;
}
