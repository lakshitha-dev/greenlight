import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { research } from "@/lib/research";
import { packFor, evaluate, VERDICT } from "@/lib/rulepack";
import { currentActor } from "@/lib/auth";
import { handler, readBody, fail } from "@/lib/api";

export const maxDuration = 120;

const Body = z.object({ requestId: z.string().min(1, "is required") });

export const POST = handler("research", async (req: Request) => {
  const parsed = await readBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const me = await currentActor();
  if (!me) return fail(401, "Sign in to run research.");

  const r = await db.request.findUnique({ where: { id: parsed.data.requestId } });
  if (!r) return fail(404, `No request with id ${parsed.data.requestId}.`);
  if (!r.product) return fail(400, "This request names no product, so there is nothing to research.");

  const entry = await db.catalogEntry.findUnique({ where: { name: r.product } });
  const dossier = await research(r.product, r.vendor, r.seats, { approvedSince: entry?.approved });

  const pack = packFor(r.entity);
  const ev = evaluate(dossier.facts, pack);

  const payload = {
    facts: JSON.stringify(dossier.facts),
    sources: JSON.stringify(dossier.steps),
    model: dossier.model,
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
        action: "Research completed",
        detail: `${r.product} · ${dossier.steps.length} sources · ${(dossier.elapsedMs / 1000).toFixed(1)}s · recommended ${VERDICT[ev.outcome].t}`,
        actor: dossier.model ? `GreenLight + ${dossier.model}` : "GreenLight",
        authority: `${pack.id}@${pack.version}`,
      },
    });
  });

  return NextResponse.json({
    ok: true,
    outcome: ev.outcome,
    elapsedMs: dossier.elapsedMs,
    steps: dossier.steps.length,
  });
});
