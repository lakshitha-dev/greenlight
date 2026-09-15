/** The whole loop, end to end, on real data.
 *
 *  Run:  npm run walkthrough
 *
 *  Prints what GreenLight does to one request from arrival to decision, using
 *  the same functions the app uses — no mocks, live security sources. Useful
 *  as a rehearsal, and as proof the parts still fit together.
 */

import { db } from "../lib/db";
import { routeRequest, TIER_LABEL } from "../lib/catalog";
import { research } from "../lib/research";
import { packFor, evaluate, VERDICT } from "../lib/rulepack";
import { parseFindings, factsFromFindings } from "../lib/findings";
import { screen, risks, worst } from "../lib/dpia";
import { syncPolicy } from "../lib/estate";
import { credentialKind } from "../lib/sources/claude";
import type { Fact } from "../lib/sources/http";

const W = 74;
const rule = (s = "─") => console.log(s.repeat(W));
const step = (n: number, title: string) => {
  console.log();
  rule();
  console.log(` ${n}.  ${title.toUpperCase()}`);
  rule();
};
const say = (s = "") => console.log(`     ${s}`);

async function main() {
  const TARGET = process.argv[2] ?? "SR-1043";

  console.log();
  console.log("  GreenLight — one request, arrival to decision");
  console.log(`  credential in use: ${credentialKind()}`);

  /* 1 ─ what arrived ─────────────────────────────────────────────────── */
  const r = await db.request.findUnique({ where: { id: TARGET } });
  if (!r) throw new Error(`No request ${TARGET}. Run npm run seed first.`);
  if (!r.product) throw new Error(`${TARGET} names no product — try a software request.`);
  const product = r.product;

  step(1, "a request arrives");
  say(`${r.id} · ${product} · ${r.seats} seats`);
  say(`from ${r.requester}, ${r.team} · ${r.entity || "entity not established"}`);
  say();
  for (const line of r.body.split("\n").slice(0, 4)) say(`  ${line}`);

  /* 2 ─ the gate ─────────────────────────────────────────────────────── */
  const catalog = await db.catalogEntry.findMany();
  const route = routeRequest(product, r.entity, catalog);

  step(2, "the catalog gate asks: do we already own this?");
  say(`Tier ${route.tier} — ${TIER_LABEL[route.tier]}`);
  say(route.fails?.join(" ") ?? route.note ?? "");
  if (route.tier < 2) {
    say();
    say("Settled without an approver. Nothing below would run.");
    await db.$disconnect();
    return;
  }

  /* 3 ─ what machines can answer ─────────────────────────────────────── */
  step(3, "security sources — no credential, about a second");
  const dossier = await research(product, r.vendor, r.seats);
  for (const s of dossier.steps) {
    const mark = s.kind === "hit" ? "!" : s.kind === "miss" ? "?" : "✓";
    say(`${mark}  ${s.source}`);
    say(`   ${s.result.slice(0, 96)}`);
  }
  say();
  say(`${dossier.elapsedMs} ms`);

  /* 4 ─ what only Claude can answer ──────────────────────────────────── */
  step(4, "compliance — the questions no api answers");
  let facts = dossier.facts;

  if (credentialKind() === "none") {
    say("No credential, so this is the Claude Skill route: GreenLight prints a");
    say("prompt, a person runs it in Claude, and pastes the JSON back. Or Claude");
    say("does it itself over MCP. Simulating that paste here:");
    say();
    const pasted = parseFindings(
      JSON.stringify({
        soc2: { value: true, provenance: "sourced", source: "https://notion.so/security" },
        iso27001: { value: true, provenance: "sourced", source: "https://notion.so/security" },
        dpa: { value: true, provenance: "claimed", source: null },
        subprocessors: { value: null, provenance: "none", source: null },
        residency: { value: "United States", provenance: "claimed", source: null },
        sso: { value: false, provenance: "sourced", source: "https://notion.so/pricing" },
        annualCostLkr: { value: 648000, provenance: "sourced", source: "https://notion.so/pricing" },
        summary: "SOC 2 and ISO 27001 published. The DPA is asserted but not published.",
      })
    );
    if (!pasted.ok) throw new Error(pasted.error);
    facts = { ...facts, ...factsFromFindings(pasted.data, "the Head of Operations") };
  } else {
    say("Credential present — this ran automatically as part of step 3.");
  }

  say();
  for (const k of ["kevEntries", "criticalCves", "privacyGrade", "soc2", "dpa", "subprocessors", "residency", "sso", "annualCost"]) {
    const f = (facts as Record<string, Fact<unknown>>)[k];
    if (!f) continue;
    const v = f.value === null ? "not found" : String(f.value);
    say(`${k.padEnd(15)} ${v.padEnd(16)} ${f.prov}`);
  }

  /* 5 ─ the verdict is derived, not chosen ───────────────────────────── */
  const pack = packFor(r.entity);
  const ev = evaluate(facts, pack);

  step(5, "the rule pack decides — versioned yaml, owned by operations");
  say(`${pack.id}@${pack.version} · ${pack.entity} · ${pack.jurisdiction ?? ""}`);
  say();
  for (const c of ev.checks) {
    const mark = { pass: "✓", fail: "✕", miss: "?", off: "–" }[c.status];
    say(`${mark} ${c.id}  ${c.label}`);
    say(`     ${c.why.slice(0, 92)}`);
  }
  say();
  say(`RECOMMENDATION: ${VERDICT[ev.outcome].t}`);
  say(VERDICT[ev.outcome].w);

  /* 6 ─ privacy ──────────────────────────────────────────────────────── */
  const sc = screen(r);
  step(6, "privacy screening — only when the law actually requires it");
  if (!sc.required) {
    say(`Not required. ${sc.note}`);
  } else {
    say(`Required under ${sc.regime}`);
    for (const t of sc.triggers) say(`  ${t.id}  ${t.label}  (${t.authority})`);
    const rs = risks(r, facts);
    say();
    say(`${rs.length} risks · residual ${worst(rs)}`);
    for (const x of rs) say(`  ${x.id} ${x.residual.padEnd(7)} ${x.risk.slice(0, 60)}`);
  }

  /* 7 ─ a person decides ─────────────────────────────────────────────── */
  step(7, "a person decides — greenlight never does");
  say("Approve · Approve with conditions · Request more info · Reject");
  say();
  say("Only the approver role may press these. A requester is refused and told");
  say("why. The decision, the catalog write and the audit event commit together");
  say("or not at all — a decision with no evidence behind it is worse than none.");

  /* 8 ─ the loop closes ──────────────────────────────────────────────── */
  const requests = await db.request.findMany({ include: { decision: true } });
  const policy = await syncPolicy(catalog, requests, { dryRun: true });

  step(8, "the loop closes");
  say("On approval the product joins the catalog, so the next request for it");
  say("self-serves and never reaches an approver again.");
  say();
  say("And policy reaches the machines:");
  say(`  permitted  ${policy.whitelisted.length}`);
  say(`  denied     ${policy.blacklisted.length}`);
  say(`  withheld   ${policy.skipped.length}`);
  for (const s of policy.skipped) say(`     ${s.name} — ${s.why.slice(0, 72)}`);

  /* 9 ─ evidence ─────────────────────────────────────────────────────── */
  const events = await db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 5 });
  step(9, "the audit file builds itself");
  for (const e of events)
    say(`${e.createdAt.toISOString().slice(0, 19).replace("T", " ")}  ${e.action.padEnd(28)} ${e.actor.padEnd(22)} ${e.authority}`);

  console.log();
  rule("═");
  console.log("  GreenLight never approves anything. It makes sure a person can.");
  rule("═");
  console.log();

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
