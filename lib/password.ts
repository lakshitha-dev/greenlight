/** Password hashing on node:crypto.
 *
 *  scrypt rather than bcrypt because bcrypt is a native module that needs a
 *  compiler — which is a poor thing to discover on a deploy host, and worse on
 *  Windows. scrypt is in the standard library, is memory-hard, and is what
 *  Node's own documentation points at for this.
 *
 *  Comparison is timing-safe: comparing hashes with === leaks how many leading
 *  bytes matched, which is enough to recover a hash byte by byte. */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, KEYLEN);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = await derive(password, salt, expected.length);

  // lengths must match before timingSafeEqual, which throws otherwise
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
