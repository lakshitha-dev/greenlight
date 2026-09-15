/** Runs every source and assembles one dossier.
 *
 *  Structured sources run in parallel; the synthesis layer runs after, because
 *  it needs no input from them and its latency dominates. Every field that
 *  lands in the dossier carries where it came from — a value with no
 *  provenance never enters. */

import { checkKev } from "./sources/kev";
import { checkNvd } from "./sources/nvd";
import { checkTosdr } from "./sources/tosdr";
import { checkOsv } from "./sources/osv";
import { researchCompliance, hasKey, credentialKind } from "./sources/claude";
import { fact, notFound, type Fact, type Step } from "./sources/http";

export type Facts = Record<string, Fact<unknown>>;

export type Dossier = {
  facts: Facts;
  steps: Step[];
  model?: string;
  elapsedMs: number;
  summary: string | null;
};

export async function research(
  product: string,
  vendor: string | null,
  seats: number | null,
  opts: { approvedSince?: string } = {}
): Promise<Dossier> {
  const t0 = Date.now();
  const steps: Step[] = [];

  steps.push({
    source: "Resolving vendor identity",
    result: vendor ? `${vendor} → product ${product}` : `${product} — no vendor supplied by requester`,
    kind: vendor ? "done" : "miss",
  });

  /** allSettled, not all: Promise.all rejects on the first failure and throws
   *  away the three results that did succeed. A source that breaks should cost
   *  us that source's evidence, not the whole dossier. */
  const settled = await Promise.allSettled([
    checkKev(product, vendor ?? undefined, opts.approvedSince),
    checkNvd(product),
    checkTosdr(product),
    checkOsv(product),
  ]);

  const names = ["CISA KEV", "NIST NVD", "ToSDR", "OSV.dev"];
  settled.forEach((r, i) => {
    if (r.status === "rejected")
      steps.push({
        source: names[i],
        result: `Source failed unexpectedly (${r.reason instanceof Error ? r.reason.message.slice(0, 90) : "unknown"}). Recorded as unavailable, not as clean.`,
        kind: "miss",
      });
  });

  const kev = settled[0].status === "fulfilled" ? settled[0].value : null;
  const nvd = settled[1].status === "fulfilled" ? settled[1].value : null;
  const tosdr = settled[2].status === "fulfilled" ? settled[2].value : null;
  const osv = settled[3].status === "fulfilled" ? settled[3].value : null;

  for (const s of [kev?.step, nvd?.step, tosdr?.step, osv?.step]) if (s) steps.push(s);

  const compliance = await researchCompliance(product, vendor, seats, (s) => steps.push(s));

  const facts: Facts = {
    // ── verified: structured, keyless, independently checkable ──
    kevEntries: kev?.available
      ? fact(kev.entries.length, "verified", `CISA KEV catalogue ${kev!.catalogVersion}`, kev!.step.url)
      : notFound("CISA KEV unreachable"),
    kevLatest: kev?.latest
      ? fact(`${kev!.latest!.cveID} · added ${kev!.latest!.dateAdded}`, "verified", "CISA KEV", kev!.step.url)
      : notFound(),
    kevSince:
      kev?.since !== undefined ? fact(kev.since, "verified", "CISA KEV", kev.step.url) : notFound(),
    criticalCves: nvd?.available
      ? fact(nvd!.critical ?? 0, "verified", "NIST NVD", nvd!.step.url)
      : notFound("NVD did not respond"),
    highCves: nvd?.available ? fact(nvd!.high ?? 0, "verified", "NIST NVD", nvd!.step.url) : notFound(),
    privacyGrade: tosdr?.available
      ? fact(tosdr!.grade, "verified", `ToSDR — ${tosdr!.service}`, tosdr!.step.url)
      : notFound("Not rated by ToSDR"),
    osvAdvisories: fact(osv?.count ?? 0, "verified", "OSV.dev", osv?.step.url),

    // ── sourced / claimed: from the web, attributed ──
    soc2: compliance.facts.soc2,
    iso27001: compliance.facts.iso27001,
    dpa: compliance.facts.dpa,
    subprocessors: compliance.facts.subprocessors,
    residency: compliance.facts.residency,
    sso: compliance.facts.sso,
    annualCost: compliance.facts.annualCost,
  };

  return {
    facts,
    steps,
    model: compliance.model,
    elapsedMs: Date.now() - t0,
    summary: compliance.facts.summary,
  };
}

export { hasKey, credentialKind };

/** Ordered for display. Label is what a person reads; the key is what rules bind to. */
export const FACT_ROWS: [string, string][] = [
  ["kevEntries", "Actively-exploited vulnerabilities (KEV)"],
  ["kevLatest", "Most recent KEV entry"],
  ["criticalCves", "Critical CVEs, last 24 months"],
  ["highCves", "High-severity CVEs, last 24 months"],
  ["privacyGrade", "Privacy grade (ToSDR)"],
  ["osvAdvisories", "Open-source advisories (OSV)"],
  ["soc2", "SOC 2 Type II"],
  ["iso27001", "ISO 27001 certification"],
  ["dpa", "Data Processing Agreement"],
  ["subprocessors", "Sub-processor list"],
  ["residency", "Data residency"],
  ["sso", "SSO / SAML support"],
  ["annualCost", "Annual cost"],
];

export function displayValue(key: string, f: Fact<unknown>): string {
  if (f.value === null || f.prov === "none") return "Not found";
  if (typeof f.value === "boolean") return f.value ? "Published" : "Not supported";
  if (key === "annualCost") return "LKR " + Number(f.value).toLocaleString("en-LK");
  return String(f.value);
}

export const PROV_LABEL: Record<string, string> = {
  verified: "verified",
  sourced: "sourced",
  claimed: "vendor claim",
  none: "not found",
};
