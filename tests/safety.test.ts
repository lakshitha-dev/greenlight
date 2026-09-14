/** The layers that stop bad data and bad requests becoming outages. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { safeParse, expect as expectShape, isArray, isObject } from "@/lib/json";
import { readBody, handler, fail } from "@/lib/api";
import { checkEnv, resetEnvCache } from "@/lib/env";

const post = (body: string | null) =>
  new Request("http://test/api/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

describe("safeParse — a corrupt row must not take down a page", () => {
  it("reads well-formed JSON", () => {
    expect(safeParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it("falls back on truncated JSON", () => {
    expect(safeParse('{"a":', { fallback: true })).toEqual({ fallback: true });
  });

  it("falls back on null, undefined and empty input", () => {
    expect(safeParse(null, [])).toEqual([]);
    expect(safeParse(undefined, [])).toEqual([]);
    expect(safeParse("", [])).toEqual([]);
  });

  it("treats the literal string null as absent, not as a value", () => {
    expect(safeParse("null", { ok: true })).toEqual({ ok: true });
  });
});

describe("expect — JSON that parses but is the wrong shape", () => {
  it("accepts the right shape", () => {
    expect(expectShape('[1,2]', isArray, [])).toEqual([1, 2]);
    expect(expectShape('{"a":1}', isObject, {})).toEqual({ a: 1 });
  });

  it("rejects an array where an object was wanted", () => {
    expect(expectShape("[1,2]", isObject, { safe: true })).toEqual({ safe: true });
  });

  it("rejects a string where an array was wanted — the case that used to throw later", () => {
    expect(expectShape('"not an array"', isArray, [])).toEqual([]);
  });

  it("rejects a number where an object was wanted", () => {
    expect(expectShape("42", isObject, {})).toEqual({});
  });
});

describe("readBody — malformed input is the caller's fault, not a 500", () => {
  const Schema = z.object({ id: z.string().min(1), n: z.number().optional() });

  it("accepts a valid body", async () => {
    const r = await readBody(post('{"id":"SR-1"}'), Schema);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("SR-1");
  });

  it("returns 400 for an empty body rather than throwing", async () => {
    const r = await readBody(post(null), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      expect((await r.response.json()).error).toMatch(/must be JSON/i);
    }
  });

  it("returns 400 for non-JSON", async () => {
    const r = await readBody(post("<html>"), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it("returns 400 for a literal null body", async () => {
    const r = await readBody(post("null"), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });

  it("returns 400 for the right key with the wrong type", async () => {
    const r = await readBody(post('{"id":123}'), Schema);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const body = await r.response.json();
      expect(r.response.status).toBe(400);
      expect(body.error).toMatch(/id/);
      expect(body.issues).toBeInstanceOf(Array);
    }
  });

  it("names the offending field so the caller can fix it", async () => {
    const r = await readBody(post('{"id":"x","n":"not a number"}'), Schema);
    if (!r.ok) expect((await r.response.json()).error).toMatch(/n:/);
  });
});

describe("handler — an unexpected throw is described, not leaked", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("passes a successful response through untouched", async () => {
    const h = handler("test", async () => fail(201, "made"));
    expect((await h()).status).toBe(201);
  });

  it("turns a throw into a 500 that says what failed", async () => {
    const h = handler("widget build", async () => {
      throw new Error("the widget exploded");
    });
    const res = await h();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/widget build failed/);
    expect(body.error).toMatch(/the widget exploded/);
  });

  it("handles a non-Error throw", async () => {
    const h = handler("odd", async () => {
      throw "just a string";
    });
    expect((await h()).status).toBe(500);
  });
});

describe("env validation — a misconfigured deploy must say so, loudly", () => {
  beforeEach(() => resetEnvCache());
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  const setEnv = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
  };

  it("accepts a SQLite URL in development", () => {
    setEnv({ DATABASE_URL: "file:./dev.db", NODE_ENV: "development" });
    expect(checkEnv().ok).toBe(true);
  });

  it("accepts a Postgres URL", () => {
    setEnv({ DATABASE_URL: "postgresql://user:pw@host/db", NODE_ENV: "production" });
    expect(checkEnv().ok).toBe(true);
  });

  it("reports a missing DATABASE_URL by name", () => {
    setEnv({ DATABASE_URL: undefined });
    const r = checkEnv();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/DATABASE_URL is not set/);
  });

  it("rejects a URL that is neither SQLite nor Postgres", () => {
    setEnv({ DATABASE_URL: "mysql://host/db" });
    expect(checkEnv().ok).toBe(false);
  });

  it("refuses SQLite in production — it cannot work on a serverless host", () => {
    setEnv({ DATABASE_URL: "file:./dev.db", NODE_ENV: "production" });
    const r = checkEnv();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/serverless/i);
  });

  it("rejects a PROCESS_ANALYZER_URL that is not a URL", () => {
    setEnv({
      DATABASE_URL: "file:./dev.db",
      NODE_ENV: "development",
      PROCESS_ANALYZER_URL: "not a url",
    });
    expect(checkEnv().ok).toBe(false);
  });
});
