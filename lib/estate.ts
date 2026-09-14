/** Reconciling approval against reality.
 *
 *  GreenLight's catalog is what was approved. A process-analyzer scan is what
 *  is running. Neither is interesting alone; the gap between them is.
 *
 *  The join is not automatic — the analyzer keys on process name and
 *  publisher, the catalog on product and vendor — so it runs off an explicit
 *  mapping held on each catalog entry. Web-only software maps to nothing,
 *  because a browser tab has no process. That is a real limit of the approach
 *  and it is surfaced rather than hidden. */

import type { CatalogEntry, Decision, Request } from "@prisma/client";
import { today } from "./catalog";
import {
  isThirdParty,
  normalise,
  pushPolicy,
  type ProcessRecord,
  type PolicyAction,
} from "./sources/analyzer";
import { expect, safeParse, isArray } from "./json";

export function processNamesOf(entry: CatalogEntry): string[] {
  return expect<string[]>(entry.processNames, isArray, [])
    .filter((n): n is string => typeof n === "string" && n.length > 0)
    .map(normalise);
}

/** An empty mapping and an unreadable one look identical downstream — both
 *  yield no process names — but they mean opposite things. Empty means
 *  web-only, which is a deliberate statement. Unreadable means the product
 *  silently vanishes from the endpoint allow/deny push, which is a defect
 *  wearing a policy decision's clothes. */
export function mappingIsCorrupt(entry: CatalogEntry): boolean {
  if (!entry.processNames) return false;
  const parsed = safeParse<unknown>(entry.processNames, null);
  return !Array.isArray(parsed);
}

/** An entry only counts as permitting anything while it still holds — the same
 *  validity rule the catalog gate uses, so policy and routing cannot disagree. */
export function entryIsValid(entry: CatalogEntry): boolean {
  return entry.review > today() && entry.kevSince === 0;
}

export type Bucket = "approved" | "shadow" | "unused" | "flagged" | "system" | "unclassified";

export type EstateRow = {
  key: string;
  name: string;
  publisher: string | null;
  instances: number;
  worstThreat: string;
  reasons: string[];
  entry: CatalogEntry | null;
  bucket: Bucket;
  note: string;
  origin: Origin;
  requestId?: string;
};

export type Estate = {
  rows: EstateRow[];
  shadow: EstateRow[];
  approved: EstateRow[];
  flagged: EstateRow[];
  unused: { entry: CatalogEntry; reason: string }[];
  webOnly: CatalogEntry[];
  scanned: number;
  thirdParty: number;
  /** driver and vendor utilities — counted, never listed as findings */
  systemNoise: number;
  /** no path and no publisher: the analyzer was not run elevated, so origin
   *  could not be established. Reported as unknown, never as unapproved. */
  unclassified: number;
};

const SEVERITY = { Malicious: 3, Suspicious: 2, Safe: 1 } as const;

/** Hardware vendors whose driver and utility services fill any laptop scan.
 *  Listing IntelAudioService.exe as "software nobody approved" is not a
 *  finding, it is noise — and noise is how a control gets ignored. */
const OEM = [
  "intel", "realtek", "nvidia", "amd", "hp inc", "hewlett", "dell", "lenovo",
  "synaptics", "elan", "conexant", "qualcomm", "broadcom", "logitech", "asus",
  "acer", "mediatek", "sonic", "waves audio",
];

const looksOem = (s: string) => OEM.some((v) => s.includes(v));

export type Origin = "installed" | "system" | "unknown";

/** Where a process came from decides whether it is a business decision at all.
 *  Something a person deliberately installed lives under their profile; a
 *  driver service does not. With no path and no publisher — which is what an
 *  unelevated scan returns — the honest answer is that we cannot tell, and
 *  "cannot tell" must not be reported as "unapproved". */
