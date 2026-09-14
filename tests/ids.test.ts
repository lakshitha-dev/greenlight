/** Request identifiers.
 *
 *  These were minted from row counts in two places with different offsets —
 *  `SR-${1100 + n}` at intake and `SR-${1200 + n}` in the endpoint-raise route
 *  — which collide on the primary key once the table passes about a hundred
 *  rows. Deterministic, not a race, so it is worth pinning down. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkOsv } from "@/lib/sources/osv";
import { clearCache } from "@/lib/sources/http";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ db: { request: { findMany: (...a: unknown[]) => findMany(...a) } } }));

const { nextRequestId, withUniqueId } = await import("@/lib/ids");

const rows = (...ids: string[]) => ids.map((id) => ({ id }));

beforeEach(() => findMany.mockReset());

describe("nextRequestId", () => {
  it("starts above the reserved range on an empty table", async () => {
    findMany.mockResolvedValue([]);
    expect(await nextRequestId()).toBe("SR-1001");
  });

  it("continues from the highest id, not from the row count", async () => {
    // the count-based bug: three rows but ids in the 1200s
    findMany.mockResolvedValue(rows("SR-1200", "SR-1201", "SR-1202"));
    expect(await nextRequestId()).toBe("SR-1203");
  });

  it("does not collide when the two old offset ranges are both present", async () => {
    findMany.mockResolvedValue(rows("SR-1100", "SR-1101", "SR-1200", "SR-1201"));
    const next = await nextRequestId();
    expect(next).toBe("SR-1202");
    expect(["SR-1100", "SR-1101", "SR-1200", "SR-1201"]).not.toContain(next);
  });

  it("ignores ids that do not carry a number", async () => {
    findMany.mockResolvedValue(rows("SR-legacy", "SR-1005", "SR-"));
    expect(await nextRequestId()).toBe("SR-1006");
  });

  it("handles a gap in the sequence without reusing a deleted id", async () => {
    findMany.mockResolvedValue(rows("SR-1001", "SR-1009"));
    expect(await nextRequestId()).toBe("SR-1010");
  });
});

describe("withUniqueId", () => {
  it("passes a fresh id to the creator and returns its result", async () => {
    findMany.mockResolvedValue(rows("SR-1004"));
    const created = await withUniqueId(async (id) => ({ id, ok: true }));
    expect(created).toEqual({ id: "SR-1005", ok: true });
  });

  it("retries on a unique-constraint violation", async () => {
    findMany
      .mockResolvedValueOnce(rows("SR-1004"))
      .mockResolvedValueOnce(rows("SR-1004", "SR-1005"));

    let attempts = 0;
    const created = await withUniqueId(async (id) => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error("duplicate"), { code: "P2002" });
      return { id };
    });

    expect(attempts).toBe(2);
    expect(created).toEqual({ id: "SR-1006" });
  });

  it("does not retry an error that is not a collision", async () => {
    findMany.mockResolvedValue([]);
    let attempts = 0;
    await expect(
      withUniqueId(async () => {
        attempts++;
        throw new Error("database is on fire");
      })
    ).rejects.toThrow(/on fire/);
    expect(attempts).toBe(1);
  });

  it("gives up after the attempt limit rather than looping forever", async () => {
    findMany.mockResolvedValue([]);
    let attempts = 0;
    await expect(
      withUniqueId(async () => {
        attempts++;
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }, 3)
    ).rejects.toBeTruthy();
    expect(attempts).toBe(3);
  });
});

describe("OSV.dev", () => {
  const json = (body: unknown) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

  beforeEach(() => {
    clearCache();
    vi.unstubAllGlobals();
  });

  it("reports advisories against a published package", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ vulns: [{ id: "GHSA-1" }, { id: "GHSA-2" }] })));
    const r = await checkOsv("lodash");
    expect(r.count).toBeGreaterThan(0);
    expect(r.step.kind).toBe("hit");
  });

  it("says plainly that a hosted service has no package, rather than implying safety", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({})));
    const r = await checkOsv("Notion");
    expect(r.count).toBe(0);
    expect(r.step.result).toMatch(/hosted service/i);
  });

  it("de-duplicates the same advisory found in several ecosystems", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ vulns: [{ id: "GHSA-same" }] })));
    expect((await checkOsv("thing")).ids).toEqual(["GHSA-same"]);
  });

  it("survives every ecosystem query failing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const r = await checkOsv("thing");
    expect(r.count).toBe(0);
    expect(r.checked).toBe(true);
  });
});
