/** GreenLight MCP server.
 *
 *  Without this, the compliance half of a dossier is a copy-paste: GreenLight
 *  prints a prompt, a person carries it to Claude, and carries JSON back.
 *  That works, and it keeps a human on the judgement step — but the carrying
 *  is not the human judgement, it is just carrying.
 *
 *  These tools let Claude do the carrying itself: read what is waiting, see
 *  what evidence is missing and why it matters, research it, and write the
 *  findings back. What does not change is who decides. There is deliberately
 *  no tool here that approves anything, and there never should be — an
 *  approval is the act the audit trail exists to evidence, and it needs a
 *  person with the authority to make it.
 *
 *  Run:  npm run mcp
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { db } from "../lib/db";
import { research } from "../lib/research";
import { packFor, evaluate, VERDICT, isAssessed } from "../lib/rulepack";
import { routeRequest } from "../lib/catalog";
import { factsFromFindings, FindingsSchema } from "../lib/findings";
import { expect as expectShape, isObject } from "../lib/json";
import type { Fact } from "../lib/sources/http";

const ACTOR = "Claude (MCP)";

const server = new McpServer(
  { name: "greenlight", version: "1.0.0" },
  {
    instructions:
      "GreenLight decides whether software may be used inside a company. You can read what is " +
      "waiting for evidence, research vendors, and record what you find — but you cannot approve " +
      "anything, by design. Record only what you actually established: mark a field 'none' rather " +
      "than guessing, because a gap routes the request to a person and a guess approves software " +
      "on evidence that does not exist.",
  }
);

/* ── read ────────────────────────────────────────────────────────────────── */

