import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { routeRequest, type Route } from "@/lib/catalog";
import { packFor, evaluate, VERDICT, type Outcome, type Check } from "@/lib/rulepack";
import { FACT_ROWS, displayValue, PROV_LABEL } from "@/lib/research";
import { screen, risks, worst } from "@/lib/dpia";
import { ResearchButton, DecideButtons, AckButton } from "@/components/Actions";
import { Panel, KV } from "@/components/ui";
import type { Fact, Step } from "@/lib/sources/http";
import { expect, isArray, isObject } from "@/lib/json";
import type { Request as Req } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r, catalog] = await Promise.all([
    db.request.findUnique({ where: { id }, include: { dossier: true, decision: true } }),
    db.catalogEntry.findMany(),
  ]);
  if (!r) notFound();

  if (r.kind === "iso") return <IsoView r={r} />;

  const rt = routeRequest(r.product, r.entity, catalog);
  if (rt.tier === 0) return <SelfService r={r} rt={rt} />;
  if (rt.tier === 1) return <SpendOnly r={r} rt={rt} />;
  return <FullReview r={r} rt={rt} dossier={r.dossier} decision={r.decision} />;
}

/* ── shared chrome ───────────────────────────────────────────────────────── */

function Head({ r, right }: { r: Req; right?: React.ReactNode }) {
  return (
    <div className="reqhead">
      <div>
        <h1>{r.subject}</h1>
        <div className="reqmeta">
          <span className="mono">{r.id}</span>
          <span>·</span>
          {r.requester} · {r.team}
          <span className="ent">{r.entity}</span>
          {r.seats ? <span className="ent">{r.seats} seats</span> : null}
        </div>
      </div>
      <div className="actions">{right}</div>
    </div>
  );
}

const Back = () => (
  <Link href="/" className="backlink">
    ← Request queue
  </Link>
);

/* ── tier 0 ──────────────────────────────────────────────────────────────── */

