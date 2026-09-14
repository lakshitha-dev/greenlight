/** Request handling shared by every route.
 *
 *  Three things were wrong before: `await req.json()` threw on an empty body,
 *  so the 400 on the next line never ran; truthiness guards let `{id: 123}`
 *  through to Prisma, which answered with a validation error as a 500; and no
 *  handler had a try/catch, so an unexpected throw returned a stack digest.
 *
 *  A caller sending nonsense should be told so. Only a genuine fault in here
 *  should ever be a 500. */

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export function fail(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Parse and validate a JSON body. Never throws. */
export async function readBody<T>(req: Request, schema: ZodType<T>): Promise<Parsed<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: fail(400, "Request body must be JSON. It was empty or could not be parsed."),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      const path = i.path.length ? i.path.join(".") : "body";
      return `${path}: ${i.message}`;
    });
    return { ok: false, response: fail(400, `Invalid request body — ${issues.join("; ")}`, { issues }) };
  }

  return { ok: true, data: result.data };
}

/** Wraps a handler so an unexpected throw becomes a described 500 rather than
 *  an opaque digest, and is logged with the route that produced it. */
export function handler<A extends unknown[]>(
  name: string,
  fn: (...args: A) => Promise<NextResponse>
) {
  return async (...args: A): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (e) {
      const message = e instanceof Error ? e.message : "unknown error";
      console.error(`[greenlight] ${name} failed:`, e);
      return fail(500, `${name} failed: ${message}`);
    }
  };
}
