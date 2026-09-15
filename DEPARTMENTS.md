# Applicable department(s)

GreenLight — HeartForge submission, BISTEC Global.

---

## 1. The short answer

**The label is `All`.** The submission should be named `Lakshitha_All.zip`.

Every department at BISTEC raises software requests, so every department uses the
intake side of GreenLight — but only Operations can record a decision. Naming a
single department would be accurate about the one desk that approves and wrong
about the six other functions the tool serves.

If the organisers intend the field to name the department that would **own and
run** the tool rather than the departments it **applies to**, the answer is
`Ops`. Operations owns the rule packs, holds the approver role, and is the only
function that can turn a request into a decision.

---

## 2. Who GreenLight is for

### First, a distinction the repo forces

GreenLight models two organisational concepts, and neither of them is a
department. Confusing them makes the rest of this document wrong.

- **Legal entity** — `BISTEC Global`. The one entity BISTEC operates as, and a
  required field on every request; the intake dropdown offers it and nothing
  else. It is the key policy is filed under. `packFor(entity, domain)` in
  `lib/rulepack.ts` selects the rule pack, and the `regimes:` map in
  `rules/dpia-screening.yaml` selects the data protection law a privacy
  screening is written against — so the entity determines **which law and which
  requirements apply**. With one entity both lookups resolve to one answer, and
  both fall back rather than fail for an entity they do not know. A second
  entity would be a new pack file, a line in that map and a line in the intake
  list; it would not be a code change. An entity is a jurisdiction, not a place
  on an org chart.
- **Team** — a free-text field recording **who raised** the request.
  `Support Team`, `Delivery`, `Marketing`, `QA`, `IT Infrastructure`, `Quality`
  and `System` appear in the seeded day. It is shown on the queue and the
  request page, and it does exactly one functional thing: on approval it becomes
  the `owner` of the new catalog entry (`app/api/decide/route.ts`), which is
  what the tier 1 budget-owner routing then names. No rule, no route and no
  permission branches on it.
- **Department** — not modelled at all. There is no department table and no
  department-based routing. Access is by role (`requester`, `approver`, `admin`
  — `lib/roles.ts`) and by tier.

So "which department is this for" is not a question the code answers directly.
It has to be answered from who does the work.

### The departments

