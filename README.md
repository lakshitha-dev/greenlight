# GreenLight

**Approvals that arrive ready to approve.**

An approval console for BISTEC Global. Most software requests are for tools the
company already owns — those never reach an approver. The rest are researched
against live security and privacy sources, checked against versioned rule packs,
privacy-screened, and handed to a person to decide.

GreenLight never approves anything. It makes sure a human can.

---

## Run it

```bash
npm install
cp .env.example .env     # then fill in DATABASE_URL, DIRECT_DATABASE_URL, AUTH_SECRET
npm run setup            # generate client, run migrations, seed
npm run dev              # http://localhost:3001
```

Sign in with one of the seeded accounts — password `greenlight` for all three:

| Account | Role | Can |
|---|---|---|
| `support@bistec.example` | Requester | raise and research |
| `ops@bistec.example` | Approver | **decide** |
| `admin@bistec.example` | Administrator | everything |

The role is not decoration: a requester pressing Approve gets a 403 naming
their role. A decision is the act the audit trail exists to evidence, so it
needs a named person with the authority to make it — every event records who,
when, and which version of policy governed it.

> **Port note.** GreenLight runs on **3001** because `process-analyzer`
> hardcodes 3000 with no `PORT` fallback, and that repo is not ours to change.
> Start process-analyzer first, then GreenLight.

Copy `.env.example` to `.env` first. No API keys are required — the security
sources are free and keyless.

**Optional** — add to `.env` to turn on the synthesis layer:

```
ANTHROPIC_API_KEY=sk-ant-...    # compliance research (SOC 2, DPA, residency, pricing)
NVD_API_KEY=...                 # raises the NIST rate limit; not required
```

Without `ANTHROPIC_API_KEY` the app is fully functional: vulnerability and
privacy data come from the structured sources, and compliance fields are
recorded as **not found** rather than assumed. That routes more requests to
*More information required*, which is the honest answer, not a degraded one.

Reset the demo at any time with `npm run seed`.

---

## Verifying it

```bash
npm run verify     # typecheck, then 186 tests, then a production build
npm test           # the suite alone, ~1s, no network
npm run test:coverage
```

The suite never touches the network. A CISA outage or an NVD rate limit cannot
turn it red, because a test that fails for reasons outside the code teaches you
nothing.

It is weighted toward the business rules rather than toward a coverage number —
`lib/catalog.ts` and `lib/rulepack.ts` are where a bug means a wrong approval.
Three cases are regressions for defects that actually happened:

- every DPIA came out **High** because retention severity was fixed instead of
  scaling with the data handled
- a real laptop scan produced **38 shadow-IT findings** that were all audio and
  graphics drivers
- request IDs were minted from row counts with two different offsets, which
  collide on the primary key past about a hundred rows

Some properties are worth naming because they are what makes the tool
trustworthy rather than merely working:

- an unreachable source reports **unavailable, never clean** — reporting an
  unreachable CISA catalogue as zero vulnerabilities would approve exploited
  software
- a **vendor's own claim cannot satisfy a blocking requirement**
- a **lapsed catalog entry is withheld** from the endpoint allow list
- corrupt stored JSON degrades one row, never a page

---

## The three tiers

Every request hits the catalog gate first.

| Tier | Condition | Who decides |
|---|---|---|
| **0 — Self-service** | In catalog · entry still valid · approved for that entity · seat free | Nobody. Provisioned and logged. |
| **1 — Spend only** | In catalog · valid · **no free seat** | Budget owner. The security question was already answered. |
| **2 — Full review** | Not in catalog, **or** the entry no longer holds | Head of Operations, with a finished dossier. |

A catalog hit is not approval. An entry re-escalates when its review date
lapses, when it drifts out of entity scope, or when new actively-exploited
vulnerabilities appear after it was approved. A catalog that never expires is
just an allowlist.

**The loop closes.** An approval writes the product into the catalog, so the
next request for it self-serves. Every decision made today is one that is never
made again.

---

## Where the facts come from

| Source | Key | What it gives |
|---|---|---|
| **CISA KEV** | none | Vulnerabilities being exploited *right now*. Cached 6h. |
| **NIST NVD** | optional | CVE history, severity-banded, last 24 months. |
| **ToSDR** | none | Human-reviewed privacy grade A–E. |
| **OSV.dev** | none | Open-source advisories, queried across four ecosystems. |
| **Claude** | a subscription, or a key | SOC 2, ISO 27001, DPA, sub-processors, residency, SSO tier, pricing. |

Every field carries its provenance:

- `verified` — from a structured source anyone can re-query
- `sourced` — found on an identifiable page, URL retained
- `claimed` — the vendor asserts it, nothing independent confirms it
- `not found` — could not be established

**`not found` is a finding, not a failure.** A blocking requirement that cannot
be evaluated produces *More information required*, never a guess. And a
`claimed` fact cannot satisfy a blocking requirement — a vendor's word about
itself is not evidence.

---

## Compliance research in Claude

