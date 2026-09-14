/** Data Protection Impact Assessment.
 *
 *  Screening first: a DPIA is drafted only when personal data is processed and
 *  an Article 35(3) trigger actually fires. Generating one for every request
 *  would be noise, and noise is how compliance controls die.
 *
 *  The assessment itself is mostly a re-reading of evidence the software
 *  research already gathered — which is why it takes seconds rather than a
 *  week. Each risk names the finding that produced it; none are invented. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { Request } from "@prisma/client";
import type { Fact } from "./sources/http";
import { expect, isArray } from "./json";

export type Trigger = { id: string; label: string; authority: string };
export type Likelihood = "Remote" | "Possible" | "Probable";
export type Severity = "Limited" | "Significant" | "Severe";
export type Band = "Low" | "Medium" | "High";

export type Risk = {
  id: string;
  risk: string;
  source: string;
  likelihood: Likelihood;
  severity: Severity;
  mitigation: string;
  residual: Band;
};

export type Screening = {
  required: boolean;
  triggers: Trigger[];
  note: string;
  regime: string;
  packVersion: string;
};

type DpiaPack = {
  id: string;
  version: string;
  regimes: Record<string, string>;
  matrix: { bands: { High: number; Medium: number } };
};

/** The shipped defaults. A screening pack that is missing or partially edited
 *  degrades to these rather than throwing — and unlike the software-approval
 *  packs, that is the right call here: these values are a documented risk
 *  matrix, not site-specific policy, so falling back is safe and keeps a bad
 *  YAML edit from taking three pages down with it. */
const DEFAULTS: DpiaPack = {
  id: "dpia-screening",
  version: "1.0",
  regimes: {},
  matrix: { bands: { High: 6, Medium: 3 } },
};

/** Loaded on first use, not at module scope. Next imports every route module
 *  during `next build` to read its config exports, so a read that throws up
 *  here fails the build rather than a request. */
let packCache: DpiaPack | null = null;

function pack(): DpiaPack {
  if (packCache) return packCache;
  try {
    const raw = YAML.parse(
      readFileSync(join(process.cwd(), "rules", "dpia-screening.yaml"), "utf8")
    ) as Partial<DpiaPack> | null;

    packCache = {
      id: raw?.id ?? DEFAULTS.id,
      version: String(raw?.version ?? DEFAULTS.version),
      regimes: raw?.regimes ?? DEFAULTS.regimes,
      matrix: {
        bands: {
          High: raw?.matrix?.bands?.High ?? DEFAULTS.matrix.bands.High,
          Medium: raw?.matrix?.bands?.Medium ?? DEFAULTS.matrix.bands.Medium,
        },
      },
    };
  } catch {
    packCache = DEFAULTS;
  }
  return packCache;
}

export function clearDpiaCache(): void {
  packCache = null;
}

const L: Record<Likelihood, number> = { Remote: 1, Possible: 2, Probable: 3 };
const S: Record<Severity, number> = { Limited: 1, Significant: 2, Severe: 3 };

const band = (l: Likelihood, s: Severity): Band => {
  const bands = pack().matrix.bands;
  const n = L[l] * S[s];
  return n >= bands.High ? "High" : n >= bands.Medium ? "Medium" : "Low";
};

export function regimeFor(entity: string): string {
  return pack().regimes?.[entity] ?? "Applicable data protection law";
}

export function screen(req: Request): Screening {
  const regime = regimeFor(req.entity);
  const base = { regime, packVersion: `${pack().id}@${pack().version}` };

  if (!req.personalData)
    return { required: false, triggers: [], note: "No personal data is processed.", ...base };

  const t: Trigger[] = [];
  if (req.specialCat)
    t.push({ id: "D1", label: "Special category data processed", authority: "GDPR Art.35(3)(b)" });
  if (req.subjectCount && req.subjectCount > 5000)
    t.push({
      id: "D2",
      label: `Large-scale processing — ${req.subjectCount.toLocaleString()} data subjects`,
      authority: "GDPR Art.35(3)(b)",
    });
  if (req.crossBorder === "true")
    t.push({
      id: "D3",
      label: "Personal data leaves the controlling jurisdiction",
      authority: "PDPA 2022 · GDPR Ch.V",
    });
  if (req.crossBorder === "unknown")
    t.push({
      id: "D3",
      label: "Transfer destination could not be established",
      authority: "PDPA 2022 · GDPR Ch.V",
    });
  if (req.automated)
    t.push({
      id: "D4",
      label: "Automated decision-making with legal or similar effect",
      authority: "GDPR Art.35(3)(a)",
    });
  if (req.monitoring)
    t.push({
      id: "D5",
      label: "Systematic monitoring of individuals",
      authority: "GDPR Art.35(3)(c)",
    });

  return {
    required: t.length > 0,
    triggers: t,
    note: t.length ? "" : "Personal data is processed, but no Article 35(3) trigger is met.",
    ...base,
  };
}

