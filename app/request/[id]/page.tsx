import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { routeRequest, type Route } from "@/lib/catalog";
import { packFor, evaluate, VERDICT, blockersOf, isOverride, type Outcome, type Check } from "@/lib/rulepack";
import { FACT_ROWS, displayValue, PROV_LABEL } from "@/lib/research";
import { screen, risks, worst } from "@/lib/dpia";
import { ResearchButton, DecideButtons, AckButton } from "@/components/Actions";
import { Panel, KV, Mark, Prov } from "@/components/ui";
import { ClaudeResearch } from "@/components/ClaudeResearch";
import { researchPrompt } from "@/lib/findings";
import type { Gap } from "@/lib/email";
import { hasKey } from "@/lib/research";
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

  if (r.kind === "iso") return <IsoView r={r} dossier={r.dossier} />;

  const rt = routeRequest(r.product, r.entity, catalog);
  if (rt.tier === 0) return <SelfService r={r} rt={rt} />;
  if (rt.tier === 1) return <SpendOnly r={r} rt={rt} />;
  return <FullReview r={r} rt={rt} dossier={r.dossier} decision={r.decision} />;
}

/* ── shared chrome ───────────────────────────────────────────────────────── */

function Head({ r, right }: { r: Req; right?: React.ReactNode }) {
  return (
    <>
      <div className="reqhead">
        <div>
          <h1>{r.subject}</h1>
          <div className="reqmeta">
            <span className="mono">{r.id}</span>
            <span>·</span>
            {r.requester} · {r.team}
            <span className="ent">{r.entity || "entity not established"}</span>
            {r.seats ? <span className="ent">{r.seats} seats</span> : null}
          </div>
        </div>
        <div className="actions">{right}</div>
      </div>
      <EmailOrigin r={r} />
    </>
  );
}

/** An emailed request shows the message it came from, and what the message did
 *  not say.
 *
 *  Both halves matter. The original is kept verbatim so an approver can check
 *  the reading against the words — extraction is a convenience, not a source of
 *  truth. And a gap is shown as the question it is, with the reply already
 *  written, because the alternative to asking is guessing. */