Vulnerabilities and privacy grades come from structured sources automatically.
Whether a vendor has a SOC 2 report, a DPA or a published sub-processor list has
no public API — that evidence lives on trust centres as prose. So a person
researches it in Claude and brings it back:

```
GreenLight                        Claude (your subscription)
Copy research prompt  ──────────▶  skills/software-compliance-research
                                   returns JSON in a fixed shape
Paste findings back   ◀──────────
```

The paste is validated strictly — it is untrusted input arriving at a
compliance decision. A field marked `none` becomes **not found**, never a
silent `false`, because the rule pack treats those differently: not-found asks
for more information, false fails outright. And a `claimed` value still cannot
satisfy a blocking requirement, however it arrived.

The audit trail records who researched it.

Set `ANTHROPIC_API_KEY` (or deploy behind Vercel AI Gateway) and the same step
runs automatically instead. Nothing else changes — the rule pack cannot tell
which path produced a fact, and does not need to.

## Rule packs

Policy lives in `rules/*.yaml`, owned by Operations, not engineering. Editing a
file changes company policy for every decision made after it — no code change,
no deploy. Every verdict names the rule and the pack version that produced it.

```
rules/software-approval.bistec-solutions.yaml   @2.1   PDPA No. 9 of 2022
rules/software-approval.bistec-australia.yaml   @1.3   Privacy Act 1988 + APPs
rules/dpia-screening.yaml                       @1.0
rules/iso-document-approval.yaml                @1.4
```

The Australian pack carries a requirement the Sri Lankan one does not (APP 8
residency). Same software, different entity, different verdict — which is why
this cannot be one global rule.

**The separation is the design:** the model gathers facts and their provenance,
the rule pack derives the verdict, the human approves. No step can overrule the
next.

---

## Privacy screening

A DPIA is drafted only when personal data is processed **and** an Article 35(3)
trigger fires. Generating one for every request would be noise.

When one is required, it is largely a re-reading of evidence the software
research already gathered — residency, sub-processors, DPA, assurance,
privacy grade — which is why it takes seconds rather than a week. Every risk in
the register names the finding that produced it. Severity scales with the data
actually handled, so the rating discriminates instead of reading High every time.

---

## Endpoint estate — process-analyzer integration

GreenLight answers *what did we approve*. [process-analyzer](https://github.com/AnuV6/process-analyzer)
answers *what is actually running*. The gap between the two is shadow IT.

**No changes to that repo are required.** It already exposes everything needed,
so GreenLight is a pure client in both directions:

```
   GreenLight :3001                     process-analyzer :3000

        │ ── POST /api/whitelist ─────────────▶│   policy out
        │    {processName, action}             │
        │ ◀─── GET /api/processes ─────────────│   reality in
        ▼
   reconcile against the catalog
```

**Policy out.** The allow list is generated from catalog entries that are
*currently valid*, the deny list from anything rejected. Because
`loadWhitelist()` is called per request rather than cached at boot, a push
takes effect on the next scan with no restart.

The property worth watching: **an entry that lapses drops off the allow list by
itself.** Slack's entry expires today, so `slack.exe` is withheld until the
re-review is approved. Microsoft 365 is withheld because six new
actively-exploited vulnerabilities appeared after it was approved. The same
rule that re-escalates a request also stops permitting the software.

**Reality in.** A scan is pulled, native Windows and Microsoft noise filtered
out, and what remains sorted into: running-and-approved, running-and-**not**-approved,
approved-but-never-seen (unused licences), and analyzer-flagged cross-referenced
with approval status. Shadow IT can be raised as a real request in one click,
which then routes through the catalog gate and live research like any other.

**The honest limit:** software that runs in a browser tab has no process, so an
endpoint scan can never see it. Confluence maps to an empty process list and the
UI says so. Browser-based SaaS needs a different control — this approach covers
installed software only.

If process-analyzer is not running, `/estate` says so and the API returns 503
with an actionable message. It never breaks the page.

## Layout

```
app/
  page.tsx                 queue + catalog gate
  request/[id]/page.tsx    branches by tier: receipt / spend split / full review
  dpia/[id]/page.tsx       generated assessment
  catalog, rules, privacy, audit, intake
  estate/page.tsx          approved vs running
  api/research, api/decide, api/scan, api/policy/sync, api/estate/raise
lib/
  catalog.ts               the gate
  rulepack.ts              YAML loader + evaluator
  dpia.ts                  screening + risk register
  research.ts              orchestrator
  estate.ts                reconciliation + policy sync
  sources/                 kev · nvd · tosdr · osv · claude · analyzer
rules/                     policy as versioned files
prisma/                    schema + seed
```

`greenlight.html` is the original single-file prototype, kept as an offline
fallback for the demo.

---

## Notes

- `postcss.config.mjs` is deliberately empty. A stray config at `C:\dev`
  belonging to an unrelated project requires Tailwind; without a local file
  Next walks up and inherits it.
- Timings are honest: research runs in about 1 second on the structured
  sources, longer with synthesis enabled.
- Automatic provisioning is written to the audit trail exactly like a human
  decision. That is the part an ISO auditor asks about first.