/** Severity of a data-handling risk scales with what is actually handled.
 *  A fixed severity produces a rating that never varies, which is no rating. */
function sensitivity(req: Request): Severity {
  if (req.specialCat || req.monitoring) return "Severe";
  if (req.subjectCount === null) return "Significant"; // unbounded population
  return "Limited";
}

export function risks(req: Request, facts: Record<string, Fact<unknown>>): Risk[] {
  const out: Risk[] = [];
  const add = (
    id: string,
    risk: string,
    source: string,
    likelihood: Likelihood,
    severity: Severity,
    mitigation: string
  ) => out.push({ id, risk, source, likelihood, severity, mitigation, residual: band(likelihood, severity) });

  const has = (k: string) => Boolean(facts[k]?.value) && facts[k]?.prov !== "none";
  const provOf = (k: string) => facts[k]?.prov ?? "none";

  if (!has("subprocessors"))
    add(
      "P1",
      "Onward transfers to sub-processors cannot be verified",
      "Sub-processor list not found during research",
      "Possible",
      "Significant",
      "Require full sub-processor disclosure as a contractual condition before onboarding, re-verified annually."
    );

  if (req.crossBorder === "true") {
    const residency = facts.residency?.value ? String(facts.residency.value) : "undisclosed";
    const claimed = provOf("residency") === "claimed";
    add(
      "P2",
      "Personal data leaves the controlling jurisdiction",
      `Data residency: ${residency}${claimed ? " (vendor claim, unverified)" : ""}`,
      "Probable",
      has("dpa") ? "Limited" : "Severe",
      has("dpa")
        ? "Executed DPA with standard contractual clauses covers the transfer. Verify the residency claim independently."
        : "No DPA located — the transfer currently has no lawful mechanism. Must be executed before processing begins."
    );
  }

  if (req.crossBorder === "unknown")
    add(
      "P2",
      "Transfer destination unknown",
      "Vendor publishes no data residency information",
      "Probable",
      "Severe",
      "Cannot be mitigated on the available information. Obtain written residency and sub-processor disclosure before processing."
    );

  const grade = facts.privacyGrade?.value ? String(facts.privacyGrade.value) : null;
  if (grade && ["C", "D", "E"].includes(grade))
    add(
      "P3",
      "Personal data retained after account termination",
      `ToSDR privacy grade ${grade} — severity scaled to ${sensitivity(req).toLowerCase()} given the data handled`,
      "Probable",
      sensitivity(req),
      "Contractual deletion obligation on termination, with written confirmation of erasure within 30 days."
    );

  if (facts.sso?.value === false)
    add(
      "P4",
      "Access control weaker than the BISTEC standard",
      "SSO / SAML not available on the tier requested",
      "Possible",
      "Significant",
      "Enforce application-level MFA, or move to the tier supporting SAML before rollout."
    );

  if (req.monitoring)
    add(
      "P5",
      "Sessions may capture data beyond what is being diagnosed",
      "Systematic monitoring — remote screen takeover",
      "Probable",
      "Severe",
      "Session recording off by default; explicit end-user consent prompt before takeover; recordings purged at 30 days."
    );

  if (!has("soc2"))
    add(
      "P6",
      "Vendor security posture cannot be independently verified",
      "No SOC 2 Type II report located",
      "Possible",
      "Severe",
      "Do not process personal data until an independent assurance report is provided."
    );

  return out;
}

export const worst = (rs: Risk[]): Band =>
  rs.some((r) => r.residual === "High") ? "High" : rs.some((r) => r.residual === "Medium") ? "Medium" : "Low";

export function categoriesOf(req: Request): string[] {
  return expect<string[]>(req.categories, isArray, []);
}
