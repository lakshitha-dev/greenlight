/** The rule pack decides. If these are wrong, GreenLight approves things it
 *  should refuse — so this is the file that matters most. */

import { describe, it, expect, beforeEach } from "vitest";
import { evaluate, packFor, loadPacks, clearPackCache, type Pack, type Requirement } from "@/lib/rulepack";
import { facts, fact, missing } from "./factories";

/** A pack built inline, so a test says exactly what rule it is about rather
 *  than depending on whatever rules/*.yaml currently contains. */
function pack(requirements: Partial<Requirement>[]): Pack {
  return {
    id: "test-pack",
    version: "1.0",
    entity: "BISTEC Solutions",
    file: "test.yaml",
    requirements: requirements.map((r, i) => ({
      id: r.id ?? `R${i + 1}`,
      field: r.field ?? "kevEntries",
      label: r.label ?? "test requirement",
      op: r.op ?? "eq",
      value: r.value,
      severity: r.severity ?? "blocking",
      authority: r.authority ?? "test",
      breach: r.breach,
    })) as Requirement[],
  };
}

describe("evaluate — outcome derivation", () => {
  it("approves when every requirement passes", () => {
    const ev = evaluate(facts(), pack([{ field: "kevEntries", op: "eq", value: 0 }]));
    expect(ev.outcome).toBe("APPROVE");
  });

  it("rejects when a blocking requirement fails on a verified fact", () => {
    const ev = evaluate(
      facts({ kevEntries: fact(4) }),
      pack([{ field: "kevEntries", op: "eq", value: 0, severity: "blocking" }])
    );
    expect(ev.outcome).toBe("REJECT");
  });

  it("asks for more information when a blocking requirement cannot be evaluated", () => {
    const ev = evaluate(
      facts({ soc2: missing() }),
      pack([{ field: "soc2", op: "exists", severity: "blocking" }])
    );
    expect(ev.outcome).toBe("MORE_INFO");
    expect(ev.checks[0].status).toBe("miss");
  });

  it("approves with conditions when only warnings fail", () => {
    const ev = evaluate(
      facts({ sso: fact(false, "sourced") }),
      pack([
        { id: "R1", field: "kevEntries", op: "eq", value: 0, severity: "blocking" },
        { id: "R2", field: "sso", op: "isTrue", severity: "warning" },
      ])
    );
    expect(ev.outcome).toBe("CONDITIONS");
    expect(ev.warns.map((w) => w.id)).toEqual(["R2"]);
  });

  it("prefers REJECT over MORE_INFO when both a failure and a gap exist", () => {
    const ev = evaluate(
      facts({ kevEntries: fact(2), soc2: missing() }),
      pack([
        { id: "R1", field: "kevEntries", op: "eq", value: 0, severity: "blocking" },
        { id: "R2", field: "soc2", op: "exists", severity: "blocking" },
      ])
    );
    expect(ev.outcome).toBe("REJECT");
  });

  it("excludes disabled requirements from the outcome entirely", () => {
    const ev = evaluate(
      facts({ kevEntries: fact(9) }),
      pack([{ field: "kevEntries", op: "eq", value: 0, severity: "off" }])
    );
    expect(ev.outcome).toBe("APPROVE");
    expect(ev.live).toHaveLength(0);
    expect(ev.checks[0].status).toBe("off");
  });
});

describe("evaluate — a vendor's word is not evidence", () => {
  it("refuses to let a claimed fact satisfy a blocking requirement", () => {
    const ev = evaluate(
      facts({ soc2: fact(true, "claimed") }),
      pack([{ field: "soc2", op: "exists", severity: "blocking" }])
    );
    expect(ev.outcome).toBe("MORE_INFO");
    expect(ev.checks[0].status).toBe("miss");
    expect(ev.checks[0].why).toMatch(/cannot satisfy a blocking requirement/i);
  });

  it("still lets a claimed fact satisfy a warning", () => {
    const ev = evaluate(
      facts({ sso: fact(true, "claimed") }),
      pack([{ field: "sso", op: "isTrue", severity: "warning" }])
    );
    expect(ev.outcome).toBe("APPROVE");
    expect(ev.checks[0].status).toBe("pass");
  });

  it("accepts a sourced fact for a blocking requirement", () => {
    const ev = evaluate(
      facts({ dpa: fact(true, "sourced") }),
      pack([{ field: "dpa", op: "exists", severity: "blocking" }])
    );
    expect(ev.outcome).toBe("APPROVE");
  });
});

