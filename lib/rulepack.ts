/** Rule packs: policy as versioned files on disk, owned by Operations.
 *
 *  The model gathers facts. This decides. Keeping them apart is the whole
 *  design — a fact with no provenance never reaches a rule, and a rule never
 *  invents a fact. Every verdict names the rule and the pack version that
 *  produced it, which is what makes the audit trail worth anything. */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { Fact } from "./sources/http";

export type Severity = "blocking" | "warning" | "off";
export type Status = "pass" | "fail" | "miss" | "off";
export type Outcome = "APPROVE" | "CONDITIONS" | "REJECT" | "MORE_INFO";

export type Requirement = {
  id: string;
  field: string;
  label: string;
  op: "eq" | "lte" | "gte" | "exists" | "isTrue" | "grade";
  value?: number | string;
  severity: Severity;
  authority: string;
  breach?: string;
};

export type Pack = {
  id: string;
  version: string;
  entity: string;
  jurisdiction?: string;
  regime?: string;
  owner?: string;
  requirements: Requirement[];
  file: string;
};

export type Check = Requirement & { status: Status; why: string };

export type Evaluation = {
  checks: Check[];
  live: Check[];
  warns: Check[];
  outcome: Outcome;
  pack: Pack;
};

const RULES_DIR = join(process.cwd(), "rules");
const GRADES: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };

const VALID_OPS = new Set(["eq", "lte", "gte", "exists", "isTrue", "grade"]);
const VALID_SEVERITIES = new Set(["blocking", "warning", "off"]);

/** Packs are policy. A malformed one must fail loudly at load, because the
 *  alternative is worse than a crash: an unrecognised operator used to leave
 *  `ok` false with an empty reason, so a blocking requirement silently failed
 *  and produced a REJECT with a blank justification. */
function validatePack(raw: unknown, file: string): Pack {
  const fail = (why: string): never => {
    throw new Error(`Rule pack rules/${file} is invalid: ${why}`);
  };

  if (!raw || typeof raw !== "object") fail("file is empty or not a YAML mapping");
  const p = raw as Record<string, unknown>;

  if (!p.id) fail("missing 'id'");
  if (p.version === undefined) fail("missing 'version'");
  if (!p.entity) fail("missing 'entity'");
  if (!Array.isArray(p.requirements)) fail("missing or non-list 'requirements'");

  const requirements = p.requirements as Record<string, unknown>[];
  if (requirements.length === 0) fail("'requirements' is empty");

  const seen = new Set<string>();
  for (const r of requirements) {
    const id = String(r.id ?? "?");
    if (!r.id) fail("a requirement has no 'id'");
    if (seen.has(id)) fail(`duplicate requirement id '${id}'`);
    seen.add(id);
    if (!r.field) fail(`requirement ${id} has no 'field'`);
    if (!r.label) fail(`requirement ${id} has no 'label'`);
    if (!VALID_OPS.has(String(r.op)))
      fail(`requirement ${id} has unknown operator '${r.op}' (expected one of ${[...VALID_OPS].join(", ")})`);
    if (!VALID_SEVERITIES.has(String(r.severity)))
      fail(`requirement ${id} has unknown severity '${r.severity}'`);
    if ((r.op === "lte" || r.op === "gte" || r.op === "eq") && typeof r.value !== "number")
      fail(`requirement ${id} uses '${r.op}' and needs a numeric 'value'`);
    if (r.op === "grade" && !GRADES[String(r.value)])
      fail(`requirement ${id} uses 'grade' and needs a value of A–E (got '${r.value}')`);
  }

  return { ...(p as object), version: String(p.version), file } as Pack;
}

/** Read once. This used to run readdirSync plus N synchronous readFileSync
 *  and YAML parses on every request, on the event loop. */
let packCache: Pack[] | null = null;

export function loadPacks(): Pack[] {
  if (packCache) return packCache;

  let files: string[];
  try {
    files = readdirSync(RULES_DIR);
  } catch {
    throw new Error(
      `Cannot read the rules directory at ${RULES_DIR}. GreenLight's policy lives in rules/*.yaml and the app cannot evaluate anything without it.`
    );
  }

  const packs = files
    .filter((f) => f.startsWith("software-approval") && f.endsWith(".yaml"))
    .map((f) => {
      let parsed: unknown;
      try {
        parsed = YAML.parse(readFileSync(join(RULES_DIR, f), "utf8"));
      } catch (e) {
        throw new Error(
          `Rule pack rules/${f} could not be parsed: ${e instanceof Error ? e.message : "unreadable"}`
        );
      }
      return validatePack(parsed, f);
    });

  if (packs.length === 0)
    throw new Error(
      `No software-approval rule packs found in ${RULES_DIR}. Expected at least one file named software-approval*.yaml.`
    );

  packCache = packs;
  return packs;
}

