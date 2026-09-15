/** One engine, two approval domains.
 *
 *  The ISO document pack used to be a facade: loadPacks() filtered on
 *  software-approval*, so it never reached the engine, and the page rendered a
 *  hardcoded array with the version printed as a string. These tests pin down
 *  that it is now genuinely engine-driven, because "adding a domain is a YAML
 *  file, not code" is only a claim until something proves it. */

import { describe, it, expect, beforeEach } from "vitest";
import { evaluate, loadPacks, packFor, clearPackCache, isAssessed, type Pack, type Requirement } from "@/lib/rulepack";
import { fact, missing } from "./factories";

beforeEach(() => clearPackCache());

describe("the engine loads more than one domain", () => {
  it("loads both software and document packs", () => {
    const domains = new Set(loadPacks().map((p) => p.domain));
    expect(domains.has("software")).toBe(true);
    expect(domains.has("document")).toBe(true);
  });

  it("routes to the document pack by domain, not by filename", () => {
    const p = packFor("BISTEC Global (SL)", "document");
    expect(p.id).toBe("iso-document-approval");
    expect(p.domain).toBe("document");
  });

  it("still routes software to the entity's own software pack", () => {
    expect(packFor("BISTEC Australia", "software").entity).toBe("BISTEC Australia");
    expect(packFor("BISTEC Australia", "software").domain).toBe("software");
  });

  it("never returns a document pack when software was asked for", () => {
    for (const e of ["BISTEC Solutions", "BISTEC Australia", "BISTEC Atlantis"]) {
      expect(packFor(e, "software").domain, e).toBe("software");
    }
  });
});

describe("assessed requirements", () => {
  const iso = (): Pack => packFor("BISTEC Global (SL)", "document");

  it("the ISO pack is made of assessed requirements, not measured ones", () => {
    for (const r of iso().requirements) {
      expect(isAssessed(r), `${r.id} should be assessed`).toBe(true);
      expect(r.op).toBeUndefined();
    }
  });

  it("an assessment of true passes, and carries the assessor's reason", () => {
    const ev = evaluate({ R1: fact(true, "sourced", "The driver is stated in §2.") }, iso());
    const r1 = ev.checks.find((c) => c.id === "R1")!;
    expect(r1.status).toBe("pass");
    expect(r1.why).toMatch(/driver is stated/);
  });

  it("an assessment of false fails", () => {
    const ev = evaluate({ R1: fact(false, "sourced", "No business outcome given.") }, iso());
    expect(ev.checks.find((c) => c.id === "R1")!.status).toBe("fail");
  });

  it("an assessment nobody made is a miss, and says what is needed", () => {
    const ev = evaluate({}, iso());
    const r1 = ev.checks.find((c) => c.id === "R1")!;
    expect(r1.status).toBe("miss");
    expect(r1.why).toMatch(/not assessed/i);
  });

  it("refuses a claimed assessment on a blocking requirement", () => {
    const ev = evaluate({ R1: fact(true, "claimed", "The submitter says so.") }, iso());
    const r1 = ev.checks.find((c) => c.id === "R1")!;
    expect(r1.status).toBe("miss");
    expect(r1.why).toMatch(/cannot satisfy a blocking requirement/i);
  });
});

describe("the same outcome rules govern both domains", () => {
  const iso = () => packFor("BISTEC Global (SL)", "document");

  const assessments = (overrides: Record<string, unknown> = {}) => ({
    R1: fact(true, "sourced", "A business driver is stated in section 2."),
    R2: fact(true, "sourced", "The asset register names an accountable owner."),
    R3: fact(true, "sourced", "Cites ISO 27001 A.5.9 in the header."),
    R4: fact(true, "sourced", "Revision history lists the v3 to v4 deltas."),
    R5: fact(true, "sourced", "Next review 2027-03-01, within twelve months."),
    ...overrides,
  });

  it("approves a document that meets every requirement", () => {
    expect(evaluate(assessments(), iso()).outcome).toBe("APPROVE");
  });

  it("rejects when a blocking requirement is assessed as unmet", () => {
    const ev = evaluate(assessments({ R1: fact(false, "sourced", "No business outcome is given for the revision.") }), iso());
    expect(ev.outcome).toBe("REJECT");
  });

  it("asks for more information when a blocking requirement was never assessed", () => {
    const ev = evaluate(assessments({ R2: missing() }), iso());
    expect(ev.outcome).toBe("MORE_INFO");
  });

  it("approves with conditions when only a warning is unmet", () => {
    const ev = evaluate(assessments({ R3: fact(false, "sourced", "No ISO clause is referenced anywhere in the document.") }), iso());
    expect(ev.outcome).toBe("CONDITIONS");
  });

  it("gives every check a reason, in the document domain too", () => {
    const ev = evaluate(assessments({ R1: fact(false, "sourced", "No business outcome is given."), R2: missing() }), iso());
    for (const c of ev.checks) expect(c.why.length, c.id).toBeGreaterThan(5);
  });
});

describe("a new domain needs no code", () => {
  /** The proof that matters: a pack the codebase has never seen, evaluated by
   *  the same function, with no branch anywhere that knows its name. */
  const leaveRequest: Pack = {
    id: "leave-approval",
    version: "0.1",
    domain: "document",
    entity: "all",
    file: "leave-approval.yaml",
    requirements: [
      { id: "L1", label: "Cover arranged", severity: "blocking", authority: "HR handbook §3" },
      { id: "L2", label: "Notice period met", severity: "warning", authority: "HR handbook §4" },
    ] as Requirement[],
  };

  it("evaluates a domain invented in this test file", () => {
    const ev = evaluate(
      { L1: fact(true, "sourced", "Cover confirmed by the team lead."), L2: fact(false, "sourced", "Nine days' notice, ten required.") },
      leaveRequest
    );
    expect(ev.outcome).toBe("CONDITIONS");
    expect(ev.checks.find((c) => c.id === "L1")!.status).toBe("pass");
  });

  it("applies the same blocking rule to it", () => {
    const ev = evaluate({ L1: missing(), L2: fact(true, "sourced", "Fourteen days’ notice given.") }, leaveRequest);
    expect(ev.outcome).toBe("MORE_INFO");
  });
});
