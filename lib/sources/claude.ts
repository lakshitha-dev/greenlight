/** Claude synthesis layer.
 *
 *  The structured sources (KEV, NVD, ToSDR, OSV) answer the security question.
 *  Nothing answers the compliance question — there is no public API for
 *  "does this vendor have a SOC 2 report", so that evidence lives on trust
 *  centres and legal pages as prose.
 *
 *  Two calls rather than one:
 *    1. web search, prose out — gathers evidence with URLs
 *    2. no tools, structured out — turns that evidence into typed facts
 *  Citations and output_config.format cannot be combined on one request, and
 *  splitting them keeps each call simple enough to reason about when it fails.
 *
 *  With no ANTHROPIC_API_KEY the app still works: these fields come back
 *  "not found", which routes blocking requirements to More Information
 *  Required. That is the honest answer, not a degraded one.
 */

import Anthropic from "@anthropic-ai/sdk";
import { fact, notFound, type Fact, type Step } from "./http";

/** Claude is reachable two ways, and the app takes whichever is configured.
 *
 *  1. Directly, with an ANTHROPIC_API_KEY from console.anthropic.com.
 *  2. Through Vercel AI Gateway, which speaks the same Messages API — so the
 *     SDK stays exactly as it is and only the base URL and model prefix
 *     change. On Vercel the gateway authenticates with the deployment's own
 *     OIDC token, so there is no key to manage at all.
 *
 *  Same model, same price either way. */
const GATEWAY_URL = "https://ai-gateway.vercel.sh";

function useGateway(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return false; // a direct key wins
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/** The gateway namespaces model ids by provider; direct Anthropic does not. */
function modelId(): string {
  return useGateway() ? "anthropic/claude-opus-5" : "claude-opus-5";
}

function makeClient(): Anthropic {
  if (!useGateway()) return new Anthropic();
  return new Anthropic({
    baseURL: GATEWAY_URL,
    // the gateway takes its own credential; on Vercel that is the OIDC token
    apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN ?? "",
  });
}

export type ComplianceFacts = {
  soc2: Fact<boolean>;
  iso27001: Fact<boolean>;
  dpa: Fact<boolean>;
  subprocessors: Fact<boolean>;
  residency: Fact<string>;
  sso: Fact<boolean>;
  annualCost: Fact<number>;
  summary: string | null;
};

const EMPTY: ComplianceFacts = {
  soc2: notFound(),
  iso27001: notFound(),
  dpa: notFound(),
  subprocessors: notFound(),
  residency: notFound(),
  sso: notFound(),
  annualCost: notFound(),
  summary: null,
};

/** The SDK resolves credentials in order: ANTHROPIC_API_KEY, then
 *  ANTHROPIC_AUTH_TOKEN, then an OAuth profile on disk. Checking only the
 *  first meant a configured OAuth token was ignored and the whole compliance
 *  layer silently skipped — so ask the same question the SDK will. */
export function hasKey(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || useGateway()
  );
}

/** Which credential is in play. An API key is the supported way to back an
 *  application; an OAuth token is issued for the Claude Code CLI against a
 *  personal subscription, so it may be refused here and is not the right thing
 *  to run a deployed service on. */
export function credentialKind(): "api-key" | "vercel-gateway" | "oauth-token" | "none" {
  if (process.env.ANTHROPIC_API_KEY) return "api-key";
  if (useGateway()) return "vercel-gateway";
  if (process.env.ANTHROPIC_AUTH_TOKEN) return "oauth-token";
  return "none";
}

const FINDINGS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["soc2", "iso27001", "dpa", "subprocessors", "residency", "sso", "annualCostLkr", "summary"],
  properties: {
    soc2: field("Whether a SOC 2 Type II report is obtainable"),
    iso27001: field("Whether ISO 27001 certification is published"),
    dpa: field("Whether a Data Processing Agreement is publicly available"),
    subprocessors: field("Whether a sub-processor list is published"),
    residency: {
      type: "object",
      additionalProperties: false,
      required: ["value", "provenance", "source"],
      properties: {
        value: { type: ["string", "null"], description: "Where customer data is stored, e.g. 'United States'" },
        provenance: prov(),
        source: src(),
      },
    },
    sso: field("Whether SSO/SAML is supported on the tier being requested"),
    annualCostLkr: {
      type: "object",
      additionalProperties: false,
      required: ["value", "provenance", "source"],
      properties: {
        value: { type: ["number", "null"], description: "Estimated annual cost in LKR for the requested seat count" },
        provenance: prov(),
        source: src(),
      },
    },
    summary: { type: "string", description: "Two sentences on the vendor's posture. State plainly what could not be found." },
  },
} as const;

function field(description: string) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "provenance", "source"],
    properties: {
      value: { type: ["boolean", "null"], description: `${description}. null when it could not be established.` },
      provenance: prov(),
      source: src(),
    },
  };
}
function prov() {
  return {
    type: "string",
    enum: ["sourced", "claimed", "none"],
    description:
      "'sourced' = found on an identifiable page; 'claimed' = the vendor asserts it with no independent evidence; 'none' = could not be established.",
  };
}
function src() {
  return { type: ["string", "null"], description: "URL or page the evidence came from." };
}

