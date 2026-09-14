import Link from "next/link";
import { db } from "@/lib/db";
import { routeRequest, type Route } from "@/lib/catalog";
import { VERDICT, type Outcome } from "@/lib/rulepack";
import type { Request, CatalogEntry, Decision } from "@prisma/client";

export const dynamic = "force-dynamic";

function age(from: Date): { text: string; overdue: boolean } {
  const s = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000));
  if (s < 60) return { text: `${s}s`, overdue: false };
  if (s < 3600) return { text: `${Math.floor(s / 60)}m`, overdue: false };
  if (s < 86400) return { text: `${Math.floor(s / 3600)}h`, overdue: false };
  const d = Math.floor(s / 86400);
  return { text: `${d}d ${Math.floor((s % 86400) / 3600)}h`, overdue: d >= 2 };
}

type Row = Request & { decision: Decision | null; dossier: { id: string } | null };

export default async function Queue() {
  const [reqs, catalog] = await Promise.all([
    db.request.findMany({
      include: { decision: true, dossier: { select: { id: true } } },
      orderBy: { receivedAt: "desc" },
    }),
    db.catalogEntry.findMany(),
  ]);

  const routed = reqs.map((r) => ({
    r: r as Row,
    rt:
      r.kind === "iso"
        ? ({ tier: 2, cause: "absent", label: "ISO document", note: "" } as Route)
        : routeRequest(r.product, r.entity, catalog as CatalogEntry[]),
  }));

  const t0 = routed.filter((x) => x.rt.tier === 0);
  const t1 = routed.filter((x) => x.rt.tier === 1);
  const t2 = routed.filter((x) => x.rt.tier === 2);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Request queue</h1>
          <div className="sub">
            {reqs.length} requests arrived today. {t0.length + t1.length} were settled before anyone
            read them.
          </div>
        </div>
        <div className="actions">
          <Link href="/intake" className="btn sm">
            Paste a request
          </Link>
        </div>
      </div>

      <div className="routing">
        <div className="rtop">
          <h2>Catalog gate</h2>
          <p>
            Every request is checked against the software catalog first. Only what the catalog cannot
            settle reaches the Head of Operations.
          </p>
        </div>
        <div className="tiers">
          <Tier n={t0.length} cls="t0" title="Self-service">
            In catalog, assessment current, seats free. Provisioned in seconds. No approver.
          </Tier>
          <Tier n={t1.length} cls="t1" title="Spend decision only">
            Security already settled. Only the seat purchase is open — routed to the budget owner,
            not Ops.
          </Tier>
          <Tier n={t2.length} cls="t2" title="Full review">
            Not in catalog, or the entry no longer holds. These need Sajith.
          </Tier>
        </div>
      </div>

      <div className="queue">
        {t0.length > 0 && <div className="qgroup">Resolved without an approver</div>}
        {t0.map((x) => (
          <QueueRow key={x.r.id} {...x} />
        ))}
        {t1.length > 0 && <div className="qgroup">Routed to the budget owner</div>}
        {t1.map((x) => (
          <QueueRow key={x.r.id} {...x} />
        ))}
        {t2.length > 0 && <div className="qgroup">Waiting on the Head of Operations</div>}
        {t2.map((x) => (
          <QueueRow key={x.r.id} {...x} />
        ))}
      </div>

      <div style={{ marginTop: 16 }} className="callout ok">
        <span>◆</span>
        <div>
          <b>Every approval shrinks the next queue.</b> When Sajith approves something new it enters
          the catalog — and every future request for it self-serves. The decision he makes today is
          one he never makes again.
        </div>
      </div>
    </>
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

function QueueRow({ r, rt }: { r: Row; rt: Route }) {
  const a = age(r.receivedAt);
  let sev = "warn";
  let pill = <span className="pill p-mute">Awaiting research</span>;

  if (rt.tier === 0) {
    sev = "ok";
    pill = <span className="pill p-ok">Provisioned · {a.text}</span>;
  } else if (rt.tier === 1) {
    sev = "info";
    pill = <span className="pill p-info">Budget owner · {rt.entry?.owner}</span>;
  } else if (r.kind === "iso") {
    sev = "crit";
    pill = <span className="pill p-crit">Returned — 2 gaps</span>;
  } else if (r.decision) {
    const o = r.decision.outcome as Outcome;
    sev = o === "REJECT" ? "crit" : o === "APPROVE" ? "ok" : o === "CONDITIONS" ? "warn" : "info";
    pill = <span className={`pill p-${sev}`}>{VERDICT[o].t}</span>;
  } else if (r.dossier) {
    pill = <span className="pill p-info">Researched — awaiting decision</span>;
    sev = "info";
  } else if (rt.cause === "stale") {
    pill = <span className="pill p-warn">Re-escalated</span>;
  }

  return (
    <Link href={`/request/${r.id}`} className={`qrow sev-${sev}`}>
      <div>
        <div className="qsub">{r.subject}</div>
        <div className="qmeta">
          <span className="mono">{r.id}</span> · {r.requester} · {r.team}
        </div>
      </div>
      <div>
        <span className="ent">{r.entity}</span>
      </div>
      <div>{pill}</div>
      <div className="qage">
        {a.overdue ? (
          <>
            <b>{a.text}</b>
            <span style={{ fontSize: "10.5px" }}>past SLA</span>
          </>
        ) : (
          a.text
        )}
      </div>
    </Link>
  );
}
