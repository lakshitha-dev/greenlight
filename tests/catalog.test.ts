/** The catalog gate is the deflection layer. A false Tier 0 means software
 *  reaches a laptop with nobody having approved it, so the invalidity rules
 *  matter more than the happy path. */

import { describe, it, expect } from "vitest";
import { routeRequest, entitiesOf } from "@/lib/catalog";
import { catalogEntry, iso, TODAY, PAST } from "./factories";

const ENTITY = "BISTEC Global";

describe("routeRequest — the three tiers", () => {
  it("self-serves when the entry is valid, in scope and has a free seat", () => {
    const r = routeRequest("Slack", ENTITY, [catalogEntry({ seats: 100, used: 40 })]);
    expect(r.tier).toBe(0);
    expect(r.cause).toBe("ok");
    expect(r.free).toBe(60);
  });

  it("routes to the budget owner when every seat is taken", () => {
    const r = routeRequest("Slack", ENTITY, [catalogEntry({ seats: 26, used: 26 })]);
    expect(r.tier).toBe(1);
    expect(r.cause).toBe("seats");
    expect(r.note).toMatch(/only the spend decision is open/i);
  });

  it("sends an unknown product to full review", () => {
    const r = routeRequest("Airtable", ENTITY, [catalogEntry()]);
    expect(r.tier).toBe(2);
    expect(r.cause).toBe("absent");
  });

  it("sends a request naming no product to full review", () => {
    const r = routeRequest(null, ENTITY, [catalogEntry()]);
    expect(r.tier).toBe(2);
    expect(r.cause).toBe("absent");
  });

  it("matches the catalog case-insensitively and ignores surrounding space", () => {
    expect(routeRequest("  slack  ", ENTITY, [catalogEntry()]).tier).toBe(0);
  });
});

describe("routeRequest — a catalog hit is not approval", () => {
  it("re-escalates when the review date has lapsed", () => {
    const r = routeRequest("Slack", ENTITY, [catalogEntry({ review: PAST })]);
    expect(r.tier).toBe(2);
    expect(r.cause).toBe("stale");
    expect(r.fails?.[0]).toMatch(/lapsed/i);
  });

  it("treats a review date of today as lapsed, not as still valid", () => {
    const r = routeRequest("Slack", ENTITY, [catalogEntry({ review: TODAY })]);
    expect(r.tier).toBe(2);
    expect(r.cause).toBe("stale");
  });

  it("still self-serves the day before the review falls due", () => {
    expect(routeRequest("Slack", ENTITY, [catalogEntry({ review: iso(1) })]).tier).toBe(0);
  });

  it("re-escalates when new exploited vulnerabilities appeared after approval", () => {
    const r = routeRequest("Slack", ENTITY, [catalogEntry({ kevSince: 6 })]);
    expect(r.tier).toBe(2);
    expect(r.fails?.[0]).toMatch(/6 new actively-exploited/i);
  });

  it("re-escalates when the entity is out of scope", () => {
    /** BISTEC Global is the only entity today, so the second name here is
     *  hypothetical — the scope check is what is being pinned, and it has to
     *  keep working for the day a second entity exists. */
    const r = routeRequest("Slack", "BISTEC Global", [
      catalogEntry({ entities: JSON.stringify(["BISTEC Overseas"]) }),
    ]);
    expect(r.tier).toBe(2);
    expect(r.fails?.[0]).toMatch(/not BISTEC Global/);
    expect(r.fails?.[0]).toMatch(/jurisdiction/i);
  });

  it("reports every reason it is invalid, not just the first", () => {
    const r = routeRequest("Slack", "BISTEC Global", [
      catalogEntry({ review: PAST, kevSince: 2, entities: JSON.stringify(["BISTEC Overseas"]) }),
    ]);
    expect(r.fails).toHaveLength(3);
  });

  it("prefers re-escalation over the seat check when the entry is also stale", () => {
    const r = routeRequest("Slack", ENTITY, [catalogEntry({ review: PAST, seats: 10, used: 10 })]);
    expect(r.tier).toBe(2);
    expect(r.cause).toBe("stale");
  });
});

describe("entitiesOf", () => {
  it("reads a well-formed scope list", () => {
    expect(entitiesOf(catalogEntry())).toEqual(["BISTEC Global"]);
  });

  it("returns an empty scope for unreadable data rather than throwing", () => {
    expect(entitiesOf(catalogEntry({ entities: "{not json" }))).toEqual([]);
  });

  it("fails closed — an unreadable scope must not let a request self-serve", () => {
    const r = routeRequest("Slack", ENTITY, [catalogEntry({ entities: "{not json" })]);
    expect(r.tier).toBe(2);
  });
});
