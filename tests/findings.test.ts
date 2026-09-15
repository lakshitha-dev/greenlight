/** The Claude paste-back bridge.
 *
 *  A pasted blob is untrusted input arriving at a compliance decision, so the
 *  validation has to be strict — and the distinction between "the vendor has
 *  no SOC 2" and "we could not establish whether they do" has to survive the
 *  round trip, because the rule pack treats them differently. */

import { describe, it, expect } from "vitest";
import { parseFindings, factsFromFindings, researchPrompt } from "@/lib/findings";
import { evaluate, packFor } from "@/lib/rulepack";
import { facts } from "./factories";

const complete = {
  soc2: { value: true, provenance: "sourced", source: "https://x.com/trust" },
  iso27001: { value: true, provenance: "sourced", source: "https://x.com/trust" },
  dpa: { value: true, provenance: "sourced", source: "https://x.com/dpa" },
  subprocessors: { value: true, provenance: "sourced", source: "https://x.com/sub" },
  residency: { value: "Ireland", provenance: "sourced", source: "https://x.com/trust" },
  sso: { value: true, provenance: "sourced", source: "https://x.com/pricing" },
  annualCostLkr: { value: 120000, provenance: "sourced", source: "https://x.com/pricing" },
  summary: "Everything published.",
};

describe("parseFindings — what a person actually pastes", () => {
  it("accepts a bare JSON object", () => {
    const r = parseFindings(JSON.stringify(complete));
    expect(r.ok).toBe(true);
  });

  it("accepts it inside a fenced code block", () => {
    const r = parseFindings("```json\n" + JSON.stringify(complete) + "\n```");
    expect(r.ok).toBe(true);
  });

  it("accepts it with prose either side", () => {
    const r = parseFindings(
      `Here is what I found:\n\n${JSON.stringify(complete)}\n\nHope that helps.`
    );
    expect(r.ok).toBe(true);
  });

  it("rejects an empty paste with a usable message", () => {
    const r = parseFindings("   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/nothing was pasted/i);
  });

  it("rejects prose with no JSON in it", () => {
    const r = parseFindings("Claude said the vendor looks fine to me");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not valid JSON/i);
  });

  it("rejects JSON missing a required field, naming it", () => {
    const { dpa, ...missing } = complete;
    const r = parseFindings(JSON.stringify(missing));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/dpa/);
  });

  it("rejects an unknown provenance value", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, soc2: { value: true, provenance: "probably", source: null } })
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a value of the wrong type", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, annualCostLkr: { value: "lots", provenance: "sourced", source: null } })
    );
    expect(r.ok).toBe(false);
  });
});

describe("factsFromFindings — provenance survives the round trip", () => {
  const who = "Head of Operations";

  it("carries a sourced finding through as sourced", () => {
    const r = parseFindings(JSON.stringify(complete));
    if (!r.ok) throw new Error("fixture should parse");
    const f = factsFromFindings(r.data, who);
    expect(f.soc2.prov).toBe("sourced");
    expect(f.soc2.value).toBe(true);
    expect(f.soc2.url).toBe("https://x.com/trust");
  });

  it("keeps a vendor claim marked as a claim", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, residency: { value: "United States", provenance: "claimed", source: null } })
    );
    if (!r.ok) throw new Error("should parse");
    expect(factsFromFindings(r.data, who).residency.prov).toBe("claimed");
  });

  it("turns provenance 'none' into not-found, never into false", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, subprocessors: { value: null, provenance: "none", source: null } })
    );
    if (!r.ok) throw new Error("should parse");
    const f = factsFromFindings(r.data, who);
    expect(f.subprocessors.prov).toBe("none");
    expect(f.subprocessors.value).toBeNull();
  });

  it("keeps a genuine false distinct from not-found", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, sso: { value: false, provenance: "sourced", source: "https://x.com/pricing" } })
    );
    if (!r.ok) throw new Error("should parse");
    const f = factsFromFindings(r.data, who);
    expect(f.sso.value).toBe(false);
    expect(f.sso.prov).toBe("sourced");
  });

  it("attributes the researcher when the Skill gave no URL", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, dpa: { value: true, provenance: "sourced", source: null } })
    );
    if (!r.ok) throw new Error("should parse");
    expect(factsFromFindings(r.data, who).dpa.src).toMatch(/researched in Claude by Head of Operations/);
  });
});

describe("pasted findings drive the verdict exactly as the API path would", () => {
  const pack = packFor("BISTEC Global");
  const who = "Head of Operations";

  it("approves when everything is sourced and clean", () => {
    const r = parseFindings(JSON.stringify(complete));
    if (!r.ok) throw new Error("should parse");
    const merged = { ...facts(), ...factsFromFindings(r.data, who) };
    expect(evaluate(merged, pack).outcome).toBe("APPROVE");
  });

  it("asks for more information when a blocking field came back as a gap", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, soc2: { value: null, provenance: "none", source: null } })
    );
    if (!r.ok) throw new Error("should parse");
    const merged = { ...facts(), ...factsFromFindings(r.data, who) };
    expect(evaluate(merged, pack).outcome).toBe("MORE_INFO");
  });

  it("refuses to let a vendor claim satisfy a blocking requirement, even pasted", () => {
    const r = parseFindings(
      JSON.stringify({ ...complete, dpa: { value: true, provenance: "claimed", source: null } })
    );
    if (!r.ok) throw new Error("should parse");
    const merged = { ...facts(), ...factsFromFindings(r.data, who) };
    const ev = evaluate(merged, pack);
    expect(ev.outcome).toBe("MORE_INFO");
    expect(ev.checks.find((c) => c.field === "dpa")?.why).toMatch(/cannot satisfy a blocking/i);
  });
});

describe("researchPrompt", () => {
  it("names the skill, the product and the seat count", () => {
    const p = researchPrompt("Notion", "Notion Labs", 18);
    expect(p).toMatch(/software-compliance-research/);
    expect(p).toMatch(/Notion Labs/);
    expect(p).toMatch(/18/);
  });

  it("says so plainly when the requester gave no vendor", () => {
    expect(researchPrompt("Airtable", null, null)).toMatch(/not stated/);
  });

  it("tells the researcher not to guess", () => {
    expect(researchPrompt("X", null, 1)).toMatch(/rather than\s+guessing|a gap is a finding/i);
  });
});
