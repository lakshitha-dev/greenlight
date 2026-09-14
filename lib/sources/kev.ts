/** CISA Known Exploited Vulnerabilities catalogue.
 *  Free, keyless, updated roughly weekly. This is the highest-signal source
 *  GreenLight has: an entry here means the vulnerability is being exploited
 *  in the wild right now, not that one theoretically exists. */

import { cached, getJson, nameMatches, type Step } from "./http";

export type KevEntry = {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  knownRansomwareCampaignUse?: string;
};

type KevCatalog = {
  catalogVersion: string;
  dateReleased: string;
  count: number;
  vulnerabilities: KevEntry[];
};

const URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const TTL = 6 * 60 * 60 * 1000; // 6 hours

export async function loadCatalog(): Promise<KevCatalog | null> {
  return cached("kev", TTL, () => getJson<KevCatalog>(URL, { timeout: 25_000 }));
}

export type KevResult = {
  available: boolean;
  catalogVersion?: string;
  total?: number;
  entries: KevEntry[];
  latest?: KevEntry;
  /** entries added since a date — drives catalog re-escalation */
  since?: number;
  step: Step;
};

export async function checkKev(product: string, vendor?: string, sinceDate?: string): Promise<KevResult> {
  const t0 = Date.now();
  const cat = await loadCatalog();

  // CISA serving a 200 with an error envelope or a changed schema is not the
  // same as "no vulnerabilities" — treat an unusable body as unavailable
  if (!cat || !Array.isArray(cat.vulnerabilities)) {
    return {
      available: false,
      entries: [],
      step: {
        source: "CISA Known Exploited Vulnerabilities",
        result: "Catalogue unreachable — treated as unknown, not as clean.",
        kind: "miss",
        ms: Date.now() - t0,
      },
    };
  }

  const entries = cat.vulnerabilities.filter(
    (v) =>
      v &&
      typeof v.product === "string" &&
      typeof v.vendorProject === "string" &&
      (nameMatches(v.product, product) || (vendor ? nameMatches(v.vendorProject, vendor) : false))
  );

  const latest = entries.length
    ? entries.reduce((a, b) => (a.dateAdded > b.dateAdded ? a : b))
    : undefined;

  const since = sinceDate ? entries.filter((e) => e.dateAdded > sinceDate).length : undefined;

  return {
    available: true,
    catalogVersion: cat.catalogVersion ?? "unknown",
    total: cat.count,
    entries,
    latest,
    since,
    step: {
      source: "CISA Known Exploited Vulnerabilities",
      result: entries.length
        ? `${entries.length} ${entries.length === 1 ? "entry" : "entries"}. Most recent added ${latest!.dateAdded} — ${latest!.product}.`
        : `No entries in catalogue ${cat.catalogVersion} (${(cat.count ?? cat.vulnerabilities.length).toLocaleString()} actively-exploited vulnerabilities). Clean.`,
      kind: entries.length ? "hit" : "done",
      url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
      ms: Date.now() - t0,
    },
  };
}
