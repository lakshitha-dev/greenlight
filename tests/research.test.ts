/** Assembling a dossier from four independent sources.
 *
 *  The property under test: one source failing costs that source's evidence
 *  and nothing else. Promise.all used to reject on the first failure and throw
 *  away three results that had already succeeded, turning one flaky feed into
 *  a failed research run. */

import { describe, it, expect, vi, beforeEach } from "vitest";

const kevOk = {
  available: true,
  catalogVersion: "2026.09.11",
  total: 1709,
  entries: [],
  latest: undefined,
  since: undefined,
  step: { source: "CISA Known Exploited Vulnerabilities", result: "clean", kind: "done" as const },
};
const nvdOk = {
  available: true,
  total: 3,
  critical: 1,
  high: 2,
  step: { source: "NIST National Vulnerability Database", result: "ok", kind: "done" as const },
};
const tosdrOk = {
  available: true,
  grade: "B",
  service: "Slack",
  step: { source: "ToSDR privacy grading", result: "Grade B", kind: "done" as const },
};
const osvOk = {
  checked: true,
  count: 0,
  ids: [],
  step: { source: "OSV.dev open-source advisories", result: "none", kind: "done" as const },
};

const checkKev = vi.fn();
const checkNvd = vi.fn();
const checkTosdr = vi.fn();
const checkOsv = vi.fn();

vi.mock("@/lib/sources/kev", () => ({ checkKev: (...a: unknown[]) => checkKev(...a) }));
vi.mock("@/lib/sources/nvd", () => ({ checkNvd: (...a: unknown[]) => checkNvd(...a) }));
vi.mock("@/lib/sources/tosdr", () => ({ checkTosdr: (...a: unknown[]) => checkTosdr(...a) }));
vi.mock("@/lib/sources/osv", () => ({ checkOsv: (...a: unknown[]) => checkOsv(...a) }));
vi.mock("@/lib/sources/claude", () => ({
  hasKey: () => false,
  researchCompliance: async () => ({
    facts: {
      soc2: { value: null, prov: "none", src: "" },
      iso27001: { value: null, prov: "none", src: "" },
      dpa: { value: null, prov: "none", src: "" },
      subprocessors: { value: null, prov: "none", src: "" },
      residency: { value: null, prov: "none", src: "" },
      sso: { value: null, prov: "none", src: "" },
      annualCost: { value: null, prov: "none", src: "" },
      summary: null,
    },
    steps: [],
  }),
}));

const { research } = await import("@/lib/research");

beforeEach(() => {
  checkKev.mockResolvedValue(kevOk);
  checkNvd.mockResolvedValue(nvdOk);
  checkTosdr.mockResolvedValue(tosdrOk);
  checkOsv.mockResolvedValue(osvOk);
});

describe("research — all four sources healthy", () => {
  it("records a verified fact from each structured source", async () => {
    const d = await research("Slack", "Salesforce", 10);
    expect(d.facts.kevEntries.prov).toBe("verified");
    expect(d.facts.criticalCves.value).toBe(1);
    expect(d.facts.privacyGrade.value).toBe("B");
  });

  it("marks compliance evidence as not found when synthesis is unavailable", async () => {
    const d = await research("Slack", "Salesforce", 10);
    for (const k of ["soc2", "dpa", "subprocessors", "residency"]) {
      expect(d.facts[k].prov, k).toBe("none");
    }
  });

  it("notes when the requester supplied no vendor", async () => {
    const d = await research("Slack", null, null);
    expect(d.steps[0].kind).toBe("miss");
  });
});

describe("research — one source failing must not lose the others", () => {
  it("keeps the other three when CISA throws", async () => {
    checkKev.mockRejectedValue(new Error("catalogue schema changed"));
    const d = await research("Slack", "Salesforce", 10);

    expect(d.facts.criticalCves.prov).toBe("verified");
    expect(d.facts.privacyGrade.value).toBe("B");
  });

  it("records the failed source as unavailable rather than clean", async () => {
    checkKev.mockRejectedValue(new Error("catalogue schema changed"));
    const d = await research("Slack", "Salesforce", 10);

    expect(d.facts.kevEntries.prov).toBe("none");
    const failed = d.steps.find((s) => s.source === "CISA KEV");
    expect(failed?.kind).toBe("miss");
    expect(failed?.result).toMatch(/not as clean/i);
  });

  it("survives every structured source failing at once", async () => {
    checkKev.mockRejectedValue(new Error("a"));
    checkNvd.mockRejectedValue(new Error("b"));
    checkTosdr.mockRejectedValue(new Error("c"));
    checkOsv.mockRejectedValue(new Error("d"));

    const d = await research("Slack", "Salesforce", 10);
    expect(d.facts.kevEntries.prov).toBe("none");
    expect(d.facts.criticalCves.prov).toBe("none");
    expect(d.steps.filter((s) => s.kind === "miss").length).toBeGreaterThanOrEqual(4);
  });

  it("never reports an unreachable source as a clean result", async () => {
    checkKev.mockResolvedValue({ ...kevOk, available: false, step: { ...kevOk.step, kind: "miss" } });
    const d = await research("Slack", "Salesforce", 10);
    expect(d.facts.kevEntries.value).toBeNull();
    expect(d.facts.kevEntries.src).toMatch(/unreachable/i);
  });

  it("always returns a dossier with a measured duration", async () => {
    checkNvd.mockRejectedValue(new Error("boom"));
    const d = await research("Slack", "Salesforce", 10);
    expect(d.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(d.steps.length).toBeGreaterThan(0);
  });
});
