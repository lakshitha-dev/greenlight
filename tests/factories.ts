/** Builders for the shapes the business logic consumes.
 *
 *  These take Prisma row types but nothing here touches a database — every
 *  function under test is pure, which is the point. Override only the field a
 *  test is about, so the test reads as the one thing it is asserting. */

import type { CatalogEntry, Decision, Request } from "@prisma/client";
import type { Fact, Prov } from "@/lib/sources/http";
import type { ProcessRecord } from "@/lib/sources/analyzer";

export const iso = (daysFromNow: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

export const TODAY = iso(0);
export const PAST = iso(-30);
export const FUTURE = iso(365);

export function fact<T>(value: T | null, prov: Prov = "verified", src = "test"): Fact<T> {
  return { value, prov, src };
}

export const missing = (): Fact<never> => ({ value: null, prov: "none", src: "" });

/** A dossier where everything a rule pack asks for is present and verified.
 *  Tests then remove or downgrade exactly one field. */
export function facts(overrides: Record<string, Fact<unknown>> = {}): Record<string, Fact<unknown>> {
  return {
    kevEntries: fact(0),
    kevLatest: missing(),
    kevSince: fact(0),
    criticalCves: fact(1),
    highCves: fact(2),
    privacyGrade: fact("B"),
    osvAdvisories: fact(0),
    soc2: fact(true, "sourced"),
    iso27001: fact(true, "sourced"),
    dpa: fact(true, "sourced"),
    subprocessors: fact(true, "sourced"),
    residency: fact("Ireland", "sourced"),
    sso: fact(true, "sourced"),
    annualCost: fact(120_000, "sourced"),
    ...overrides,
  };
}

export function catalogEntry(o: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: o.id ?? "cat-1",
    name: "Slack",
    vendor: "Salesforce",
    seats: 100,
    used: 40,
    approved: PAST,
    review: FUTURE,
    entities: JSON.stringify(["BISTEC Solutions"]),
    kev: 0,
    kevSince: 0,
    owner: "IT Infrastructure",
    cost: "LKR 1,000,000 / yr",
    processNames: JSON.stringify(["slack.exe"]),
    createdAt: new Date(),
    ...o,
  } as CatalogEntry;
}

export function request(o: Partial<Request> = {}): Request {
  return {
    id: "SR-1000",
    kind: "software",
    subject: "Test request",
    product: "Slack",
    vendor: "Salesforce",
    seats: 1,
    requester: "Test Requester",
    team: "Support Team",
    entity: "BISTEC Solutions",
    body: "Requesting Slack.",
    receivedAt: new Date(),
    status: "new",
    tier: null,
    routeCause: null,
    routeNote: null,
    personalData: false,
    specialCat: false,
    subjectCount: null,
    subjects: null,
    categories: null,
    purpose: null,
    retention: null,
    crossBorder: null,
    monitoring: false,
    automated: false,
    ...o,
  } as Request;
}

export function decision(o: Partial<Decision> = {}): Decision {
  return {
    id: "dec-1",
    requestId: "SR-1000",
    outcome: "APPROVE",
    actor: "Sajith",
    comment: null,
    packId: "software-approval",
    packVersion: "2.1",
    createdAt: new Date(),
    ...o,
  } as Decision;
}

export function proc(o: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    pid: 1234,
    name: "slack.exe",
    path: "C:\\Users\\someone\\AppData\\Local\\slack\\slack.exe",
    memoryMB: 120,
    publisher: "Slack Technologies, Inc.",
    category: "Third-party",
    threatLevel: "Safe",
    threatScore: 0,
    threatReasons: [],
    ...o,
  };
}