| Department | What it does today | What changes | Primary or secondary |
|---|---|---|---|
| **Operations** (Head of Operations & IT) | Receives every software request by email, chases the requester for missing information, researches the vendor by hand, and decides. Also handles ISO document approvals. | Most requests never arrive — the catalog gate settles them. The ones that do arrive carry a finished dossier, a verdict citing a named rule-pack version, and an explicit list of what could **not** be established. The decision itself does not move: only the `approver` role can record it, and a requester pressing Approve gets a 403 naming their role. | **Primary — the approver.** The only department that uses the decision side of the product. |
| **IT / Infrastructure** | Knows what was bought; has no reliable picture of what is installed. Shadow IT is found by accident. Endpoint allow and deny lists are maintained by hand, if at all. | `/estate` reconciles the catalog against a live process-analyzer scan into four buckets: approved-and-running, running-and-unapproved, approved-but-never-seen (unused licences), and analyzer-flagged. The allow list is generated from catalog entries that are *currently valid* and pushed to the endpoint agent, so a lapsed entry drops off by itself. Shadow IT can be raised as a real request in one click. | **Primary.** The only department with a page built specifically for it other than the approver's queue. |
| **Quality / Compliance** | Sends ISO documents to IT by email for approval; assembles audit evidence by hand ahead of an internal or external audit. | ISO document approvals run through the same engine as software, against `rules/iso-document-approval.yaml` (v1.4, five requirements, three blocking). Its requirements are *assessed* rather than *measured* — a person reads the document and records an answer against a requirement id — and the same provenance rules apply, so an assessment resting on the submitter's own word cannot satisfy a blocking requirement. Every decision, including automatic provisionings nobody touched, lands in the audit trail with who, when, and which policy version governed it. | **Primary.** Quality owns a rule pack and is the named reviewer on the DPIA page. |
| **Finance** | Approves spend on software after IT has cleared it, usually in the same email thread, usually late. | Tier 1 exists for exactly this: the product is in the catalog, the assessment is current, and the only open question is the purchase. Those requests route to the budget owner and never reach Operations. Delegated authority is a rule (`R6 annualCost lte 500000`, LKR), so an over-threshold request is flagged with the escalation named in the pack. Seat utilisation — 898 seats across five products in the seed — shows what is paid for and never opened. | **Secondary.** Finance decides tier 1, but has no page of its own; the routing is a label on the queue, not a separate workflow. |
| **Legal / Privacy / Data Protection** | DPIAs are written after the fact, if at all. Cross-border transfer questions are settled informally. | `rules/dpia-screening.yaml` screens every request: a DPIA is drafted only when personal data is processed **and** an Article 35(3) trigger fires, so the output discriminates instead of tagging everything. The regime follows the legal entity: `regimes:` maps `BISTEC Global` to PDPA No. 9 of 2022 (Sri Lanka), and an entity with no entry screens under "Applicable data protection law" rather than silently inheriting someone else's. Each risk in the register names the finding that produced it, and severity scales with the data actually handled. | **Secondary.** The capability is built and substantial, but BISTEC has no separate privacy function in the seed — DPIA sign-off is addressed to the Quality Manager. If a data protection owner is appointed, this becomes a primary row. |
| **Delivery / Engineering** | Raises requests by email and waits, without knowing what information the approver needs. | Uses `/intake`, which asks up front for what is otherwise chased: seat count, business reason, and the processing profile (personal data, subject count, categories, purpose, retention, cross-border). Sees the tier and the reasoning on its own request. Three of the eleven seeded requests come from Delivery and QA, one of them raised by email rather than by form. | **Secondary — requester.** |
| **Marketing** | The same as Delivery. Three of the eleven seeded requests are Marketing's — Figma, Notion and an emailed request for Canva Pro — and one of them involves 4,200 marketing contacts. | The same as Delivery. Named separately because it is the clearest case of a non-technical department raising a request that turns out to be a privacy decision rather than an IT one. | **Secondary — requester.** |
| **Support** | Raises requests by email, usually against a client deadline. Two of the eleven seeded requests are Support's. | The same as Delivery. The seeded ScreenConnect request is the sharpest case in the demo: a remote-access tool with actively-exploited vulnerabilities, requested against a live service-desk go-live date. | **Secondary — requester.** |
| **HR** | Nothing. GreenLight does not touch leave, onboarding, performance or any other HR process. | Nothing today. HR would use GreenLight the way Marketing does — as a requester raising software requests — and its requests would tend to be the sensitive ones, because an HR system processes employee personal data. There is no HR domain, no HR rule pack and no HR intake in the product. | **Not a user today**, beyond being a requester like any other department. Section 5 sets out what would be needed, and why it is potential rather than built. |

Two qualifications on that table:

- "Primary" means the department has a screen or a rule pack built for it.
  Operations, IT and Quality do. Finance and Legal are served through rules and
  routing that other people operate.
- Every row except HR is evidenced by something in the repo — a page, a rule
  pack, a seeded request, or a field. HR is the row where the honest answer is
  "not yet".

---

## 3. Why it is not a single-department tool

The asymmetry is the point, and it is worth stating plainly rather than
claiming breadth for its own sake.

**Every department is a requester. One department approves.**

In the seeded working day there are eleven requests raised by six different
teams — Support, Delivery, Marketing, QA, IT Infrastructure and Quality — plus
one raised by the system itself as a scheduled re-review. Two of them arrived
as email and were read into the same fields the form collects. **Not one was
raised by Operations.** Operations appears in the data only as the party that decides.
That is the shape of the problem: requests originate everywhere and converge on
one desk.

