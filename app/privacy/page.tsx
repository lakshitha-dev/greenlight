import Link from "next/link";
import { db } from "@/lib/db";
import { screen, risks, worst } from "@/lib/dpia";
import { Callout } from "@/components/ui";
import type { Fact } from "@/lib/sources/http";
import { expect, isObject } from "@/lib/json";

export const dynamic = "force-dynamic";

const tone = (b: string) => (b === "High" ? "p-crit" : b === "Medium" ? "p-warn" : "p-ok");

export default async function PrivacyPage() {
  const reqs = await db.request.findMany({
    where: { kind: "software" },
    include: { dossier: true },
    orderBy: { receivedAt: "desc" },
  });

  const rows = reqs.map((r) => {
    const sc = screen(r);
    const facts = expect<Record<string, Fact<unknown>>>(r.dossier?.facts, isObject, {});
    const rs = sc.required && r.dossier ? risks(r, facts) : [];
    return { r, sc, rs, band: rs.length ? worst(rs) : null };
  });

  const required = rows.filter((x) => x.sc.required).length;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Privacy assessments</h1>
          <div className="sub">
            Screened automatically against the regime that applies to the requesting entity. A DPIA is
            drafted only when an Article 35(3) trigger is actually met — {required} of {rows.length}{" "}
            here.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Software</th>
                <th>Entity &amp; regime</th>
                <th>Subjects</th>
                <th>Triggers</th>
                <th>Residual risk</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, sc, rs, band }) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.product}</b>
                    <div style={{ fontSize: "11.5px", color: "var(--faint)", marginTop: 2 }}>
                      {r.id} · {r.team}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {r.entity}
                    <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
                      {sc.regime}
                    </div>
                  </td>
                  <td className="mono">
                    {r.personalData
                      ? r.subjectCount
                        ? r.subjectCount.toLocaleString()
                        : "unbounded"
                      : "—"}
                  </td>
                  <td>
                    {sc.required ? (
                      sc.triggers.map((t, i) => (
                        <span
                          key={i}
                          className="ent"
                          style={{ margin: "0 4px 4px 0", display: "inline-block" }}
                        >
                          {t.id}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: "var(--faint)", fontSize: 12 }}>none met</span>
                    )}
                  </td>
                  <td>
                    {!sc.required ? (
                      <span className="pill p-mute">Not required</span>
                    ) : band ? (
                      <span className={`pill ${tone(band)}`}>{band}</span>
                    ) : (
                      <span className="pill p-mute">Awaiting research</span>
                    )}
                  </td>
                  <td>
                    {sc.required && rs.length > 0 && (
                      <Link href={`/dpia/${r.id}`} className="btn sm">
                        Open
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Callout tone="info">
          <b>Same screening, different answers.</b> FortiClient needs no assessment and Notion does —
          because the Australian entity keeps its data onshore and the Sri Lankan one does not. The
          regime follows the entity, which is why this cannot be one global rule.
        </Callout>
      </div>
    </>
  );
}