type RawFindings = {
  soc2: { value: boolean | null; provenance: string; source: string | null };
  iso27001: { value: boolean | null; provenance: string; source: string | null };
  dpa: { value: boolean | null; provenance: string; source: string | null };
  subprocessors: { value: boolean | null; provenance: string; source: string | null };
  residency: { value: string | null; provenance: string; source: string | null };
  sso: { value: boolean | null; provenance: string; source: string | null };
  annualCostLkr: { value: number | null; provenance: string; source: string | null };
  summary: string;
};

export async function researchCompliance(
  product: string,
  vendor: string | null,
  seats: number | null,
  onStep?: (s: Step) => void
): Promise<{ facts: ComplianceFacts; steps: Step[]; model?: string }> {
  const steps: Step[] = [];
  const push = (s: Step) => {
    steps.push(s);
    onStep?.(s);
  };

  if (!hasKey()) {
    push({
      source: "Vendor trust centre & legal pages",
      result:
        "Skipped — no Anthropic credential configured (set ANTHROPIC_API_KEY). " +
        "Compliance evidence is recorded as not found rather than assumed.",
      kind: "miss",
    });
    return { facts: EMPTY, steps };
  }

  const client = makeClient();
  const who = vendor ? `${product} (vendor: ${vendor})` : product;
  const t0 = Date.now();

  try {
    // ── 1. gather ────────────────────────────────────────────────────────────
    const research = await client.messages.create({
      model: modelId(),
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }],
      system:
        "You research software vendors for a corporate security and compliance review. " +
        "Report only what you can find on identifiable pages, and say plainly when something is absent. " +
        "An absent SOC 2 report or sub-processor list is a finding worth stating, never something to infer or assume. " +
        "Distinguish what a vendor asserts about itself from what an independent source confirms.",
      messages: [
        {
          role: "user",
          content:
            `Research ${who} for a software approval review. Find, with the page you found it on:\n` +
            `1. SOC 2 Type II report — obtainable, and is it current?\n` +
            `2. ISO 27001 certification\n` +
            `3. A publicly available Data Processing Agreement\n` +
            `4. A published sub-processor list\n` +
            `5. Where customer data is stored (data residency), and whether that is the vendor's own claim or independently confirmed\n` +
            `6. Whether SSO/SAML is available, and on which pricing tier\n` +
            `7. List price per seat per year${seats ? `, and the annual cost for ${seats} seats` : ""}\n\n` +
            `State explicitly which of these you could NOT find. Do not guess.`,
        },
      ],
    } as never);

    const prose = (research as { content: { type: string; text?: string }[] }).content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n");

    push({
      source: "Vendor trust centre & legal pages",
      result: prose ? firstLine(prose) : "Search returned no usable evidence.",
      kind: prose ? "done" : "miss",
      ms: Date.now() - t0,
    });

    // ── 2. type it ───────────────────────────────────────────────────────────
    const typed = await client.messages.create({
      model: modelId(),
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: FINDINGS_SCHEMA } },
      system:
        "Convert research notes into typed findings. Use null and provenance 'none' for anything the notes " +
        "do not positively establish. Never upgrade an absence into a negative or a positive.",
      messages: [
        {
          role: "user",
          content: `Research notes for ${who}${seats ? ` (${seats} seats)` : ""}:\n\n${prose}\n\nConvert to findings. Costs in LKR; assume 1 USD = 300 LKR if only USD pricing is given.`,
        },
      ],
    } as never);

    const raw = extractJson<RawFindings>(typed);
    if (!raw) {
      push({ source: "Findings extraction", result: "Could not parse structured findings.", kind: "miss" });
      return { facts: EMPTY, steps, model: modelId() };
    }

    const toFact = <T>(f: { value: T | null; provenance: string; source: string | null }): Fact<T> =>
      f.value === null || f.provenance === "none"
        ? notFound(f.source ?? "")
        : fact(f.value, f.provenance === "claimed" ? "claimed" : "sourced", f.source ?? "web", f.source ?? undefined);

    const facts: ComplianceFacts = {
      soc2: toFact(raw.soc2),
      iso27001: toFact(raw.iso27001),
      dpa: toFact(raw.dpa),
      subprocessors: toFact(raw.subprocessors),
      residency: toFact(raw.residency),
      sso: toFact(raw.sso),
      annualCost: toFact(raw.annualCostLkr),
      summary: raw.summary ?? null,
    };

    const missing = Object.entries(facts)
      .filter(([k, v]) => k !== "summary" && (v as Fact).prov === "none")
      .map(([k]) => k);

    push({
      source: "Sub-processor & certification disclosure",
      result: missing.length
        ? `Could not establish: ${missing.join(", ")}. Recorded as not found.`
        : "All compliance evidence located and attributed to a source.",
      kind: missing.length ? "miss" : "done",
    });

    return { facts, steps, model: modelId() };
  } catch (err) {
    push({
      source: "Vendor trust centre & legal pages",
      result: `Research unavailable (${err instanceof Error ? err.message.slice(0, 120) : "unknown error"}). Compliance evidence recorded as not found.`,
      kind: "miss",
      ms: Date.now() - t0,
    });
    return { facts: EMPTY, steps };
  }
}

function firstLine(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 190 ? t.slice(0, 187) + "…" : t;
}

function extractJson<T>(msg: unknown): T | null {
  const content = (msg as { content: { type: string; text?: string }[] }).content ?? [];
  const text = content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}