/** Tests and the rules page reload after an edit. */
export function clearPackCache(): void {
  packCache = null;
}

/** An entity with no pack of its own inherits the Sri Lankan one — stated
 *  here rather than hidden, because it is a policy decision. Total by
 *  construction: loadPacks throws rather than returning an empty list, so
 *  there is always something to fall back to. */
export function packFor(entity: string): Pack {
  const packs = loadPacks();
  return (
    packs.find((p) => p.entity === entity) ??
    packs.find((p) => p.entity === "BISTEC Solutions") ??
    packs[0]
  );
}

export function evaluate(facts: Record<string, Fact<unknown>>, pack: Pack): Evaluation {
  const checks: Check[] = pack.requirements.map((r) => {
    if (r.severity === "off")
      return { ...r, status: "off", why: "Requirement disabled by Operations." };

    const f = facts[r.field];
    if (!f || f.value === null || f.prov === "none")
      return {
        ...r,
        status: "miss",
        why: "Not found in any source. This is a finding, not a failure of the search.",
      };

    let ok = false;
    let why = "";
    const v = f.value;

    switch (r.op) {
      case "eq":
        ok = v === r.value;
        why = ok
          ? "None found in the catalogue."
          : `${v} found, against a required ${r.value}.`;
        break;
      case "lte":
        ok = Number(v) <= Number(r.value);
        why = ok
          ? `${show(r.field, v)} — within the ${show(r.field, r.value)} limit.`
          : `${show(r.field, v)} exceeds the ${show(r.field, r.value)} limit.`;
        break;
      case "gte":
        ok = Number(v) >= Number(r.value);
        why = `${show(r.field, v)} against a minimum of ${show(r.field, r.value)}.`;
        break;
      case "exists":
        ok = Boolean(v);
        why = ok ? `Located${f.src ? ` — ${f.src}` : ""}.` : "Not published.";
        break;
      case "isTrue":
        ok = v === true;
        why = ok ? "Supported." : "Not supported on the tier requested.";
        break;
      case "grade":
        ok = (GRADES[String(v)] ?? 9) <= (GRADES[String(r.value)] ?? 9);
        why = `Grade ${v} against a minimum of ${r.value}.`;
        break;
      default:
        // unreachable: validatePack rejects unknown operators at load. Kept so
        // that if it ever is reached it says so, rather than failing silently.
        throw new Error(
          `Requirement ${r.id} uses operator '${r.op}', which this build does not implement.`
        );
    }

    // a fact the vendor merely asserts cannot satisfy a blocking requirement
    if (ok && r.severity === "blocking" && f.prov === "claimed") {
      return {
        ...r,
        status: "miss",
        why: `Vendor asserts this, but no independent evidence was found. A vendor claim cannot satisfy a blocking requirement.`,
      };
    }

    return { ...r, status: ok ? "pass" : "fail", why };
  });

  const live = checks.filter((c) => c.status !== "off");
  const blockFail = live.some((c) => c.severity === "blocking" && c.status === "fail");
  const blockMiss = live.some((c) => c.severity === "blocking" && c.status === "miss");
  const warns = live.filter((c) => c.severity === "warning" && c.status !== "pass");

  const outcome: Outcome = blockFail
    ? "REJECT"
    : blockMiss
      ? "MORE_INFO"
      : warns.length
        ? "CONDITIONS"
        : "APPROVE";

  return { checks, live, warns, outcome, pack };
}

function show(field: string, v: unknown): string {
  return field === "annualCost" ? "LKR " + Number(v).toLocaleString("en-LK") : String(v);
}

export const VERDICT: Record<Outcome, { t: string; w: string }> = {
  APPROVE: {
    t: "Approve",
    w: "Every blocking requirement is satisfied against verified sources.",
  },
  CONDITIONS: {
    t: "Approve with conditions",
    w: "All blocking requirements pass. The conditions below are the warning-level rules that did not.",
  },
  REJECT: {
    t: "Reject",
    w: "A blocking requirement failed against a verified source.",
  },
  MORE_INFO: {
    t: "More information required",
    w: "A blocking requirement could not be evaluated — the evidence does not exist publicly, or rests only on the vendor's own claim.",
  },
};