function SelfService({ r, rt }: { r: Req; rt: Route }) {
  const c = rt.entry!;
  const first = r.requester.split(" ")[0];
  const checks: [string, string, string][] = [
    ["C1", "Product is in the software catalog", `${c.name} · approved ${c.approved} · owner ${c.owner}`],
    ["C2", "Assessment still current", `Next review ${c.review}. No new actively-exploited vulnerabilities since approval.`],
    ["C3", "Approved for this entity", `${r.entity} is in scope for this catalog entry.`],
    ["C4", "Seat available in the existing pool", `${rt.free} of ${c.seats} seats unassigned — no new spend.`],
  ];

  return (
    <>
      <Back />
      <div className="stack">
        <Head r={r} right={<span className="pill p-ok">Tier 0 · no approver required</span>} />
        <div className="split">
          <div className="stack">
            <Panel title="The request">
              <div className="email">{r.body}</div>
            </Panel>
            <Panel title="Why no one was asked" eyebrow="catalog-gate@1.0">
              {checks.map(([id, label, why]) => (
                <div className="check" key={id}>
                  <span className="mark m-pass">✓</span>
                  <div>
                    <div className="lbl">
                      <span className="rid">{id}</span>
                      {label}
                    </div>
                    <div className="why">{why}</div>
                  </div>
                </div>
              ))}
            </Panel>
          </div>

          <div className="stack">
            <div className="receipt">
              <div className="rhead">
                <span className="tick">✓</span>
                <div>
                  <h2>Access granted</h2>
                  <p>What {first} saw, moments after sending the request.</p>
                </div>
              </div>
              <div className="rbody">
                <KV k="Software" v={c.name} />
                <KV k="Licence" v={`From the existing ${c.name} pool`} />
                <KV k="Internal owner" v={c.owner} />
                <KV k="Additional cost" v="None" />
                <KV k="Approval required" v={<span style={{ color: "var(--signal)" }}>None</span>} />
              </div>
            </div>
            <div className="callout ok">
              <span>◆</span>
              <div>
                <b>We already have this.</b> The security question was answered on {c.approved} and
                the answer is still good. Asking it again would have cost {first} three days and
                Sajith four minutes, and changed nothing.
              </div>
            </div>
            <div className="callout info">
              <span>◆</span>
              <div>
                <b>Automatic does not mean unrecorded.</b> This provisioning is in the audit trail
                with the catalog version that authorised it — the evidence an ISO auditor asks for.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── tier 1 ──────────────────────────────────────────────────────────────── */

function SpendOnly({ r, rt }: { r: Req; rt: Route }) {
  const c = rt.entry!;
  return (
    <>
      <Back />
      <div className="stack">
        <Head r={r} right={<span className="pill p-info">Tier 1 · spend decision only</span>} />
        <div className="verdict v-MORE_INFO">
          <div>
            <div className="vt">Routed to {c.owner}</div>
            <div className="vw">
              {rt.note} This never needed the Head of Operations — it is a purchase, not a security
              question.
            </div>
            <div className="vsrc">
              catalog-gate@1.0 · {c.name} · assessment current to {c.review}
            </div>
          </div>
        </div>
        <div className="split">
          <Panel title="The request">
            <div className="email">{r.body}</div>
          </Panel>
          <div className="stack">
            <Panel title="Two questions, two owners" eyebrow="the unbundling">
              <div className="check">
                <span className="mark m-pass">✓</span>
                <div>
                  <div className="lbl">Is this software safe to use?</div>
                  <div className="why">
                    <b style={{ color: "var(--signal)" }}>Already answered</b> — assessed{" "}
                    {c.approved}, current to {c.review}. Nothing to re-review.
                  </div>
                </div>
                <span className="pill p-ok">settled</span>
              </div>
              <div className="check">
                <span className="mark m-miss">?</span>
                <div>
                  <div className="lbl">Will we spend money on another seat?</div>
                  <div className="why">
                    All {c.seats} seats assigned. A new seat costs money, so it needs the budget
                    owner — <b>{c.owner}</b>.
                  </div>
                </div>
                <span className="pill p-info">open</span>
              </div>
            </Panel>
            <Panel title="Catalog position">
              <KV k="Seats" v={`${c.used} / ${c.seats} assigned`} mono />
              <KV k="Current spend" v={c.cost} mono />
              <KV k="Internal owner" v={c.owner} />
              <KV k="Next review" v={c.review} mono />
            </Panel>
            <div className="callout info">
              <span>◆</span>
              <div>
                <b>Today both questions land on Sajith.</b> Only one of them is his.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── tier 2 ──────────────────────────────────────────────────────────────── */

function FullReview({
  r,
  rt,
  dossier,
  decision,
}: {
  r: Req;
  rt: Route;
  dossier: { facts: string; sources: string; model: string | null; elapsedMs: number | null } | null;
  decision: { outcome: string } | null;
}) {
  const pack = packFor(r.entity);
  const facts = expect<Record<string, Fact<unknown>>>(dossier?.facts, isObject, {});
  const steps = expect<Step[]>(dossier?.sources, isArray, []);
  const ev = dossier ? evaluate(facts, pack) : null;
  const shown = (decision?.outcome ?? ev?.outcome) as Outcome | undefined;
  const verified = Object.values(facts).filter((f) => f.prov === "verified").length;

  return (
    <>
      <Back />
      <div className="stack">
        <Head
          r={r}
          right={
            dossier ? (
              <span className="pill p-ok">
                Research complete · {steps.length} sources · {((dossier.elapsedMs ?? 0) / 1000).toFixed(1)}s
              </span>
            ) : (
              <ResearchButton requestId={r.id} />
            )
          }
        />

        {rt.cause === "stale" ? (
          <div className="callout">
            <span>◆</span>
            <div>
              <b>
                {r.product} is in the catalog — and that was not enough.
              </b>{" "}
              {rt.fails?.join(" ")} A catalog that never expires is just an allowlist, so this one
              does.
            </div>
          </div>
        ) : (
          <div className="callout info">
            <span>◆</span>
            <div>
              <b>Not in the catalog.</b> No prior assessment exists, so this is the expensive path —
              and the one worth spending attention on.
            </div>
          </div>
        )}

        {ev && shown && (
          <div className={`verdict v-${shown}`}>
            <div>
              <div className="vt">
                {VERDICT[shown].t}
                {decision ? " — decided by Sajith" : " — recommended"}
              </div>
              <div className="vw">{VERDICT[shown].w}</div>
              <div className="vsrc">
                {pack.id}@{pack.version} · {pack.entity} · evaluated {ev.live.length} of{" "}
                {pack.requirements.length} requirements · {verified} facts independently verified
              </div>
            </div>
            {decision ? (
              <span className="pill p-ok">Decision recorded · audit trail updated</span>
            ) : (
              <DecideButtons requestId={r.id} />
            )}
          </div>
        )}

        {decision && ["APPROVE", "CONDITIONS"].includes(decision.outcome) && (
          <div className="callout ok">
            <span>◆</span>
            <div>
              <b>{r.product} is now in the catalog.</b> The next person who asks for it self-serves.
              Sajith will not see this request again.
            </div>
          </div>
        )}

        <div className="split">
          <div className="stack">
            <Panel title="The request">
              <div className="email">{r.body}</div>
            </Panel>
            <Panel
              title="Research"
              eyebrow={dossier ? `${verified} facts verified against structured sources` : undefined}
            >
              {steps.length ? (
                steps.map((s, i) => (
                  <div className={`rstep ${s.kind}`} key={i}>
                    <span className="ico">{s.kind === "hit" ? "!" : s.kind === "miss" ? "?" : "✓"}</span>
                    <div>
                      <div className="src">
                        {s.source}
                        {s.ms ? (
                          <span className="mono" style={{ color: "var(--faint)", fontSize: 11, marginLeft: 8 }}>
                            {s.ms}ms
                          </span>
                        ) : null}
                      </div>
                      <div className="res">
                        {s.result}
                        {s.url ? (
                          <>
                            {" "}
                            <a href={s.url} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                              source
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0" }}>
                  A support engineer spends two to three hours on this. Press{" "}
                  <b>Research this software</b> to run it against CISA KEV, NIST NVD, ToSDR and
                  OSV.dev — live, right now.
                </p>
              )}
            </Panel>
          </div>

          <div className="stack">
            {dossier && (
              <Panel title="Findings" eyebrow="every field carries its provenance">
                <div className="facts">
                  {FACT_ROWS.map(([k, label]) => {
                    const f = facts[k];
                    if (!f) return null;
                    const none = f.value === null || f.prov === "none";
                    return (
                      <div className="fact" key={k}>
                        <div className="k">
                          {label}
                          {f.src && (
                            <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
                              {f.src}
                            </div>
                          )}
                        </div>
                        <div className={`v ${none ? "na" : ""}`}>
                          {displayValue(k, f)}
                          <span className={`prov pv-${f.prov === "claimed" ? "claimed" : f.prov}`}>
                            {PROV_LABEL[f.prov]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {ev && (
              <Panel title="Rule pack check" eyebrow={`${pack.id}@${pack.version}`}>
                {ev.checks.map((c) => (
                  <CheckRow key={c.id} c={c} />
                ))}
              </Panel>
            )}

            {ev?.outcome === "CONDITIONS" && (
              <Panel title="Conditions on approval" eyebrow="derived from failed warnings">
                <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 7, fontSize: "13.2px", color: "var(--ink-2)" }}>
                  {ev.warns.map((w) => (
                    <li key={w.id}>
                      <b>{w.id}</b> — {w.breach ?? `${w.label}. ${w.why}`}
                    </li>
                  ))}
                </ol>
              </Panel>
            )}

            {dossier && <DpiaPanel r={r} facts={facts} />}
          </div>
        </div>
      </div>
    </>
  );
}

function CheckRow({ c }: { c: Check }) {
  const m =
    c.status === "pass"
      ? ["m-pass", "✓"]
      : c.status === "fail"
        ? ["m-fail", "✕"]
        : c.status === "miss"
          ? ["m-miss", "?"]
          : ["m-off", "–"];
  return (
    <div className={`check ${c.status === "off" ? "off" : ""}`}>
      <span className={`mark ${m[0]}`}>{m[1]}</span>
      <div>
        <div className="lbl">
          <span className="rid">{c.id}</span>
          {c.label}
        </div>
        <div className="why">
          {c.why}
          {c.status !== "pass" && c.status !== "off" && c.breach ? (
            <b style={{ color: "var(--warn)" }}> {c.breach}</b>
          ) : null}
        </div>
      </div>
      <span className={`pill ${c.severity === "blocking" ? "p-crit" : c.severity === "warning" ? "p-warn" : "p-mute"}`}>
        {c.severity}
      </span>
    </div>
  );
}

function DpiaPanel({ r, facts }: { r: Req; facts: Record<string, Fact<unknown>> }) {
  const sc = screen(r);
  if (!sc.required)
    return (
      <Panel title="Privacy screening" eyebrow={sc.packVersion}>
        <div className="check">
          <span className="mark m-pass">✓</span>
          <div>
            <div className="lbl">No impact assessment required</div>
            <div className="why">
              {sc.note} Screened against {sc.regime}.
            </div>
          </div>
        </div>
      </Panel>
    );

  const rs = risks(r, facts);
  const w = worst(rs);
  return (
    <Panel title="Privacy screening" eyebrow={sc.packVersion}>
      {sc.triggers.map((t, i) => (
        <div className="check" key={i}>
          <span className="mark m-miss">!</span>
          <div>
            <div className="lbl">
              <span className="rid">{t.id}</span>
              {t.label}
            </div>
            <div className="why">{t.authority}</div>
          </div>
        </div>
      ))}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--line-soft)",
        }}
      >
        <div>
          <div style={{ fontSize: "13.2px", fontWeight: 600 }}>Impact assessment required</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {rs.length} risks identified · residual <b>{w}</b>
          </div>
        </div>
        <Link href={`/dpia/${r.id}`} className="btn sm">
          Open DPIA
        </Link>
      </div>
    </Panel>
  );
}

/* ── ISO ─────────────────────────────────────────────────────────────────── */

const ISO_CHECKS = [
  { id: "R1", label: "Business justification stated", status: "fail", severity: "blocking", why: "No business outcome or driver given for the revision. Required before IT sign-off." },
  { id: "R2", label: "Risk owner named", status: "fail", severity: "blocking", why: "Document lists no accountable owner for the asset register." },
  { id: "R3", label: "ISO clause reference", status: "pass", severity: "warning", why: "Cites ISO 27001 A.5.9 in the header." },
  { id: "R4", label: "Change summary against previous version", status: "pass", severity: "warning", why: "Revision history table present, v3 → v4 deltas listed." },
  { id: "R5", label: "Review date within 12 months", status: "pass", severity: "blocking", why: "Next review 2027-03-01." },
];

function IsoView({ r }: { r: Req }) {
  const blocked = ISO_CHECKS.filter((c) => c.severity === "blocking" && c.status === "fail");
  return (
    <>
      <Back />
      <div className="stack">
        <Head r={r} />
        <div className="verdict v-MORE_INFO">
          <div>
            <div className="vt">Returned to requester</div>
            <div className="vw">
              Two blocking requirements are unmet. This was detected seconds after the email arrived
              — not three days later.
            </div>
            <div className="vsrc">iso-document-approval@1.4 · {r.entity}</div>
          </div>
          <AckButton label="Send reply" done="Reply sent" />
        </div>
        <div className="split">
          <Panel title="The request">
            <div className="email">{r.body}</div>
          </Panel>
          <div className="stack">
            <Panel title="Rule pack check" eyebrow="iso-document-approval@1.4">
              {ISO_CHECKS.map((c) => (
                <div className="check" key={c.id}>
                  <span className={`mark ${c.status === "pass" ? "m-pass" : "m-fail"}`}>
                    {c.status === "pass" ? "✓" : "✕"}
                  </span>
                  <div>
                    <div className="lbl">
                      <span className="rid">{c.id}</span>
                      {c.label}
                    </div>
                    <div className="why">{c.why}</div>
                  </div>
                  <span className={`pill ${c.severity === "blocking" ? "p-crit" : "p-warn"}`}>
                    {c.severity}
                  </span>
                </div>
              ))}
            </Panel>
            <Panel title="Drafted reply" eyebrow="human presses send">
              <div className="email">{`Dear ${r.requester.split(" ")[0]},

Thank you for submitting the Asset Management Procedure v4. Before I can sign off, two items are required under our document approval standard:

  • ${blocked[0].label} (${blocked[0].id}) — please state the business driver for this revision.
  • ${blocked[1].label} (${blocked[1].id}) — the asset register needs a named accountable owner.

The ISO clause reference, revision history and review date are all in order.

Regards,
Sajith`}</div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
