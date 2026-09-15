import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchScan, PA_URL } from "@/lib/sources/analyzer";
import { logEvent } from "@/lib/audit";
import { currentActor } from "@/lib/auth";
import { handler, fail } from "@/lib/api";
import { hostname } from "node:os";

/** The analyzer reports the machine it runs on, and does not name it. When it
 *  runs beside us that is this machine; when PROCESS_ANALYZER_URL points
 *  somewhere else, the scanned machine is that host — recording our own
 *  hostname would file another PC's software under this one. */
function scannedHost(): string {
  try {
    const h = new URL(PA_URL).hostname;
    const local = h === "localhost" || h === "127.0.0.1" || h === "::1";
    return local ? hostname() : h;
  } catch {
    return hostname();
  }
}

export const maxDuration = 120;

/** Pulls a live scan from process-analyzer and stores it. Returns 503 rather
 *  than throwing when the analyzer is not running, so the UI can say so. */
export const POST = handler("scan", async () => {
  const me = await currentActor();
  if (!me) return fail(401, "Sign in to ingest a scan.");
  const scan = await fetchScan();

  if (!scan || !Array.isArray(scan.processes))
    return fail(503, "process-analyzer is not reachable. Start it on port 3000 and try again.");

  const host = scannedHost();
  const row = await db.scan.create({
    data: {
      host,
      processes: JSON.stringify(scan.processes),
      total: scan.processes.length,
      // the analyzer's timestamp is third-party input; an unparseable one used
      // to reach Prisma as Invalid Date and 500 the ingest
      scannedAt: parsedDate(scan.timestamp),
    },
  });

  await logEvent({
    action: "Endpoint scan ingested",
    detail: `${host} · ${scan.processes.length} processes · ${scan.stats?.thirdParty ?? "?"} third-party`,
    actor: "process-analyzer",
    authority: "catalog-gate@1.0",
  });

  return NextResponse.json({ ok: true, id: row.id, host, total: scan.processes.length });
});

function parsedDate(value: string | undefined): Date {
  if (!value) return new Date();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