server.registerTool(
  "list_requests_needing_evidence",
  {
    title: "List requests needing evidence",
    description:
      "Software requests that reached full review and are missing compliance evidence. " +
      "Start here: it tells you which vendors to research and why each one is waiting.",
    inputSchema: {},
  },
  async () => {
    const [requests, catalog] = await Promise.all([
      db.request.findMany({
        where: { kind: "software" },
        include: { dossier: true, decision: true },
        orderBy: { receivedAt: "asc" },
      }),
      db.catalogEntry.findMany(),
    ]);

    const waiting = requests
      .filter((r) => !r.decision)
      .map((r) => ({ r, rt: routeRequest(r.product, r.entity, catalog) }))
      .filter(({ rt }) => rt.tier === 2)
      .map(({ r, rt }) => {
        const facts = expectShape<Record<string, Fact<unknown>>>(r.dossier?.facts, isObject, {});
        const pack = packFor(r.entity);
        const ev = Object.keys(facts).length ? evaluate(facts, pack) : null;
        const missing = ev?.checks.filter((c) => c.status === "miss").map((c) => `${c.id} ${c.label}`) ?? [];

        return {
          id: r.id,
          product: r.product,
          vendor: r.vendor,
          seats: r.seats,
          entity: r.entity,
          rulePack: `${pack.id}@${pack.version}`,
          whyFullReview: rt.cause === "stale" ? rt.fails?.join(" ") : rt.note,
          researched: Boolean(r.dossier),
          currentOutcome: ev ? VERDICT[ev.outcome].t : "not yet researched",
          missingEvidence: missing,
        };
      });

    return {
      content: [
        {
          type: "text",
          text:
            waiting.length === 0
              ? "Nothing is waiting on evidence."
              : JSON.stringify(waiting, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "get_request",
  {
    title: "Get a request",
    description:
      "Everything known about one request: what was asked for, what the structured security " +
      "sources found, and requirement by requirement what is satisfied, failed or missing.",
    inputSchema: { requestId: z.string().describe("e.g. SR-1043") },
  },
  async ({ requestId }) => {
    const r = await db.request.findUnique({
      where: { id: requestId },
      include: { dossier: true, decision: true },
    });
    if (!r) return { content: [{ type: "text", text: `No request with id ${requestId}.` }], isError: true };

    const facts = expectShape<Record<string, Fact<unknown>>>(r.dossier?.facts, isObject, {});
    const pack = packFor(r.entity, r.kind === "iso" ? "document" : "software");
    const ev = Object.keys(facts).length ? evaluate(facts, pack) : null;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              id: r.id,
              subject: r.subject,
              product: r.product,
              vendor: r.vendor,
              seats: r.seats,
              entity: r.entity,
              requester: `${r.requester} · ${r.team}`,
              body: r.body,
              rulePack: `${pack.id}@${pack.version}`,
              jurisdiction: pack.jurisdiction ?? null,
              decided: r.decision?.outcome ?? null,
              facts: Object.fromEntries(
                Object.entries(facts).map(([k, f]) => [
                  k,
                  { value: f.value, provenance: f.prov, source: f.src || null },
                ])
              ),
              requirements: (ev?.checks ?? pack.requirements).map((c) => ({
                id: c.id,
                label: c.label,
                severity: c.severity,
                authority: c.authority,
                kind: isAssessed(c) ? "assessed" : "measured",
                status: "status" in c ? c.status : "not evaluated",
                why: "why" in c ? c.why : null,
              })),
              outcome: ev ? VERDICT[ev.outcome].t : null,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/* ── act ─────────────────────────────────────────────────────────────────── */

server.registerTool(
  "run_security_sources",
  {
    title: "Run the security sources",
    description:
      "Queries CISA KEV, NIST NVD, ToSDR and OSV.dev for a request and stores the result. " +
      "These need no credential and should not be researched by hand — run this before " +
      "researching compliance, so you only look for what no API answers.",
    inputSchema: { requestId: z.string() },
  },
  async ({ requestId }) => {
    const r = await db.request.findUnique({ where: { id: requestId } });
    if (!r?.product)
      return { content: [{ type: "text", text: `No product on request ${requestId}.` }], isError: true };

    const dossier = await research(r.product, r.vendor, r.seats);
    const pack = packFor(r.entity);
    const ev = evaluate(dossier.facts, pack);

    const payload = {
      facts: JSON.stringify(dossier.facts),
      sources: JSON.stringify(dossier.steps),
      model: dossier.model ?? null,
      elapsedMs: dossier.elapsedMs,
    };

    await db.$transaction(async (tx) => {
      await tx.dossier.upsert({
        where: { requestId: r.id },
        create: { requestId: r.id, ...payload },
        update: payload,
      });
      await tx.request.update({ where: { id: r.id }, data: { status: "researched" } });
      await tx.auditEvent.create({
        data: {
          requestId: r.id,
          action: "Security sources queried",
          detail: `${r.product} · ${dossier.steps.length} sources · via MCP`,
          actor: ACTOR,
          authority: `${pack.id}@${pack.version}`,
        },
      });
    });

    const missing = ev.checks.filter((c) => c.status === "miss").map((c) => `${c.id} ${c.label}`);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ranSources: dossier.steps.map((s) => `${s.source}: ${s.result}`),
              outcomeNow: VERDICT[ev.outcome].t,
              stillMissing: missing,
              next:
                missing.length > 0
                  ? "Research these on the vendor's trust centre and legal pages, then call record_findings."
                  : "Nothing missing. A person still has to decide.",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "record_findings",
  {
    title: "Record compliance findings",
    description:
      "Writes what you established about a vendor's compliance posture. Every field carries a " +
      "provenance: 'sourced' when you found it on an identifiable page (give the URL), 'claimed' " +
      "when only the vendor asserts it, 'none' when you could not establish it. A 'claimed' value " +
      "cannot satisfy a blocking requirement, and 'none' is recorded as not-found rather than as " +
      "false — so record honestly rather than completely.",
    inputSchema: { requestId: z.string(), findings: FindingsSchema },
  },
  async ({ requestId, findings }) => {
    const r = await db.request.findUnique({
      where: { id: requestId },
      include: { dossier: true },
    });
    if (!r?.product)
      return { content: [{ type: "text", text: `No product on request ${requestId}.` }], isError: true };

    const base = expectShape<Record<string, Fact<unknown>>>(r.dossier?.facts, isObject, {});
    const facts = { ...base, ...factsFromFindings(findings, ACTOR) };

    const pack = packFor(r.entity);
    const ev = evaluate(facts, pack);

    const steps = expectShape<unknown[]>(r.dossier?.sources, Array.isArray, []);
    const sources = [
      ...steps,
      {
        source: "Vendor trust centre & legal pages",
        result: `Researched by Claude over MCP. ${findings.summary ?? ""}`.trim(),
        kind: "done",
      },
    ];

    const payload = {
      facts: JSON.stringify(facts),
      sources: JSON.stringify(sources),
      model: "claude (mcp)",
      elapsedMs: r.dossier?.elapsedMs ?? 0,
    };

    await db.$transaction(async (tx) => {
      await tx.dossier.upsert({
        where: { requestId: r.id },
        create: { requestId: r.id, ...payload },
        update: payload,
      });
      await tx.request.update({ where: { id: r.id }, data: { status: "researched" } });
      await tx.auditEvent.create({
        data: {
          requestId: r.id,
          action: "Compliance findings recorded",
          detail: `${r.product} · researched by Claude over MCP · recommended ${VERDICT[ev.outcome].t}`,
          actor: ACTOR,
          authority: `${pack.id}@${pack.version}`,
        },
      });
    });

    const unresolved = ev.checks.filter((c) => c.status !== "pass" && c.status !== "off");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              recorded: true,
              rulePack: `${pack.id}@${pack.version}`,
              recommendation: VERDICT[ev.outcome].t,
              because: VERDICT[ev.outcome].w,
              unresolved: unresolved.map((c) => `${c.id} ${c.label} — ${c.why}`),
              note: "This is a recommendation. A person with the approver role decides.",
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

/* ── start ───────────────────────────────────────────────────────────────── */

async function main() {
  await server.connect(new StdioServerTransport());
  // stdout is the protocol channel; anything logged there corrupts it
  console.error("greenlight mcp server ready");
}

main().catch((e) => {
  console.error("greenlight mcp server failed:", e);
  process.exit(1);
});
