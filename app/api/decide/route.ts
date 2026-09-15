import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { packFor, VERDICT, type Outcome } from "@/lib/rulepack";
import { syncPolicy } from "@/lib/estate";
import { handler, readBody, fail } from "@/lib/api";

const Body = z.object({
  requestId: z.string().min(1, "is required"),
  outcome: z.enum(["APPROVE", "CONDITIONS", "REJECT", "MORE_INFO"]),
  comment: z.string().max(2000).nullish(),
});

export const POST = handler("decide", async (req: Request) => {
  const parsed = await readBody(req, Body);
  if (!parsed.ok) return parsed.response;
  const { requestId, outcome, comment } = parsed.data;

  const r = await db.request.findUnique({ where: { id: requestId } });
  if (!r) return fail(404, `No request with id ${requestId}.`);

  const pack = packFor(r.entity);
  const actor = "the Head of Operations";
  const today = new Date().toISOString().slice(0, 10);
  const nextReview = new Date();
  nextReview.setFullYear(nextReview.getFullYear() + 1);
  const review = nextReview.toISOString().slice(0, 10);

  const existing = r.product
    ? await db.catalogEntry.findUnique({ where: { name: r.product } })
    : null;

  /** One transaction. A compliance tool must never end up holding a decision
   *  with no audit event behind it — previously the decision committed first
   *  and a failure in the log write left it standing, unevidenced. Either all
   *  of this lands or none of it does. */
  await db.$transaction(async (tx) => {
    await tx.decision.upsert({
      where: { requestId: r.id },
      create: {
        requestId: r.id,
        outcome,
        actor,
        comment: comment ?? null,
        packId: pack.id,
        packVersion: pack.version,
      },
      update: { outcome, actor, comment: comment ?? null, packVersion: pack.version },
    });

    await tx.request.update({ where: { id: r.id }, data: { status: "decided" } });

    await tx.auditEvent.create({
      data: {
        requestId: r.id,
        action: "Decision recorded",
        detail: `${r.product ?? r.subject} — ${VERDICT[outcome as Outcome].t} by ${actor}${comment ? ` · "${comment}"` : ""}`,
        actor,
        authority: `${pack.id}@${pack.version}`,
      },
    });

    // an approval closes the loop: the product enters the catalog, and the
    // next person who asks for it self-serves
    if ((outcome === "APPROVE" || outcome === "CONDITIONS") && r.product) {
      if (existing) {
        await tx.catalogEntry.update({
          where: { name: r.product },
          data: { approved: today, review, kevSince: 0 },
        });
        await tx.auditEvent.create({
          data: {
            requestId: r.id,
            action: "Catalog entry renewed",
            detail: `${r.product} · next review ${review} · self-service restored`,
            actor: "GreenLight",
            authority: "catalog-gate@1.0",
          },
        });
      } else {
        await tx.catalogEntry.create({
          data: {
            name: r.product,
            vendor: r.vendor ?? "—",
            seats: r.seats ?? 1,
            used: 0,
            approved: today,
            review,
            entities: JSON.stringify([r.entity]),
            kev: 0,
            kevSince: 0,
            owner: r.team,
            cost: "—",
            processNames: JSON.stringify([]),
          },
        });
        await tx.auditEvent.create({
          data: {
            requestId: r.id,
            action: "Added to software catalog",
            detail: `${r.product} · scoped to ${r.entity} · future requests self-serve · review ${review}`,
            actor: "GreenLight",
            authority: "catalog-gate@1.0",
          },
        });
      }
    }
  });

  /** Outside the transaction on purpose: pushing policy is a network call to
   *  another process, and the decision must stand whether or not the endpoint
   *  agent is reachable. */
  let policy: { pushed: number; reachable: boolean } | null = null;
  try {
    const [catalog, all] = await Promise.all([
      db.catalogEntry.findMany(),
      db.request.findMany({ include: { decision: true } }),
    ]);
    const res = await syncPolicy(catalog, all);
    policy = { pushed: res.pushed, reachable: res.reachable };
    if (res.pushed > 0)
      await db.auditEvent.create({
        data: {
          requestId: r.id,
          action: "Endpoint policy updated",
          detail: `${res.whitelisted.length} permitted, ${res.blacklisted.length} denied · pushed to process-analyzer`,
          actor: "GreenLight",
          authority: "catalog-gate@1.0",
        },
      });
  } catch (e) {
    console.warn("[greenlight] policy push after decision failed:", e);
    policy = null;
  }

  return NextResponse.json({ ok: true, outcome, policy });
});
