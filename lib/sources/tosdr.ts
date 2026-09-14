/** Terms of Service; Didn't Read.
 *  Human-reviewed privacy grading (A best, E worst) per service. Free, keyless.
 *  The grade is the only structured privacy signal available without a lawyer,
 *  and "not rated" is itself a finding. */

import { cached, getJson, nameMatches, type Step } from "./http";

type TosdrService = {
  id: number;
  name: string;
  slug: string;
  rating: string | null;
  urls: string[];
  is_comprehensively_reviewed?: boolean;
};

type TosdrResponse = { services?: TosdrService[] };

const TTL = 24 * 60 * 60 * 1000;
const VALID = ["A", "B", "C", "D", "E"];

export type TosdrResult = {
  available: boolean;
  grade?: string;
  service?: string;
  slug?: string;
  comprehensive?: boolean;
  step: Step;
};

export async function checkTosdr(product: string): Promise<TosdrResult> {
  const t0 = Date.now();
  const data = await cached(`tosdr:${product.toLowerCase()}`, TTL, () =>
    getJson<TosdrResponse>(`https://api.tosdr.org/search/v5/?query=${encodeURIComponent(product)}`, {
      timeout: 12_000,
    })
  );

  const services = (Array.isArray(data?.services) ? data.services : []).filter(
    (s): s is TosdrService => Boolean(s) && typeof s.name === "string"
  );
  // exact name match first, then a loose match — avoids "Zoom" resolving to "ZoomInfo"
  const exact = services.find((s) => s.name.toLowerCase() === product.toLowerCase());
  const loose = services.find((s) => nameMatches(s.name, product));
  const svc = exact ?? loose;

  if (!svc || !svc.rating || !VALID.includes(svc.rating.toUpperCase())) {
    return {
      available: false,
      service: svc?.name,
      step: {
        source: "ToSDR privacy grading",
        result: svc
          ? `${svc.name} is listed but has no published grade — privacy terms unassessed.`
          : "Service not rated. No independent read on its privacy terms exists.",
        kind: "miss",
        url: "https://tosdr.org",
        ms: Date.now() - t0,
      },
    };
  }

  const grade = svc.rating.toUpperCase();
  return {
    available: true,
    grade,
    service: svc.name,
    slug: svc.slug,
    comprehensive: svc.is_comprehensively_reviewed,
    step: {
      source: "ToSDR privacy grading",
      result: `Grade ${grade} for ${svc.name}${svc.is_comprehensively_reviewed ? " (comprehensive review)" : " (partial review)"}.`,
      kind: ["D", "E"].includes(grade) ? "hit" : "done",
      url: `https://tosdr.org/en/service/${svc.slug}`,
      ms: Date.now() - t0,
    },
  };
}