describe("evaluate — operators", () => {
  it("eq compares exactly", () => {
    expect(evaluate(facts({ kevEntries: fact(0) }), pack([{ op: "eq", value: 0 }])).outcome).toBe("APPROVE");
    expect(evaluate(facts({ kevEntries: fact(1) }), pack([{ op: "eq", value: 0 }])).outcome).toBe("REJECT");
  });

  it("lte allows the boundary", () => {
    const p = pack([{ field: "criticalCves", op: "lte", value: 5 }]);
    expect(evaluate(facts({ criticalCves: fact(5) }), p).outcome).toBe("APPROVE");
    expect(evaluate(facts({ criticalCves: fact(6) }), p).outcome).toBe("REJECT");
  });

  it("gte allows the boundary", () => {
    const p = pack([{ field: "criticalCves", op: "gte", value: 3 }]);
    expect(evaluate(facts({ criticalCves: fact(3) }), p).outcome).toBe("APPROVE");
    expect(evaluate(facts({ criticalCves: fact(2) }), p).outcome).toBe("REJECT");
  });

  it("exists treats false as absent, not as present", () => {
    const p = pack([{ field: "sso", op: "exists" }]);
    expect(evaluate(facts({ sso: fact(false, "sourced") }), p).outcome).toBe("REJECT");
  });

  it("isTrue distinguishes false from missing", () => {
    const p = pack([{ field: "sso", op: "isTrue", severity: "blocking" }]);
    expect(evaluate(facts({ sso: fact(false, "sourced") }), p).outcome).toBe("REJECT");
    expect(evaluate(facts({ sso: missing() }), p).outcome).toBe("MORE_INFO");
  });

  it("grade ranks A best and E worst", () => {
    const p = pack([{ field: "privacyGrade", op: "grade", value: "C" }]);
    for (const g of ["A", "B", "C"]) {
      expect(evaluate(facts({ privacyGrade: fact(g) }), p).outcome, `grade ${g}`).toBe("APPROVE");
    }
    for (const g of ["D", "E"]) {
      expect(evaluate(facts({ privacyGrade: fact(g) }), p).outcome, `grade ${g}`).toBe("REJECT");
    }
  });

  it("treats an unrecognised grade as failing, not as passing", () => {
    const ev = evaluate(facts({ privacyGrade: fact("Z") }), pack([{ field: "privacyGrade", op: "grade", value: "C" }]));
    expect(ev.outcome).toBe("REJECT");
  });
});

describe("evaluate — every check explains itself", () => {
  it("never produces a verdict with a blank justification", () => {
    const ev = evaluate(
      facts({ kevEntries: fact(3), sso: fact(false, "sourced"), soc2: missing() }),
      pack([
        { id: "R1", field: "kevEntries", op: "eq", value: 0, severity: "blocking" },
        { id: "R2", field: "sso", op: "isTrue", severity: "warning" },
        { id: "R3", field: "soc2", op: "exists", severity: "blocking" },
      ])
    );
    for (const c of ev.checks) {
      expect(c.why, `${c.id} has no explanation`).toBeTruthy();
      expect(c.why.length).toBeGreaterThan(5);
    }
  });
});

describe("packs on disk", () => {
  beforeEach(() => clearPackCache());

  it("loads the shipped packs and validates them", () => {
    const packs = loadPacks();
    expect(packs.length).toBeGreaterThanOrEqual(2);
    for (const p of packs) {
      expect(p.id).toBeTruthy();
      expect(p.version).toBeTypeOf("string");
      expect(p.requirements.length).toBeGreaterThan(0);
    }
  });

  it("gives BISTEC Australia its own pack, not the Sri Lankan one", () => {
    const au = packFor("BISTEC Australia");
    const sl = packFor("BISTEC Solutions");
    expect(au.entity).toBe("BISTEC Australia");
    expect(au.version).not.toBe(sl.version);
  });

  it("falls back rather than returning undefined for an unknown entity", () => {
    const p = packFor("BISTEC Atlantis");
    expect(p).toBeDefined();
    expect(p.requirements.length).toBeGreaterThan(0);
  });

  it("caches, so repeated lookups do not re-read the disk", () => {
    expect(packFor("BISTEC Solutions")).toBe(packFor("BISTEC Solutions"));
  });
});
