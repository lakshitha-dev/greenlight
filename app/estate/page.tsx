import Link from "next/link";
import { db } from "@/lib/db";
import { reconcile, syncPolicy, type EstateRow } from "@/lib/estate";
import { isUp, PA_URL, type ProcessRecord } from "@/lib/sources/analyzer";
import { Panel, Callout } from "@/components/ui";
import { expect, isArray } from "@/lib/json";
import { PullScanButton, SyncPolicyButton, RaiseButton } from "@/components/EstateActions";

export const dynamic = "force-dynamic";

export default async function EstatePage() {
  const [scan, catalog, requests, up] = await Promise.all([
    db.scan.findFirst({ orderBy: { scannedAt: "desc" } }),
    db.catalogEntry.findMany(),
    db.request.findMany({ include: { decision: true } }),
    isUp(),
  ]);

  const policy = await syncPolicy(catalog, requests, { dryRun: true });

  if (!scan) {
    return (
      <>
        <Header up={up} />
        <Panel title="No scan yet">
          <p style={{ fontSize: 13.2, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
            GreenLight knows what was approved. It does not yet know what is running.
            {up
              ? " process-analyzer is reachable — pull a scan to find out."
              : ` Start process-analyzer on ${PA_URL} and pull a scan.`}
          </p>
          <PullScanButton />
        </Panel>
      </>
    );
  }

  const processes = expect<ProcessRecord[]>(scan.processes, isArray, []);
  const estate = reconcile(processes, catalog, requests);

  return (
    <>
      <Header up={up} scannedAt={scan.scannedAt} host={scan.host} />

      <div className="routing" style={{ marginBottom: 20 }}>
        <div className="rtop">
          <h2>Approved against running</h2>
          <p>
            {estate.scanned.toLocaleString()} processes on {scan.host}, {estate.thirdParty}{" "}
            third-party after native Windows and Microsoft components are filtered out. Neither list
            is interesting alone — the gap between them is.
          </p>
        </div>
        <div className="tiers">
          <Tier n={estate.approved.length} cls="t0" title="Running and approved">
            Matched to a catalog entry that still holds. Nothing to do.
          </Tier>
          <Tier n={estate.shadow.length} cls="t2" title="Running, not approved">
            No catalog entry, or the entry has lapsed. Nobody cleared these.
          </Tier>
          <Tier n={estate.flagged.length} cls="t1" title="Flagged by the analyzer">
            Scored Suspicious or Malicious, cross-referenced with approval status.
          </Tier>
        </div>
      </div>

      {(estate.systemNoise > 0 || estate.unclassified > 0) && (
        <div style={{ marginBottom: 20 }}>
          <Callout tone={estate.unclassified > 0 ? "warn" : "info"}>
            <b>
              {estate.systemNoise} driver and vendor utilities set aside
              {estate.unclassified > 0 && `, ${estate.unclassified} could not be placed`}.
            </b>{" "}
            {estate.unclassified > 0 ? (
              <>
                Windows will not reveal a process&apos;s location to an unprivileged caller, so
                where those came from cannot be established. <b>Run process-analyzer as
                Administrator</b> and they resolve. Until then they are reported as unknown — never
                as unapproved, because absent evidence is not evidence.
              </>
            ) : (
              <>Listing IntelAudioService.exe as software nobody approved is noise, not a finding.</>
            )}
          </Callout>
        </div>
      )}

      {estate.flagged.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <Panel title="Flagged and unapproved" eyebrow="the intersection worth looking at">
            {estate.flagged.map((r) => (
              <Row key={r.key} r={r} />
            ))}
          </Panel>
        </div>
      )}

      <div className="split">
        <div className="stack">
          <Panel title="Shadow IT" eyebrow={`${estate.shadow.length} running without approval`}>
            {estate.shadow.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Nothing third-party is running that the catalog does not cover.
              </p>
            ) : (
              estate.shadow.map((r) => <Row key={r.key} r={r} />)
            )}
          </Panel>

          <Panel title="Running and approved" eyebrow={`${estate.approved.length} matched`}>
            {estate.approved.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                No approved software was seen running in this scan.
              </p>
            ) : (
              estate.approved.map((r) => <Row key={r.key} r={r} />)
            )}
          </Panel>
        </div>

        <div className="stack">
          <Panel title="Policy pushed to endpoints" eyebrow="catalog → process-analyzer">
            <div className="kv">
              <span className="k">Permitted</span>
              <span className="v mono">{policy.whitelisted.length}</span>
            </div>
            <div className="kv">
              <span className="k">Denied</span>
              <span className="v mono">{policy.blacklisted.length}</span>
            </div>
            <div className="kv">
              <span className="k">Withheld</span>
              <span className="v mono">{policy.skipped.length}</span>
            </div>

            {policy.skipped.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  Withheld, and why
                </div>
                {policy.skipped.map((s) => (
                  <div key={s.name} style={{ fontSize: 12.2, color: "var(--muted)", marginBottom: 6 }}>
                    <b style={{ color: "var(--ink)" }}>{s.name}</b> — {s.why}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <SyncPolicyButton />
            </div>
          </Panel>

          {estate.unused.length > 0 && (
            <Panel title="Approved but never seen" eyebrow="licence spend worth checking">
              {estate.unused.map(({ entry, reason }) => (
                <div className="check" key={entry.id}>
                  <span className="mark m-miss">?</span>
                  <div>
                    <div className="lbl">{entry.name}</div>
                    <div className="why">
                      {reason} {entry.cost}
                    </div>
                  </div>
                </div>
              ))}
            </Panel>
          )}

          {estate.webOnly.length > 0 && (
            <Callout tone="info">
              <b>
                {estate.webOnly.map((c) => c.name).join(", ")}{" "}
                {estate.webOnly.length === 1 ? "is" : "are"} web-only.
              </b>{" "}
              Software that runs in a browser tab has no process, so an endpoint scan can never see
              it. That is a real limit of this approach, not a gap in the data — browser-based SaaS
              needs a different control.
            </Callout>
          )}

          <Callout tone="ok">
            <b>The decision reaches the machine.</b> Reject something and its process lands on the
            deny list. Let a catalog entry lapse and it drops off the allow list by itself — the
            same rule that re-escalates a request also stops permitting the software.
          </Callout>
        </div>
      </div>
    </>
  );
}

function Header({ up, scannedAt, host }: { up: boolean; scannedAt?: Date; host?: string }) {
  return (
    <div className="topbar">
      <div>
        <h1>Endpoint estate</h1>
        <div className="sub">
          {scannedAt
            ? `Last scan of ${host} at ${scannedAt.toISOString().replace("T", " ").slice(0, 19)}`
            : "What the catalog permits, against what is actually running."}
        </div>
      </div>
      <div className="actions" style={{ alignItems: "center" }}>
        <span className={`pill ${up ? "p-ok" : "p-mute"}`}>
          {up ? "process-analyzer connected" : "process-analyzer offline"}
        </span>
        <PullScanButton />
      </div>
    </div>
  );
}

function Tier({
  n,
  cls,
  title,
  children,
}: {
  n: number;
  cls: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`tier ${cls}`}>
      <span className="bar" />
      <div>
        <div className="n">{n}</div>
        <div className="tl">{title}</div>
        <div className="td">{children}</div>
      </div>
    </div>
  );
}

function Row({ r }: { r: EstateRow }) {
  const mark =
    r.bucket === "approved"
      ? ["m-pass", "✓"]
      : r.bucket === "flagged"
        ? ["m-fail", "!"]
        : ["m-miss", "?"];

  return (
    <div className="check">
      <span className={`mark ${mark[0]}`}>{mark[1]}</span>
      <div>
        <div className="lbl">
          <span className="mono">{r.name}</span>
          {r.instances > 1 && (
            <span className="ent" style={{ marginLeft: 8 }}>
              ×{r.instances}
            </span>
          )}
          {r.worstThreat !== "Safe" && (
            <span
              className={`pill ${r.worstThreat === "Malicious" ? "p-crit" : "p-warn"}`}
              style={{ marginLeft: 8 }}
            >
              {r.worstThreat}
            </span>
          )}
        </div>
        <div className="why">
          {r.publisher ? `${r.publisher} · ` : "Unsigned · "}
          {r.note}
          {r.reasons.length > 0 && (
            <div style={{ marginTop: 4, color: "var(--faint)", fontSize: 11.5 }}>
              {r.reasons.join(" · ")}
            </div>
          )}
        </div>
      </div>
      {r.bucket !== "approved" && !r.entry && (
        <RaiseButton processName={r.name} publisher={r.publisher} />
      )}
      {r.entry && (
        <Link href="/catalog" className="ent">
          {r.entry.name}
        </Link>
      )}
    </div>
  );
}