This produces two kinds of user with two different benefits, and they should not
be described as though they were the same thing:

- **For the requesting departments**, the benefit is that the request gets
  answered. Three of the eleven never reach the approver at all — two self-serve
  because a licence is free, one goes to the budget owner because only the
  purchase is open. The rest arrive complete, so they do not bounce back asking
  for a business justification.
- **For Operations**, the benefit is the opposite: fewer requests, each arriving
  with the homework already done, and an audit trail that builds itself.

A submission labelled for one department would be right about the authority and
wrong about the usage.

The counter-argument deserves acknowledging. Read carelessly, `All` means "this
is for everyone", which is close to meaningless. That is why the recommendation
is `All` **with this document attached**: the applicability is genuinely
company-wide, and the control is deliberately not.

---

## 4. What each department would need to do to adopt it

Practical, not aspirational. These are the things that are currently seeded,
hardcoded, or assumed.

**Operations**

- Own `rules/*.yaml`. Editing a pack changes company policy for every decision
  made after it — no code change, no deploy — and the version must be bumped on
  every edit, because every verdict cites the version that produced it.
- Agree the thresholds. The shipped values are plausible, not agreed: critical
  CVEs at or below 5, privacy grade C or better, spend within LKR 500,000.
- Confirm the fallback. `packFor` selects a software pack by entity, and an
  entity with no pack of its own inherits the BISTEC Global one through a
  documented fallback in `lib/rulepack.ts`. Nothing reaches that fallback while
  there is one entity, which is exactly why it is worth settling before there
  are two: it decides which law a new entity is judged under on its first day.
  It is a stated policy decision rather than a gap in the code, and it is
  Operations' to confirm or replace.
- Confirm the re-review interval. On approval, a catalog entry is written with a
  review date twelve months out. That interval is hardcoded in
  `app/api/decide/route.ts`; it is not configurable in YAML.
- Hold the approver account. The role is the control.

**IT / Infrastructure**

- Run process-analyzer on the endpoints to be covered, and start it before
  GreenLight — it hardcodes port 3000 with no fallback, which is why GreenLight
  runs on 3001. No changes to that repo are required.
- Populate `processNames` on each catalog entry. This is the join between what
  was approved and what is running, and it is explicit rather than guessed. An
  empty list means web-only and is a deliberate statement; an unreadable one is
  a defect and is reported as one.
- Run the policy sync so the allow and deny lists reach the endpoint agent.
- Triage what the first scan surfaces, and accept the stated limit: software
  that runs in a browser tab has no process, so an endpoint scan can never see
  it. Confluence maps to an empty process list and the UI says so.

**Quality / Compliance**

- Supply the real ISO requirement list. The shipped document pack has five
  requirements; the genuine internal list is Quality's to state.
- Record assessments against requirement ids rather than in email. An assessment
  nobody made is a miss, which routes to a person — it does not quietly pass.
- Decide what the audit evidence pack looks like. The audit trail is a screen
  showing the most recent 200 events. There is **no export** — no CSV, no PDF,
  no date-range filter. For an external audit, that would have to be built.

**Finance**

- Confirm the delegated authority figure and name the escalation signatory.
  R6's breach text escalates to "the entity signatory for BISTEC Global";
  Finance has to say who that is.
- Name the budget owner for each catalog product. Today the `owner` field is
  seeded with a function name (IT Infrastructure, Delivery, Design) and, on a
  new approval, is inherited from the requesting team. That is a reasonable
  default and a poor substitute for a named owner.
- Supply real seat counts and annual costs. The seeded figures are illustrative.

**Legal / Privacy**

- Confirm the regime mapping in `rules/dpia-screening.yaml`. It holds one line
  — `BISTEC Global: PDPA No. 9 of 2022 (Sri Lanka)` — and anything not named
  there screens under "Applicable data protection law", which is deliberately
  not a jurisdiction. Short to confirm today, and the line a second
  jurisdiction would be added to.