function EmailOrigin({ r }: { r: Req }) {
  if (r.source !== "email") return null;
  const gaps = expect<Gap[]>(r.gaps, isArray, []);

  return (
    <>
      <Panel
        title="How this arrived"
        eyebrow={gaps.length ? `${gaps.length} question${gaps.length > 1 ? "s" : ""} unanswered` : "read in full"}
      >
        <KV k="From" v={<span className="mono">{r.emailFrom ?? "—"}</span>} />
        {r.emailReceivedAt && <KV k="Sent" v={r.emailReceivedAt} />}
        {r.rawEmail && (
          <div className="email" style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>
            {r.rawEmail}
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14, lineHeight: 1.6 }}>
          Kept as written. The requester is taken from the sender, never from the
          message — anyone can type anyone&rsquo;s name in a body.
        </p>
      </Panel>

      {gaps.length > 0 && (
        <Panel title="What the email does not say" eyebrow="ask before deciding">
          {gaps.map((g) => (
            <KV key={g.field} k={g.label} v={g.why} />
          ))}
          {r.draftReply && (
            <>
              <div
                className="email"
                style={{ marginTop: 16, whiteSpace: "pre-wrap", fontSize: 12.8 }}
              >
                {r.draftReply}
              </div>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
                Drafted, not sent. GreenLight does not email colleagues by itself,
                for the same reason it does not approve anything by itself.
              </p>
            </>
          )}
        </Panel>
      )}
    </>
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
                  <Mark status="pass" />
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
                  <p>What the requester saw, moments after sending the request.</p>
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
                the answer is still good. Asking it again would have cost the requester three days and
                the Head of Operations four minutes, and changed nothing.
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
                <Mark status="pass" />
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
                <Mark status="miss" label="Open question" />
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
                <b>Today both questions land on the Head of Operations.</b> Only one of them is his.
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
  /** A human decision that disagrees with the engine — the engine's reasoning
   *  does not transfer to it. */
  const overridden = isOverride(decision?.outcome, ev?.outcome);
  /** Named, next to the verdict that rests on them. These were previously three
   *  scroll-lengths away, behind a severity pill at the right edge of each row. */
  const blockers = ev ? blockersOf(ev.checks) : [];

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
              <h2 className="vt">
                {VERDICT[shown].t}
                {decision ? " — decided by the Head of Operations" : " — recommended"}
              </h2>
              {/** VERDICT[].w explains why the *engine* reached an outcome. Once a
                *  person has overridden the engine it no longer explains anything,
                *  so it is not shown: a reject that reads "a blocking requirement
                *  failed against a verified source" when none did is a fabricated
                *  justification printed under a named person, on the page an
                *  auditor reads. Say what the engine said, separately and as its
                *  own claim. */}
              {overridden ? (
                <div className="vw">
                  Recorded against the person who made it. GreenLight recommended{" "}
                  <b>{VERDICT[ev.outcome].t}</b> — this decision departs from that, and the
                  reasoning belongs in the audit trail rather than here.
                </div>
              ) : (
                <div className="vw">{VERDICT[shown].w}</div>
              )}
              {!decision && blockers.length > 0 && (
                <ul className="vblock">
                  {blockers.map((c) => (
                    <li key={c.id}>
                      <span className="rid mono">{c.id}</span>
                      <span>
                        {c.label} — {c.status === "fail" ? "fails" : "cannot be evaluated"}. {c.why}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {!decision && blockers.length === 0 && ev.checks.some((c) => c.severity === "blocking") && (
                <div className="vblock none">No blocking requirement is unmet.</div>
              )}
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
              <b>{r.product} is now in the catalog.</b> The next person who asks for it self-serves, and
              the Head of Operations will not see this request again.
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
              <Panel title="Findings" eyebrow="solid stands alone · dashed does not">
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
                          <Prov prov={f.prov} label={PROV_LABEL[f.prov]} />
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

            {!hasKey() && (
              <Panel
                title="Compliance research in Claude"
                eyebrow="software-compliance-research"
              >
                <p style={{ fontSize: "13.2px", color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 14 }}>
                  Vulnerabilities and privacy grades come from structured sources
                  automatically. Whether a vendor has a SOC 2 report, a DPA or a
                  published sub-processor list has no public API — that evidence
                  lives on trust centres as prose, so a person researches it in
                  Claude and brings it back.
                </p>
                <ClaudeResearch
                  requestId={r.id}
                  prompt={researchPrompt(r.product ?? "", r.vendor, r.seats)}
                />
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
  return (
    <div className={`check ${c.status === "off" ? "off" : ""}`}>
      <Mark status={c.status} />
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
          <Mark status="pass" />
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
          <Mark status="miss" label="Assessment trigger" />
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

/** The reply names exactly the requirements that failed, in the words the
 *  engine produced — so what the requester is told and what the audit trail
 *  records cannot drift apart. */
function draftReply(blocked: Check[], all: Check[]): string {
  const passed = all.filter((c) => c.status === "pass").map((c) => c.label.toLowerCase());
  return [
    "Dear colleague,",
    "",
    "Thank you for submitting the Asset Management Procedure v4. Before I can sign",
    `off, ${blocked.length === 1 ? "one item is" : `${blocked.length} items are`} required under our document approval standard:`,
    "",
    ...blocked.map((b) => `  • ${b.label} (${b.id}) — ${b.why}`),
    "",
    passed.length ? `The ${passed.join(", ")} are all in order.` : "",
    "",
    "Regards,",
    "the Head of Operations",
  ]
    .filter((line, i, a) => !(line === "" && a[i - 1] === ""))
    .join("\n");
}

function IsoView({
  r,
  dossier,
}: {
  r: Req;
  dossier: { facts: string } | null;
}) {
  /** Identical engine, identical provenance rules — the only difference is
   *  which YAML file governs, and that is a field in the pack. */
  const pack = packFor(r.entity, "document");
  const facts = expect<Record<string, Fact<unknown>>>(dossier?.facts, isObject, {});
  const ev = evaluate(facts, pack);
  const blocked = ev.checks.filter((c) => c.severity === "blocking" && c.status === "fail");
  return (
    <>
      <Back />
      <div className="stack">
        <Head r={r} />
        <div className="verdict v-MORE_INFO">
          <div>
            <div className="vt">Returned to requester</div>
            <div className="vw">
              {blocked.length} blocking {blocked.length === 1 ? "requirement is" : "requirements are"}{" "}
              unmet. This was detected seconds after the email arrived — not three days later.
            </div>
            <div className="vsrc">
              {pack.id}@{pack.version} · {r.entity} · evaluated {ev.live.length} of{" "}
              {pack.requirements.length} requirements
            </div>
          </div>
          <AckButton label="Send reply" done="Reply sent" />
        </div>
        <div className="split">
          <Panel title="The request">
            <div className="email">{r.body}</div>
          </Panel>
          <div className="stack">
            <Panel title="Rule pack check" eyebrow={`${pack.id}@${pack.version}`}>
              {ev.checks.map((c) => (
                <CheckRow key={c.id} c={c} />
              ))}
            </Panel>
            <Panel title="Drafted reply" eyebrow="human presses send">
              <div className="email">{draftReply(blocked, ev.checks)}</div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
