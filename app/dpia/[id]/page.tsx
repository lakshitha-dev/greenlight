import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { screen, risks, worst, categoriesOf, type Band } from "@/lib/dpia";
import { Panel, KV, Callout } from "@/components/ui";
import { AckButton } from "@/components/Actions";
import type { Fact } from "@/lib/sources/http";
import { expect, isObject } from "@/lib/json";

export const dynamic = "force-dynamic";

const tone = (b: Band | string) =>
  b === "High" ? "p-crit" : b === "Medium" ? "p-warn" : "p-ok";

export default async function DpiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db.request.findUnique({ where: { id }, include: { dossier: true } });
  if (!r || !r.dossier) notFound();

  const facts = expect<Record<string, Fact<unknown>>>(r.dossier.facts, isObject, {});
  const sc = screen(r);
  const rs = risks(r, facts);
  const w = worst(rs);
  const cats = categoriesOf(r);
  const fromResearch = ["residency", "subprocessors", "dpa", "soc2", "iso27001", "sso", "privacyGrade"];
  const found = fromResearch.filter((k) => facts[k] && facts[k].prov !== "none").length;

  return (
    <>
      <Link href={`/request/${r.id}`} className="backlink">
        ← {r.subject}
      </Link>

      <div className="stack">
        <div className="reqhead">
          <div>
            <h1>Data Protection Impact Assessment</h1>
            <div className="reqmeta">
              <span className="mono">DPIA-{r.id.split("-")[1]}</span>
              <span>·</span>
              {r.product}
              <span className="ent">{r.entity}</span>
              <span className="ent">{sc.regime}</span>
            </div>
          </div>
          <div className="actions">
            <span className={`pill ${tone(w)}`}>Residual risk · {w}</span>
          </div>
        </div>

        <Callout tone="ok">
          <b>
            {found} of the {fromResearch.length} evidential fields below came from the software
            research.
          </b>{" "}
          Only the processing description was supplied by a person — the rest is evidence GreenLight
          already held, which is why this took seconds rather than a week.
        </Callout>

        <div className="split">
          <div className="stack">
            <Panel title="1 · Description of processing" eyebrow="declared by requester">
              <KV k="Purpose" v={r.purpose ?? "—"} />
              <KV k="Data subjects" v={r.subjects ?? "—"} />
              <KV
                k="Volume"
                v={r.subjectCount ? r.subjectCount.toLocaleString() : "Not bounded"}
                mono
              />
              <KV k="Special category" v={r.specialCat ? "Yes" : "No"} />
              <KV k="Retention" v={r.retention ?? "—"} />
              {cats.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>
                    Categories of data
                  </div>
                  {cats.map((c) => (
                    <span
                      key={c}
                      className="ent"
                      style={{ margin: "0 5px 5px 0", display: "inline-block" }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="2 · Transfers and recipients" eyebrow="from research">
              <KV k="Processor" v={r.vendor ?? "—"} />
              <KV
                k="Data residency"
                v={
                  <>
                    {facts.residency?.value ? String(facts.residency.value) : "Not found"}
                    <span
                      className={`prov pv-${facts.residency?.prov === "claimed" ? "claimed" : facts.residency?.prov ?? "none"}`}
                    >
                      {facts.residency?.prov === "claimed"
                        ? "vendor claim"
                        : facts.residency?.prov === "none" || !facts.residency
                          ? "not found"
                          : facts.residency.prov}
                    </span>
                  </>
                }
              />
              <KV
                k="Sub-processors disclosed"
                v={facts.subprocessors?.value ? "Published" : "Not found"}
              />
              <KV
                k="Transfer mechanism (DPA)"
                v={facts.dpa?.value ? "Executed DPA available" : "None located"}
              />
              <KV
                k="Independent assurance"
                v={facts.soc2?.value ? "SOC 2 Type II" : "Not found"}
              />
              <KV
                k="Privacy grade"
                v={facts.privacyGrade?.value ? String(facts.privacyGrade.value) : "Not rated"}
                mono
              />
            </Panel>

            <Panel title="3 · Necessity and proportionality">
              <p style={{ fontSize: "13.2px", color: "var(--ink-2)", lineHeight: 1.6 }}>
                Processing is limited to {cats.length || "the stated"} categories of data for a
                single stated purpose. No less intrusive alternative was identified in the catalog.
              </p>
            </Panel>
          </div>

          <div className="stack">
            <Panel title="4 · Risk register" eyebrow="likelihood × severity" flush>
              <div className="scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Risk</th>
                      <th>L</th>
                      <th>S</th>
                      <th>Residual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rs.map((x) => (
                      <tr key={x.id}>
                        <td>
                          <b>{x.id}</b> {x.risk}
                          <div style={{ fontSize: "11.5px", color: "var(--faint)", marginTop: 3 }}>
                            Source: {x.source}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 5 }}>
                            <b>Mitigation:</b> {x.mitigation}
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>{x.likelihood}</td>
                        <td style={{ fontSize: 12 }}>{x.severity}</td>
                        <td>
                          <span className={`pill ${tone(x.residual)}`}>{x.residual}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel title="5 · Outcome">
              <KV k="Triggers met" v={sc.triggers.map((t) => t.id).join(", ")} mono />
              <KV k="Highest residual risk" v={<span className={`pill ${tone(w)}`}>{w}</span>} />
              <KV k="Regime" v={sc.regime} />
              <KV
                k="Prior consultation"
                v={w === "High" ? "Required before processing" : "Not required"}
              />
              <KV k="Reviewer" v="Dinusha Weerasinghe · Quality" />
              <div style={{ marginTop: 14 }} className="actions">
                <AckButton
                  label="Send to Quality for sign-off"
                  done="Sent to Quality · Dinusha Weerasinghe"
                />
              </div>
            </Panel>

            {w === "High" && (
              <Callout>
                <b>Residual risk remains High after mitigation.</b> Processing should not begin until
                the outstanding items are closed — and under GDPR Art.36 a transfer at this risk level
                would require prior consultation with the supervisory authority.
              </Callout>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
