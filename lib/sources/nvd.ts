/** NIST National Vulnerability Database.
 *  Works without a key but rate-limits hard (5 requests / 30s) and is often
 *  slow on a cold call. NVD_API_KEY raises the limit to 50/30s — set it if
 *  you have one, but the app is correct without it. */

import { cached, getJson, type Step } from "./http";

type NvdCve = {
  cve: {
    id: string;
    published: string;
    lastModified: string;
    descriptions?: { lang: string; value: string }[];
    metrics?: {
      cvssMetricV31?: { cvssData: { baseSeverity: string; baseScore: number } }[];
      cvssMetricV30?: { cvssData: { baseSeverity: string; baseScore: number } }[];
    };
  };
};

type NvdResponse = { totalResults: number; vulnerabilities: NvdCve[] };

const BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";
const TTL = 60 * 60 * 1000;

function severityOf(v: NvdCve): string {
  const m = v.cve.metrics;
  return (
    m?.cvssMetricV31?.[0]?.cvssData.baseSeverity ??
    m?.cvssMetricV30?.[0]?.cvssData.baseSeverity ??
    "UNKNOWN"
  );
}

export type NvdResult = {
  available: boolean;
  total?: number;
  critical?: number;
  high?: number;
  recentCritical?: { id: string; published: string; severity: string }[];
  step: Step;
};

export async function checkNvd(product: string): Promise<NvdResult> {
  const t0 = Date.now();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);

  const url = `${BASE}?keywordSearch=${encodeURIComponent(product)}&resultsPerPage=200`;
  const key = process.env.NVD_API_KEY;

  // one retry: NVD frequently times out on a cold unkeyed call, then answers instantly
  const fetchOnce = () =>
    getJson<NvdResponse>(url, {
      timeout: 20_000,
      headers: key ? { apiKey: key } : {},
    });

  const data = await cached(`nvd:${product.toLowerCase()}`, TTL, async () => {
    const first = await fetchOnce();
    return first ?? (await fetchOnce());
  });

  if (!data || !Array.isArray(data.vulnerabilities)) {
    return {
      available: false,
      step: {
        source: "NIST National Vulnerability Database",
        result: "No response within the time limit — CVE history could not be established.",
        kind: "miss",
        ms: Date.now() - t0,
      },
    };
  }

  const recent = data.vulnerabilities.filter((v) => {
    const published = v?.cve?.published;
    if (typeof published !== "string") return false;
    const d = new Date(published);
    return !Number.isNaN(d.getTime()) && d >= cutoff;
  });
  const critical = recent.filter((v) => severityOf(v) === "CRITICAL");
  const high = recent.filter((v) => severityOf(v) === "HIGH");

  return {
    available: true,
    total: data.totalResults ?? recent.length,
    critical: critical.length,
    high: high.length,
    recentCritical: critical.slice(0, 5).map((v) => ({
      id: v.cve.id,
      published: v.cve.published.slice(0, 10),
      severity: severityOf(v),
    })),
    step: {
      source: "NIST National Vulnerability Database",
      result:
        (data.totalResults ?? recent.length) === 0
          ? "No CVE history — the product does not appear in the database."
          : `${critical.length} critical and ${high.length} high-severity CVEs published in the last 24 months (${(data.totalResults ?? recent.length).toLocaleString()} records matched overall).`,
      kind: (data.totalResults ?? recent.length) === 0 ? "miss" : critical.length > 0 ? "hit" : "done",
      url: `https://nvd.nist.gov/vuln/search/results?query=${encodeURIComponent(product)}`,
      ms: Date.now() - t0,
    },
  };
}
