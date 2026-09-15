/** The verdict banner is the surface an auditor reads, so what it asserts has
 *  to be something that actually happened. Two behaviours are pinned here.
 *
 *  Overrides: VERDICT[x].w is the engine's account of how it reached x. When a
 *  person records a different outcome, that sentence describes reasoning nobody
 *  used — printing it under their name invents a justification. The UI branches
 *  on isOverride() to suppress it, so isOverride() has to be exact.
 *
 *  Blockers: a requirement that could not be evaluated is as much in the way as
 *  one that failed, and this tool's whole premise is that a gap routes to a
 *  person rather than being assumed away. Dropping "miss" would understate what
 *  stands between a request and an approval. */

import { describe, it, expect } from "vitest";
import { blockersOf, isOverride, type Check } from "@/lib/rulepack";

const check = (over: Partial<Check>): Check =>
  ({
    id: "R1",
    label: "A requirement",
    severity: "blocking",
    authority: "ISO 27001",
    kind: "measured",
    status: "pass",
    why: "",
    ...over,
  }) as Check;

describe("blockersOf", () => {
  it("counts a blocking requirement that failed", () => {
    expect(blockersOf([check({ id: "R1", status: "fail" })]).map((c) => c.id)).toEqual(["R1"]);
  });

  it("counts a blocking requirement that could not be evaluated", () => {
    expect(blockersOf([check({ id: "R2", status: "miss" })]).map((c) => c.id)).toEqual(["R2"]);
  });

  it("ignores warnings, however bad, and anything already met", () => {
    const checks = [
      check({ id: "R3", severity: "warning", status: "fail" }),
      check({ id: "R4", severity: "warning", status: "miss" }),
      check({ id: "R5", status: "pass" }),
      check({ id: "R6", status: "off" }),
    ];
    expect(blockersOf(checks)).toEqual([]);
  });

  it("preserves pack order, so the list reads as the pack is written", () => {
    const checks = [
      check({ id: "R1", status: "miss" }),
      check({ id: "R2", status: "pass" }),
      check({ id: "R3", status: "fail" }),
    ];
    expect(blockersOf(checks).map((c) => c.id)).toEqual(["R1", "R3"]);
  });
});

describe("isOverride", () => {
  it("is true only when a person reached a different outcome", () => {
    expect(isOverride("REJECT", "APPROVE")).toBe(true);
  });

  it("is false when the person agreed with the engine", () => {
    expect(isOverride("APPROVE", "APPROVE")).toBe(false);
  });

  it("is false before anyone has decided", () => {
    expect(isOverride(undefined, "CONDITIONS")).toBe(false);
  });

  it("is false when there is no evaluation to depart from", () => {
    /** Without an engine outcome there is nothing to contradict, so the banner
     *  should not claim a departure. */
    expect(isOverride("APPROVE", undefined)).toBe(false);
  });
});
