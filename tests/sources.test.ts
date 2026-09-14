/** Source adapters, with the network mocked.
 *
 *  The single most important property here: a source that cannot be reached
 *  must report "unavailable", never "clean". Reporting an unreachable CISA
 *  catalogue as zero vulnerabilities would approve exploited software. */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkKev } from "@/lib/sources/kev";
import { checkNvd } from "@/lib/sources/nvd";
import { checkTosdr } from "@/lib/sources/tosdr";
import { isThirdParty, normalise, fetchScan, isUp } from "@/lib/sources/analyzer";
import { clearCache } from "@/lib/sources/http";
import { proc } from "./factories";

const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response);

const offline = () => Promise.reject(new Error("ECONNREFUSED"));

beforeEach(() => {
  clearCache();
  vi.restoreAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("CISA KEV", () => {
  const entry = (dateAdded: string, cveID: string) => ({
    cveID,
    vendorProject: "ConnectWise",
    product: "ScreenConnect",
    dateAdded,
    vulnerabilityName: "x",
    shortDescription: "x",
    requiredAction: "x",
  });

  const catalog = {
    catalogVersion: "2026.09.11",
    dateReleased: "2026-09-11",
    count: 1709,
    vulnerabilities: [entry("2026-09-11", "CVE-2026-84869"), entry("2025-01-04", "CVE-2025-1")],
  };

  it("finds entries by product name", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(catalog)));
    const r = await checkKev("ScreenConnect", "ConnectWise");
    expect(r.available).toBe(true);
    expect(r.entries).toHaveLength(2);
    expect(r.latest?.dateAdded).toBe("2026-09-11");
    expect(r.step.kind).toBe("hit");
  });

  it("reports clean when the catalogue genuinely has no entry", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(catalog)));
    const r = await checkKev("Slack", "Salesforce");
    expect(r.available).toBe(true);
    expect(r.entries).toHaveLength(0);
    expect(r.step.result).toMatch(/clean/i);
  });

  it("reports UNAVAILABLE, not clean, when unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(offline));
    const r = await checkKev("Slack");
    expect(r.available).toBe(false);
    expect(r.step.kind).toBe("miss");
    expect(r.step.result).toMatch(/not as clean/i);
  });

  it("reports unavailable on a 200 whose body is the wrong shape", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ message: "service unavailable" })));
    expect((await checkKev("Slack")).available).toBe(false);
  });

  it("ignores catalogue rows that are missing fields", async () => {
    const mixed = { ...catalog, vulnerabilities: [null, { product: 42 }, catalog.vulnerabilities[0]] };
    vi.stubGlobal("fetch", vi.fn(() => json(mixed)));
    expect((await checkKev("ScreenConnect")).entries).toHaveLength(1);
  });

  it("counts entries added since a date, which drives catalog re-escalation", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json(catalog)));
    expect((await checkKev("ScreenConnect", "ConnectWise", "2026-01-01")).since).toBe(1);
  });
});

describe("NIST NVD", () => {
  const cve = (published: string, baseSeverity: string) => ({
    cve: {
      id: "CVE-X",
      published,
      lastModified: published,
      metrics: { cvssMetricV31: [{ cvssData: { baseSeverity, baseScore: 9 } }] },
    },
  });

  const monthsAgo = (n: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    return d.toISOString();
  };

  it("counts critical and high CVEs from the last 24 months", async () => {
    const body = { totalResults: 2, vulnerabilities: [cve(monthsAgo(3), "CRITICAL"), cve(monthsAgo(3), "HIGH")] };
    vi.stubGlobal("fetch", vi.fn(() => json(body)));
    const r = await checkNvd("slack");
    expect(r.critical).toBe(1);
    expect(r.high).toBe(1);
  });

  it("excludes CVEs older than the window", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ totalResults: 1, vulnerabilities: [cve("2003-01-01T00:00:00Z", "CRITICAL")] })));
    expect((await checkNvd("old")).critical).toBe(0);
  });

  it("reports unavailable rather than zero when it does not respond", async () => {
    vi.stubGlobal("fetch", vi.fn(offline));
    const r = await checkNvd("slack");
    expect(r.available).toBe(false);
    expect(r.critical).toBeUndefined();
    expect(r.step.kind).toBe("miss");
  });

  it("survives a throttle response that omits the vulnerabilities array", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ message: "rate limited" })));
    expect((await checkNvd("slack")).available).toBe(false);
  });

  it("ignores rows with an unparseable published date", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ totalResults: 1, vulnerabilities: [cve("not-a-date", "CRITICAL")] })));
    expect((await checkNvd("x")).critical).toBe(0);
  });
});

describe("ToSDR", () => {
  const services = [
    { id: 1, name: "ZoomInfo", slug: "zoominfo", rating: "D", urls: [], is_comprehensively_reviewed: false },
    { id: 2, name: "Zoom", slug: "zoom", rating: "B", urls: [], is_comprehensively_reviewed: true },
  ];

  it("prefers an exact name match over a loose one", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ services })));
    const r = await checkTosdr("Zoom");
    expect(r.service).toBe("Zoom");
    expect(r.grade).toBe("B");
  });

  it("treats an unrated service as unavailable, not as a good grade", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ services: [{ id: 3, name: "Obscure", slug: "o", rating: null, urls: [] }] })));
    const r = await checkTosdr("Obscure");
    expect(r.available).toBe(false);
    expect(r.grade).toBeUndefined();
  });

  it("flags a poor grade as a hit", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ services: [{ id: 4, name: "Bad", slug: "b", rating: "E", urls: [] }] })));
    expect((await checkTosdr("Bad")).step.kind).toBe("hit");
  });

  it("ignores malformed service entries", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ services: [null, { rating: "A" }, services[1]] })));
    expect((await checkTosdr("Zoom")).grade).toBe("B");
  });

  it("copes with a body that has no services at all", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({})));
    expect((await checkTosdr("Anything")).available).toBe(false);
  });
});

describe("process-analyzer client", () => {
  it("returns null rather than throwing when the analyzer is down", async () => {
    vi.stubGlobal("fetch", vi.fn(offline));
    expect(await fetchScan()).toBeNull();
    expect(await isUp()).toBe(false);
  });

  it("reports up when the analyzer answers", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ whitelisted: [], blacklisted: [] })));
    expect(await isUp()).toBe(true);
  });

  it("filters native Windows and Microsoft components out", () => {
    expect(isThirdParty(proc({ category: "Native Windows" }))).toBe(false);
    expect(isThirdParty(proc({ category: "Microsoft" }))).toBe(false);
    expect(isThirdParty(proc({ category: "Third-party" }))).toBe(true);
    expect(isThirdParty(proc({ category: "Unknown" }))).toBe(true);
  });

  it("normalises names for matching", () => {
    expect(normalise("  Slack.EXE ")).toBe("slack.exe");
  });
});
