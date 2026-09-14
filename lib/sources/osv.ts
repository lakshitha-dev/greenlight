/** OSV.dev — open-source vulnerability advisories. Free, keyless.
 *  Only meaningful when the request is for a library or a product with a
 *  published package. For hosted SaaS it correctly returns nothing, and
 *  saying so plainly is more useful than omitting the check. */

import { cached, getJson, type Step } from "./http";

type OsvVuln = { id: string; summary?: string; modified?: string };
type OsvResponse = { vulns?: OsvVuln[] };

const TTL = 6 * 60 * 60 * 1000;
const ECOSYSTEMS = ["npm", "PyPI", "Go", "Maven"] as const;

export type OsvResult = { checked: boolean; count: number; ids: string[]; step: Step };

export async function checkOsv(product: string): Promise<OsvResult> {
  const t0 = Date.now();
  const name = product.toLowerCase().replace(/\s+/g, "-");

  const results = await cached(`osv:${name}`, TTL, async () => {
    const batches = await Promise.all(
      ECOSYSTEMS.map((ecosystem) =>
        getJson<OsvResponse>("https://api.osv.dev/v1/query", {
          method: "POST",
          timeout: 8_000,
          body: { package: { name, ecosystem } },
        })
      )
    );
    return batches.flatMap((r) => r?.vulns ?? []);
  });

  const ids = [...new Set(results.map((v) => v.id))].slice(0, 8);

  return {
    checked: true,
    count: ids.length,
    ids,
    step: {
      source: "OSV.dev open-source advisories",
      result: ids.length
        ? `${ids.length} advisories against a published package of this name (${ids.slice(0, 3).join(", ")}${ids.length > 3 ? "…" : ""}).`
        : "No published package of this name — hosted service, so no open-source advisories apply.",
      kind: ids.length ? "hit" : "done",
      url: `https://osv.dev/list?q=${encodeURIComponent(product)}`,
      ms: Date.now() - t0,
    },
  };
}
