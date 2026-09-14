/** The catalog gate — the deflection layer.
 *
 *  Most software requests are for tools the company already owns. Those should
 *  never reach an approver. But a catalog hit alone is not approval: an entry
 *  that has lapsed, drifted out of entity scope, or picked up new actively-
 *  exploited vulnerabilities since it was approved is no longer evidence of
 *  anything. A catalog that never expires is just an allowlist. */

import type { CatalogEntry } from "@prisma/client";
import { expect, isArray } from "./json";

export type Tier = 0 | 1 | 2;
export type Cause = "ok" | "seats" | "absent" | "stale";

export type Route = {
  tier: Tier;
  cause: Cause;
  label: string;
  note: string;
  entry?: CatalogEntry;
  free?: number;
  fails?: string[];
};

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function entitiesOf(entry: CatalogEntry): string[] {
  return expect<string[]>(entry.entities, isArray, []);
}

export function routeRequest(
  product: string | null,
  entity: string,
  catalog: CatalogEntry[]
): Route {
  if (!product)
    return {
      tier: 2,
      cause: "absent",
      label: "Not in catalog",
      note: "No product named, so nothing can be matched. Full review required.",
    };

  const entry = catalog.find((c) => c.name.toLowerCase() === product.toLowerCase().trim());

  if (!entry)
    return {
      tier: 2,
      cause: "absent",
      label: "Not in catalog",
      note: "No prior assessment exists. This is the expensive path — and the one worth spending attention on.",
    };

  const fails: string[] = [];
  const scope = entitiesOf(entry);

  if (!scope.includes(entity))
    fails.push(
      `Approved for ${scope.join(", ")} — not ${entity}. Different jurisdiction, different residency rules.`
    );
  if (entry.review <= today())
    fails.push(`Review date ${entry.review} has lapsed. The assessment is no longer current.`);
  if (entry.kevSince > 0)
    fails.push(
      `${entry.kevSince} new actively-exploited ${entry.kevSince === 1 ? "vulnerability has" : "vulnerabilities have"} been published since approval on ${entry.approved}.`
    );

  if (fails.length)
    return {
      tier: 2,
      cause: "stale",
      label: "Catalog entry no longer valid",
      note: "In the catalog, and that was not enough.",
      entry,
      fails,
    };

  const free = entry.seats - entry.used;

  if (free <= 0)
    return {
      tier: 1,
      cause: "seats",
      label: "Seat purchase required",
      note: `All ${entry.seats} seats are assigned. The security assessment is current to ${entry.review} — only the spend decision is open.`,
      entry,
      free: 0,
    };

  return {
    tier: 0,
    cause: "ok",
    label: "Self-service",
    note: `${free} of ${entry.seats} seats unassigned. Assessment current to ${entry.review}.`,
    entry,
    free,
  };
}

export const TIER_LABEL: Record<Tier, string> = {
  0: "Self-service",
  1: "Spend decision only",
  2: "Full review",
};
