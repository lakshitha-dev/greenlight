import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncPolicy } from "@/lib/estate";
import { logEvent } from "@/lib/audit";
import { handler } from "@/lib/api";

export const maxDuration = 120;

/** Pushes the catalog to process-analyzer's allow/deny list. */
export const POST = handler("policy sync", async () => {
  const [catalog, requests] = await Promise.all([
    db.catalogEntry.findMany(),
    db.request.findMany({ include: { decision: true } }),
  ]);

  const result = await syncPolicy(catalog, requests);

  if (!result.reachable && result.pushed === 0)
    return NextResponse.json(
      { error: "process-analyzer is not reachable. Start it on port 3000 and try again.", ...result },
      { status: 503 }
    );

  await logEvent({
    action: "Endpoint policy synchronised",
    detail:
      `${result.whitelisted.length} permitted, ${result.blacklisted.length} denied, ` +
      `${result.skipped.length} withheld · pushed to process-analyzer`,
    actor: "GreenLight",
    authority: "catalog-gate@1.0",
  });

  return NextResponse.json({ ok: true, ...result });
});
