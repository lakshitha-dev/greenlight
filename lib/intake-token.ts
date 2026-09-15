/** The shared secret the automated intake route accepts.
 *
 *  Split out of lib/email.ts because that module is imported by a client
 *  component to preview a pasted email, and webpack cannot bundle node:crypto
 *  for the browser. Server-only by construction rather than by convention. */

import { timingSafeEqual } from "node:crypto";

/** The shared secret a Power Automate flow sends, since it cannot hold a
 *  session. Compared in constant time, and failing closed when the secret is
 *  unset or short: without that floor an unconfigured deployment would accept
 *  an empty header as an empty secret and publish an open intake endpoint.
 *
 *  Lives here rather than in the route so it can be tested without pulling
 *  NextAuth into a unit test. */
export const MIN_TOKEN_LENGTH = 16;

export function intakeTokenOk(given: string | null | undefined): boolean {
  const expected = process.env.INTAKE_TOKEN ?? "";
  if (expected.length < MIN_TOKEN_LENGTH) return false;

  const a = Buffer.from(given ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first. That leaks the length of the secret and nothing else.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