export function origin(p: ProcessRecord): Origin {
  const path = (p.path ?? "").toLowerCase();
  const publisher = (p.publisher ?? "").toLowerCase();

  if (!path && !publisher) return "unknown";
  if (publisher && looksOem(publisher)) return "system";
  if (path) {
    if (path.includes("\\users\\") || path.includes("appdata")) return "installed";
    if (path.includes("\\windows\\") || path.includes("\\system32\\")) return "system";
    if (looksOem(path)) return "system";
    return "installed"; // Program Files, but not an OEM path
  }
  return "installed";
}

export function reconcile(
  processes: ProcessRecord[],
  catalog: CatalogEntry[],
  requests: (Request & { decision: Decision | null })[]
): Estate {
  // an ingested scan is third-party data; a record missing its name used to
  // throw inside normalise() at render time, long after ingest accepted it
  const usable = (Array.isArray(processes) ? processes : []).filter(
    (p): p is ProcessRecord => Boolean(p) && typeof p.name === "string" && p.name.length > 0
  );
  const thirdParty = usable.filter(isThirdParty);

  // process name -> catalog entry
  const index = new Map<string, CatalogEntry>();
  for (const entry of catalog) {
    for (const pn of processNamesOf(entry)) index.set(pn, entry);
  }

  // products already rejected — running one of these is worse than unapproved
  const rejected = new Set(
    requests
      .filter((r) => r.decision?.outcome === "REJECT" && r.product)
      .map((r) => normalise(r.product!))
  );

  // group by executable so 14 chrome.exe processes are one row, not fourteen
  const grouped = new Map<string, ProcessRecord[]>();
  for (const p of thirdParty) {
    const k = normalise(p.name);
    grouped.set(k, [...(grouped.get(k) ?? []), p]);
  }

  const rows: EstateRow[] = [];
  const seenEntries = new Set<string>();

  for (const [key, group] of grouped) {
    const entry = index.get(key) ?? null;
    if (entry) seenEntries.add(entry.id);

    const worst = group.reduce(
      (acc, p) =>
        (SEVERITY[p.threatLevel as keyof typeof SEVERITY] ?? 0) >
        (SEVERITY[acc as keyof typeof SEVERITY] ?? 0)
          ? p.threatLevel
          : acc,
      "Safe" as string
    );
    const reasons = [...new Set(group.flatMap((p) => p.threatReasons ?? []))].slice(0, 4);
    const publisher = group.find((p) => p.publisher)?.publisher ?? null;
    const org = origin(group[0]);

    // a product whose request was rejected, still running, is the sharpest case
    const wasRejected = entry
      ? rejected.has(normalise(entry.name))
      : [...rejected].some((r) => key.includes(r) || r.includes(key.replace(/\.exe$/, "")));

    let bucket: Bucket;
    let note: string;

    if (wasRejected) {
      bucket = "flagged";
      note = "Rejected by the Head of Operations and still running. Should not be installed.";
    } else if (!entry && org === "system") {
      bucket = "system";
      note = "Driver or vendor utility. Not something anyone requests.";
    } else if (!entry && org === "unknown") {
      bucket = "unclassified";
      note =
        "Path and publisher unavailable — run the analyzer as Administrator to establish where this came from.";
    } else if (!entry) {
      bucket = "shadow";
      note = "Installed on this machine with no catalog entry. Nobody approved it.";
    } else if (!entryIsValid(entry)) {
      bucket = "shadow";
      note =
        entry.review <= today()
          ? `In the catalog, but the entry lapsed on ${entry.review}. Not currently permitted.`
          : `In the catalog, but ${entry.kevSince} new actively-exploited vulnerabilities have appeared since approval.`;
    } else {
      bucket = "approved";
      note = `Approved ${entry.approved}, current to ${entry.review}.`;
    }

    if (bucket !== "flagged" && org === "installed" && (worst === "Malicious" || worst === "Suspicious")) {
      // keep its approval note, but surface it in the flagged list too
      rows.push({
        key,
        name: group[0].name,
        publisher,
        instances: group.length,
        worstThreat: worst,
        reasons,
        entry,
        origin: org,
        bucket: bucket === "shadow" ? "flagged" : bucket,
        note:
          bucket === "shadow"
            ? `${note} The analyzer also scored it ${worst}.`
            : `${note} The analyzer scored it ${worst}.`,
      });
      continue;
    }

    rows.push({ key, name: group[0].name, publisher, instances: group.length, worstThreat: worst, reasons, entry, bucket, note, origin: org });
  }

  const webOnly = catalog.filter((c) => processNamesOf(c).length === 0);
  const unused = catalog
    .filter((c) => processNamesOf(c).length > 0 && !seenEntries.has(c.id))
    .map((entry) => ({
      entry,
      reason: `${entry.used} of ${entry.seats} seats assigned, but no process seen in this scan.`,
    }));

  return {
    rows,
    shadow: rows.filter((r) => r.bucket === "shadow"),
    approved: rows.filter((r) => r.bucket === "approved"),
    flagged: rows.filter((r) => r.bucket === "flagged"),
    unused,
    webOnly,
    scanned: usable.length,
    thirdParty: thirdParty.length,
    systemNoise: rows.filter((r) => r.bucket === "system").length,
    unclassified: rows.filter((r) => r.bucket === "unclassified").length,
  };
}

