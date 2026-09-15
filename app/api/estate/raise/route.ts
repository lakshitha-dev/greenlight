import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withUniqueId } from "@/lib/ids";
import { currentActor } from "@/lib/auth";
import { handler, readBody, fail } from "@/lib/api";

const Body = z.object({
  processName: z.string().min(1, "is required").max(260),
  publisher: z.string().max(260).nullish(),
});

/** Turns a shadow-IT finding into a real request, which then routes through
 *  the catalog gate and live research like anything else. */
export const POST = handler("raise", async (req: Request) => {
  const parsed = await readBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const me = await currentActor();
  if (!me) return fail(401, "Sign in to raise a request.");
  const { processName, publisher } = parsed.data;

  const product = processName.replace(/\.exe$/i, "");

  const created = await withUniqueId(async (id) =>
    db.$transaction(async (tx) => {
      const r = await tx.request.create({
        data: {
          id,
          kind: "software",
          product,
          vendor: publisher ?? null,
          seats: 1,
          subject: `${product} — found running without approval`,
          requester: "GreenLight (endpoint scan)",
          team: "IT Infrastructure",
          entity: "BISTEC Global",
          body:
            `A process-analyzer scan found ${processName} running on an endpoint with no matching ` +
            `catalog entry.\n\nPublisher: ${publisher ?? "unsigned or unknown"}\n\n` +
            `Raised automatically so it can be assessed rather than left in place.`,
          personalData: true,
          crossBorder: "unknown",
        },
      });
      await tx.auditEvent.create({
        data: {
          requestId: id,
          action: "Shadow IT raised for review",
          detail: `${processName} found running with no catalog entry · request ${id} created`,
          actor: "GreenLight",
          authority: "catalog-gate@1.0",
        },
      });
      return r;
    })
  );

  return NextResponse.json({ ok: true, id: created.id });
});