- Confirm the Article 35(3) triggers, the large-scale threshold (currently 5,000
  data subjects), and the risk matrix bands.
- Decide who signs a DPIA off. The page currently addresses it to Quality.

**Delivery / Engineering, Marketing, Support, and any other requesting team**

- Use `/intake`, or send the email as before — `/intake/email` and the
  automated endpoint read an emailed request into the same fields the form
  collects, and record what the email did not say as a question rather than
  filling it in.
- Declare the processing profile honestly. The personal-data fields are the only
  DPIA inputs a human must supply; everything else is derived from research the
  tool does itself. A wrong answer here is the one input that can make the
  screening wrong.

**HR**

- Nothing, beyond raising requests like any other department.

**One cross-cutting requirement.** Someone has to hold a Claude credential, or
someone has to run the copy-paste research step by hand. Vulnerabilities and
privacy grades come from free, keyless sources; whether a vendor has a SOC 2
report, a DPA or a published sub-processor list does not. Without that step
every compliance field records as *not found*, and because two of those are
blocking requirements, essentially every new tool lands on *More information
required*. The queue still moves; the decisions do not. That is deliberate — an
absent SOC 2 report and an unverified one must not look the same — but it makes
the credential an adoption prerequisite rather than an optional extra.

---

## 5. Beyond software approval

**What is built:** two approval domains — `software`, whose one pack is
`rules/software-approval.bistec-global.yaml`, and `document`, the ISO pack —
plus a separate privacy screening pack. That is all.

**Why more is plausible.** The engine does not know what it is adjudicating. A
pack declares its `domain`, and requirements come in two kinds: *measured* ones,
which name a field and an operator and are compared against a gathered fact, and
*assessed* ones, which name neither because no comparison settles them — someone
has to read the thing and judge. Both resolve to the same `Fact` type, so the
provenance rules apply identically. `tests/domains.test.ts` evaluates a
leave-approval pack that exists only inside that test file: two requirements, one
blocking, and the same function produces *Approve with conditions* and *More
information required* correctly. No branch anywhere in the codebase knows its
name. That is what makes "adding an approval domain is a YAML file, not code" a
property rather than a slogan.

**What the same engine could plausibly serve.** All of the following are
**potential, not built**. None of them exists in the product today:

- **Leave and absence approval** (HR) — the pack that already exists in the test
  file. Cover arranged, notice period met, entitlement remaining.
- **Capital expenditure or purchase approval above a threshold** (Finance) —
  business case stated, budget line identified, delegated authority respected.
- **Supplier and vendor onboarding** (Legal / Procurement) — contract in place,
  insurance current, screening done.
- **Change and release approval** (Delivery) — rollback plan present, tests
  green, customer notified.
- **Privileged access requests** (IT) — justification recorded, expiry date set,
  approver outside the requesting team.
- **Client deliverable sign-off** (Quality) — the same shape as the ISO pack.

**The honest limit on all of these.** Writing the YAML is the easy part, and it
is genuinely all the *engine* needs. Two things are not free:

1. **Measured requirements need a source for every field.** The software pack
   works because `lib/research.ts` gathers `kevEntries`, `privacyGrade`, `soc2`
   and the rest from named sources, with provenance on each. A finance or
   procurement pack would need an equivalent for its own fields, or its
   requirements would have to be assessed rather than measured. The ISO pack is
   entirely assessed, which is precisely why it needed no new plumbing.
2. **Intake and presentation still branch on kind.** `app/request/[id]/page.tsx`
   branches between the ISO view and the software tiers, and `/intake` collects
   software fields. A third domain would inherit the engine, the provenance
   rules, the audit trail and the verdict logic for nothing, and would still
   need a way to capture its requests and a view to show them.

So the claim worth making is the narrow one. GreenLight is a software approval
console today, built on an approval engine that is not specific to software and
has been tested against a domain it has never seen. Anything past that is a
reasonable next step, and it is not written yet.
