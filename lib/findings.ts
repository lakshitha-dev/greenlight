/** The bridge between Claude and GreenLight when there is no API key.
 *
 *  A person runs the software-compliance-research Skill in Claude, on their
 *  own subscription, and pastes the JSON back. This validates that paste and
 *  turns it into the same typed, provenance-carrying facts the API path would
 *  have produced — so everything downstream, the rule pack included, cannot
 *  tell the difference and does not need to.
 *
 *  The validation is strict on purpose. A pasted blob is untrusted input, and
 *  the whole premise of the tool is that a fact without provenance never
 *  reaches a rule. */

import { z } from "zod";
import { fact, notFound, type Fact } from "./sources/http";

const Provenance = z.enum(["sourced", "claimed", "none"]);

const BoolField = z.object({
  value: z.boolean().nullable(),
  provenance: Provenance,
  source: z.string().nullable().optional(),
});

const StringField = z.object({
  value: z.string().nullable(),
  provenance: Provenance,
  source: z.string().nullable().optional(),
});

const NumberField = z.object({
  value: z.number().nullable(),
  provenance: Provenance,
  source: z.string().nullable().optional(),
});

export const FindingsSchema = z.object({
  product: z.string().optional(),
  vendor: z.string().nullable().optional(),
  soc2: BoolField,
  iso27001: BoolField,
  dpa: BoolField,
  subprocessors: BoolField,
  residency: StringField,
  sso: BoolField,
  annualCostLkr: NumberField,
  summary: z.string().optional(),
});

export type Findings = z.infer<typeof FindingsSchema>;

type Raw = { value: unknown; provenance: "sourced" | "claimed" | "none"; source?: string | null };

/** A field marked `none`, or carrying no value, becomes "not found" — never a
 *  silent false. The two mean different things and the rule pack treats them
 *  differently: not-found blocks with "more information required", false
 *  fails outright. */
function toFact<T>(f: Raw, who: string): Fact<T> {
  if (f.value === null || f.value === undefined || f.provenance === "none")
    return notFound(f.source ?? "");
  return fact(
    f.value as T,
    f.provenance === "claimed" ? "claimed" : "sourced",
    f.source ? f.source : `researched in Claude by ${who}`,
    f.source ?? undefined
  );
}

export function factsFromFindings(
  findings: Findings,
  researcher: string
): Record<string, Fact<unknown>> {
  return {
    soc2: toFact<boolean>(findings.soc2, researcher),
    iso27001: toFact<boolean>(findings.iso27001, researcher),
    dpa: toFact<boolean>(findings.dpa, researcher),
    subprocessors: toFact<boolean>(findings.subprocessors, researcher),
    residency: toFact<string>(findings.residency, researcher),
    sso: toFact<boolean>(findings.sso, researcher),
    annualCost: toFact<number>(findings.annualCostLkr, researcher),
  };
}

/** Tolerates the two things a person actually pastes: a fenced code block, and
 *  surrounding prose. Anything else is rejected with a reason. */
export function parseFindings(
  raw: string
): { ok: true; data: Findings } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Nothing was pasted." };

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const braced = text.match(/\{[\s\S]*\}/);
  const candidate = fenced?.[1] ?? braced?.[0] ?? text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return {
      ok: false,
      error:
        "That is not valid JSON. Paste the whole object the Skill returned, from the opening { to the closing }.",
    };
  }

  const result = FindingsSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`);
    return {
      ok: false,
      error: `The JSON does not match what the Skill should return — ${issues.join("; ")}`,
    };
  }

  return { ok: true, data: result.data };
}

/** The prompt a person copies into Claude. Everything the Skill needs to do
 *  the job, and nothing it should have to ask for. */
export function researchPrompt(product: string, vendor: string | null, seats: number | null): string {
  return [
    `Use the software-compliance-research skill.`,
    ``,
    `Product: ${product}`,
    `Vendor: ${vendor ?? "not stated by the requester"}`,
    `Seats requested: ${seats ?? "not stated"}`,
    ``,
    `Research this vendor's security and compliance posture for a software`,
    `approval decision, and return only the JSON object the skill specifies.`,
    `Mark anything you cannot establish as provenance "none" rather than`,
    `guessing — a gap is a finding, a guess is not.`,
  ].join("\n");
}