/* ── policy out ──────────────────────────────────────────────────────────── */

export type PolicySync = {
  reachable: boolean;
  whitelisted: string[];
  blacklisted: string[];
  pushed: number;
  failed: string[];
  skipped: { name: string; why: string }[];
};

/** Builds the allow/deny lists from the catalog and pushes them.
 *
 *  A catalog entry that has lapsed or picked up new exploited vulnerabilities
 *  drops off the whitelist on its own — the anti-rot rule reaching the
 *  endpoint rather than stopping at the UI. */
export async function syncPolicy(
  catalog: CatalogEntry[],
  requests: (Request & { decision: Decision | null })[],
  opts: { dryRun?: boolean } = {}
): Promise<PolicySync> {
  const whitelisted: string[] = [];
  const blacklisted: string[] = [];
  const skipped: { name: string; why: string }[] = [];

  for (const entry of catalog) {
    const names = processNamesOf(entry);
    if (names.length === 0) {
      skipped.push({
        name: entry.name,
        why: mappingIsCorrupt(entry)
          ? "process mapping is unreadable — fix the catalog entry, this product is currently in neither list"
          : "web-only — no process to permit or deny",
      });
      continue;
    }
    if (entryIsValid(entry)) whitelisted.push(...names);
    else
      skipped.push({
        name: entry.name,
        why:
          entry.review <= today()
            ? `entry lapsed ${entry.review} — withheld from the whitelist until re-approved`
            : `${entry.kevSince} new exploited vulnerabilities since approval — withheld`,
      });
  }

  // rejected products are denied by name, mapped through the catalog where one exists
  const byName = new Map(catalog.map((c) => [normalise(c.name), c]));
  for (const r of requests) {
    if (r.decision?.outcome !== "REJECT" || !r.product) continue;
    const entry = byName.get(normalise(r.product));
    const names = entry ? processNamesOf(entry) : [`${normalise(r.product).replace(/\s+/g, "")}.exe`];
    blacklisted.push(...names);
  }

  const white = [...new Set(whitelisted)].filter((n) => !blacklisted.includes(n));
  const black = [...new Set(blacklisted)];

  if (opts.dryRun)
    return { reachable: true, whitelisted: white, blacklisted: black, pushed: 0, failed: [], skipped };

  const failed: string[] = [];
  let pushed = 0;
  let reachable = true;

  const push = async (name: string, action: PolicyAction) => {
    const ok = await pushPolicy(name, action);
    if (ok) pushed++;
    else {
      failed.push(name);
      reachable = false;
    }
  };

  for (const n of white) await push(n, "whitelist");
  for (const n of black) await push(n, "blacklist");

  return { reachable, whitelisted: white, blacklisted: black, pushed, failed, skipped };
}
