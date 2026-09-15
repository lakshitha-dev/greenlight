import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { research } from "@/lib/research";
import { packFor, evaluate, VERDICT } from "@/lib/rulepack";
import { parseFindings, factsFromFindings } from "@/lib/findings";
import { currentActor } from "@/lib/auth";
import { handler, readBody, fail } from "@/lib/api";
import { expect, isObject } from "@/lib/json";
import type { Fact } from "@/lib/sources/http";

export const maxDuration = 120;

const Body = z.object({
  requestId: z.string().min(1, "is required"),
  findings: z.string().min(2, "paste the JSON the Skill returned"),
});

/** Accepts compliance findings a person researched in Claude and pasted back.
 *
 *  The structured security sources still run here — they need no credential
 *  and nobody should be copying CVE counts by hand. Only the compliance half,
 *  which has no public API, comes from the paste. */
export const POST = handler("record findings", async (req: Request) => {
  const parsed = await readBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const me = await currentActor();
  if (!me) return fail(401, "Sign in to record findings.");

  const r = await db.request.findUnique({
    where: { id: parsed.data.requestId },
    include: { dossier: true },
  });
  if (!r) return fail(404, `No request with id ${parsed.data.requestId}.`);
  if (!r.product) return fail(400, "This request names no product.");

  const findings = parseFindings(parsed.data.findings);
  if (!findings.ok) return fail(400, findings.error);

  // run the keyless sources if they have not run yet, so the dossier is whole
  const existing = r.dossier
    ? expect<Record<string, Fact<unknown>>>(r.dossier.facts, isObject, {})
    : null;
  const base = existing ?? (await research(r.product, r.vendor, r.seats)).facts;
  const steps = r.dossier
    ? expect<unknown[]>(r.dossier.sources, Array.isArray, [])
    : (await research(r.product, r.vendor, r.seats)).steps;

  const facts = { ...base, ...factsFromFindings(findings.data, me.name) };

  const pack = packFor(r.entity);
  const ev = evaluate(facts, pack);

  const sources = [
    ...steps,
    {
      source: "Vendor trust centre & legal pages",
      result: `Researched in Claude by ${me.name} and pasted back. ${findings.data.summary ?? ""}`.trim(),
      kind: "done",
    },
  ];

  const payload = {
    facts: JSON.stringify(facts),
    sources: JSON.stringify(sources),
    model: "claude (software-compliance-research skill)",
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
        detail: `${r.product} · researched in Claude by ${me.name} · recommended ${VERDICT[ev.outcome].t}`,
        actor: me.name,
        authority: `${pack.id}@${pack.version}`,
      },
    });
  });

  return NextResponse.json({ ok: true, outcome: ev.outcome });
});
