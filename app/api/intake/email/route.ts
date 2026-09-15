import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withUniqueId } from "@/lib/ids";
import { currentActor } from "@/lib/auth";
import { handler, readBody, fail } from "@/lib/api";
import {
  InboundEmailSchema,
  parseRawEmail,
  parseExtraction,
  senderAllowed,
  fieldsFromExtraction,
  draftClarification,
  EMPTY_EXTRACTION,
  type InboundEmail,
  type Extraction,
} from "@/lib/email";
import { intakeTokenOk } from "@/lib/intake-token";
import { extractRequest, hasKey } from "@/lib/sources/claude";

export const maxDuration = 120;

const Body = z.object({
  /** The structured form, from Power Automate. */
  email: InboundEmailSchema.optional(),
  /** The pasted form, from the intake page. */
  raw: z.string().optional(),
  /** The JSON the Skill returned, when a person ran it themselves. */
  extraction: z.string().optional(),
});

/** Intake by email.
 *
 *  Both front doors arrive here: a person pasting a message on /intake/email,
 *  and a Power Automate flow posting one from Outlook. They differ only in how
 *  the caller proves itself. What happens to the message is identical, because
 *  the honest handling of an email does not depend on how it reached us.
 *
 *  Nothing on this path can approve anything. It writes a request and an audit
 *  line; every verb that decides lives behind a session and the approver role.
 */
export const POST = handler("email intake", async (req: Request) => {
  const parsed = await readBody(req, Body);
  if (!parsed.ok) return parsed.response;

  const me = await currentActor();
  const viaToken = intakeTokenOk(req.headers.get("x-greenlight-token"));
  if (!me && !viaToken)
    return fail(401, "Sign in, or send a valid x-greenlight-token header.");

  // ── the message ──────────────────────────────────────────────────────────
  let email: InboundEmail;
  if (parsed.data.email) {
    email = parsed.data.email;
  } else if (parsed.data.raw) {
    const r = parseRawEmail(parsed.data.raw);
    if (!r.ok) return fail(400, r.error);
    email = r.data;
  } else {
    return fail(400, "Send either an `email` object or the `raw` text of one.");
  }

  // ── stage 1: is this even a candidate ────────────────────────────────────
  if (!senderAllowed(email.from))
    return fail(
      403,
      `${email.from} is not an internal address, so this was not turned into a request. ` +
        `A display name is not identity — the address in angle brackets is what counts.`
    );

  /** A thread already linked to a request is that request. Without this an
   *  eight-message thread becomes eight requests, which is the failure every
   *  naive mailbox integration ships with. */
  if (email.conversationId) {
    const existing = await db.request.findUnique({
      where: { emailConversationId: email.conversationId },
      select: { id: true },
    });
    if (existing) {
      await db.auditEvent.create({
        data: {
          requestId: existing.id,
          action: "Reply received on the same thread",
          detail: `From ${email.from} · ${email.subject || "(no subject)"} · attached, no new request created`,
          actor: me?.name ?? "Outlook",
          authority: "email-intake@1.0",
        },
      });
      return NextResponse.json({ ok: true, requestId: existing.id, duplicate: true });
    }
  }

  // ── stage 2: read it ─────────────────────────────────────────────────────
  let extraction: Extraction = EMPTY_EXTRACTION;
  let readBy = "not yet read — every field is a gap";

  if (parsed.data.extraction) {
    const x = parseExtraction(parsed.data.extraction);
    if (!x.ok) return fail(400, x.error);
    extraction = x.data;
    readBy = `read in Claude by ${me?.name ?? "a person"} and pasted back`;
  } else if (hasKey()) {
    const got = await extractRequest(email);
    if (got.raw) {
      const x = parseExtraction(got.raw);
      // A shape we cannot validate is treated as nothing read, never as
      // partial truth — the request is still logged, with every field a gap.
      if (x.ok) {
        extraction = x.data;
        readBy = "read automatically by Claude";
      }
    }
  }

  const { fields, gaps } = fieldsFromExtraction(email, extraction);
  const draft = draftClarification(email, gaps);

  const created = await withUniqueId((id) =>
    db.$transaction(async (tx) => {
      const r = await tx.request.create({
        data: {
          id,
          kind: "software",
          product: fields.product,
          vendor: fields.vendor,
          seats: fields.seats,
          subject: fields.subject,
          requester: fields.requester,
          team: fields.team,
          entity: fields.entity,
          body: fields.body,
          personalData: fields.personalData,
          specialCat: fields.specialCat,
          source: "email",
          emailFrom: email.from,
          emailReceivedAt: email.receivedAt ?? null,
          emailConversationId: email.conversationId ?? null,
          rawEmail: email.body,
          gaps: gaps.length ? JSON.stringify(gaps) : null,
          draftReply: draft || null,
        },
      });
      await tx.auditEvent.create({
        data: {
          requestId: id,
          action: "Request received by email",
          detail: [
            `From ${email.from}`,
            fields.product ?? "no product named",
            readBy,
            gaps.length ? `${gaps.length} question(s) to put back` : "nothing left unanswered",
          ].join(" · "),
          actor: fields.requester,
          authority: "email-intake@1.0",
        },
      });
      return r;
    })
  );

  return NextResponse.json(
    { ok: true, requestId: created.id, gaps: gaps.map((g) => g.field) },
    { status: 201 }
  );
});
