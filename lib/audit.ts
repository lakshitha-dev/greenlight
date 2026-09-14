/** Every step is recorded — including the ones no human touched.
 *  Automatic provisioning is not an exception to the audit trail; it is the
 *  part an auditor will ask about first. */
import { db } from "./db";

export async function logEvent(e: {
  requestId?: string | null;
  action: string;
  detail: string;
  actor: string;
  authority: string;
}) {
  return db.auditEvent.create({
    data: {
      requestId: e.requestId ?? null,
      action: e.action,
      detail: e.detail,
      actor: e.actor,
      authority: e.authority,
    },
  });
}
