/** Privacy screening. Two things must hold: a DPIA is drafted only when a
 *  trigger genuinely fires, and the residual rating actually varies — a rating
 *  that always reads High is not a rating. That second one was a real bug. */

import { describe, it, expect } from "vitest";
import { screen, risks, worst, regimeFor, categoriesOf } from "@/lib/dpia";
import { request, facts, fact, missing } from "./factories";

describe("screen — when an assessment is required", () => {
  it("is not required when no personal data is processed", () => {
    const s = screen(request({ personalData: false, crossBorder: "true" }));
    expect(s.required).toBe(false);
    expect(s.note).toMatch(/no personal data/i);
  });

  it("is not required when personal data stays put and no trigger fires", () => {
    const s = screen(request({ personalData: true, crossBorder: "false", subjectCount: 40 }));
    expect(s.required).toBe(false);
    expect(s.note).toMatch(/no Article 35\(3\) trigger/i);
  });

  it("fires D1 on special category data", () => {
    const s = screen(request({ personalData: true, specialCat: true, crossBorder: "false" }));
    expect(s.triggers.map((t) => t.id)).toContain("D1");
  });

  it("fires D2 only above five thousand data subjects", () => {
    const under = screen(request({ personalData: true, crossBorder: "false", subjectCount: 5000 }));
    const over = screen(request({ personalData: true, crossBorder: "false", subjectCount: 5001 }));
    expect(under.triggers.map((t) => t.id)).not.toContain("D2");
    expect(over.triggers.map((t) => t.id)).toContain("D2");
  });

  it("fires D3 when data leaves the jurisdiction", () => {
    const s = screen(request({ personalData: true, crossBorder: "true" }));
    expect(s.triggers[0].id).toBe("D3");
    expect(s.triggers[0].label).toMatch(/leaves the controlling jurisdiction/i);
  });

  it("fires D3 with a different reason when the destination is unknown", () => {
    const s = screen(request({ personalData: true, crossBorder: "unknown" }));
    expect(s.triggers[0].label).toMatch(/could not be established/i);
  });

  it("fires D5 on systematic monitoring", () => {
    const s = screen(request({ personalData: true, crossBorder: "false", monitoring: true }));
    expect(s.triggers.map((t) => t.id)).toContain("D5");
  });

  it("reports every trigger that fires", () => {
    const s = screen(
      request({ personalData: true, crossBorder: "true", monitoring: true, specialCat: true })
    );
    expect(s.triggers.map((t) => t.id).sort()).toEqual(["D1", "D3", "D5"]);
  });

  it("names a regime and a pack version on every screening", () => {
    const s = screen(request({ entity: "BISTEC Australia" }));
    expect(s.regime).toBeTruthy();
    expect(s.packVersion).toMatch(/dpia-screening@/);
  });
});

describe("the regime follows the entity", () => {
  it("applies Australian law to the Australian entity", () => {
    expect(regimeFor("BISTEC Australia")).toMatch(/Privacy Act 1988/);
  });

  it("applies Sri Lankan law to the Sri Lankan entities", () => {
    expect(regimeFor("BISTEC Solutions")).toMatch(/PDPA/);
    expect(regimeFor("BISTEC Global (SL)")).toMatch(/PDPA/);
  });

  it("falls back rather than throwing for an unknown entity", () => {
    expect(regimeFor("BISTEC Atlantis")).toBeTruthy();
  });
});

describe("risks — each one cites the finding that produced it", () => {
  const crossBorder = request({ personalData: true, crossBorder: "true", subjectCount: 100 });

  it("raises P1 when the sub-processor list was not found", () => {
    const rs = risks(crossBorder, facts({ subprocessors: missing() }));
    const p1 = rs.find((r) => r.id === "P1");
    expect(p1?.source).toMatch(/not found during research/i);
  });

  it("does not raise P1 when the list was found", () => {
    expect(risks(crossBorder, facts()).find((r) => r.id === "P1")).toBeUndefined();
  });

  it("rates a cross-border transfer far worse without a DPA", () => {
    const withDpa = risks(crossBorder, facts()).find((r) => r.id === "P2");
    const without = risks(crossBorder, facts({ dpa: missing() })).find((r) => r.id === "P2");
    expect(withDpa?.severity).toBe("Limited");
    expect(without?.severity).toBe("Severe");
    expect(without?.mitigation).toMatch(/no lawful mechanism/i);
  });

  it("marks a residency the vendor merely asserts as unverified", () => {
    const rs = risks(crossBorder, facts({ residency: fact("United States", "claimed") }));
    expect(rs.find((r) => r.id === "P2")?.source).toMatch(/vendor claim, unverified/i);
  });

  it("raises P3 only for a poor privacy grade", () => {
    for (const g of ["A", "B"])
      expect(risks(crossBorder, facts({ privacyGrade: fact(g) })).find((r) => r.id === "P3")).toBeUndefined();
    for (const g of ["C", "D", "E"])
      expect(risks(crossBorder, facts({ privacyGrade: fact(g) })).find((r) => r.id === "P3")).toBeDefined();
  });

  it("raises P6 when no independent assurance exists", () => {
    const rs = risks(crossBorder, facts({ soc2: missing() }));
    expect(rs.find((r) => r.id === "P6")?.source).toMatch(/No SOC 2/i);
  });

  it("gives every risk a mitigation", () => {
    for (const r of risks(crossBorder, facts({ subprocessors: missing(), soc2: missing() }))) {
      expect(r.mitigation.length, `${r.id} has no mitigation`).toBeGreaterThan(20);
    }
  });
});

describe("residual rating must discriminate", () => {
  const base = { personalData: true, crossBorder: "true" as const };

  it("scales retention severity with how sensitive the data is", () => {
    const grade = { privacyGrade: fact("C") };
    const ordinary = risks(request({ ...base, subjectCount: 4200 }), facts(grade));
    const unbounded = risks(request({ ...base, subjectCount: null }), facts(grade));
    const monitored = risks(request({ ...base, subjectCount: 40, monitoring: true }), facts(grade));

    expect(ordinary.find((r) => r.id === "P3")?.severity).toBe("Limited");
    expect(unbounded.find((r) => r.id === "P3")?.severity).toBe("Significant");
    expect(monitored.find((r) => r.id === "P3")?.severity).toBe("Severe");
  });

  it("does not rate every assessment High — the bug this guards against", () => {
    const ordinary = worst(risks(request({ ...base, subjectCount: 4200 }), facts({ privacyGrade: fact("C") })));
    const severe = worst(
      risks(request({ ...base, subjectCount: null, monitoring: true }), facts({ privacyGrade: fact("C"), soc2: missing() }))
    );
    expect(ordinary).toBe("Medium");
    expect(severe).toBe("High");
  });

  it("reports the highest residual across the register", () => {
    expect(worst([])).toBe("Low");
  });
});

describe("categoriesOf", () => {
  it("reads a well-formed list", () => {
    expect(categoriesOf(request({ categories: JSON.stringify(["Name", "Email"]) }))).toEqual(["Name", "Email"]);
  });

  it("returns nothing for unreadable data rather than throwing", () => {
    expect(categoriesOf(request({ categories: "{broken" }))).toEqual([]);
    expect(categoriesOf(request({ categories: null }))).toEqual([]);
  });
});
