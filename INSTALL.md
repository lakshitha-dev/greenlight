# GreenLight — installation and usage

Everything needed to go from the ZIP to a running app, sign in, and work a
request end to end. Written for someone who has not seen the repository before.

Contents:

1. [What you need](#1-what-you-need)
2. [Install and run locally](#2-install-and-run-locally)
3. [Configuration](#3-configuration)
4. [Using it](#4-using-it)
5. [Using Claude without an API key](#5-using-claude-without-an-api-key)
6. [Connecting Outlook](#6-connecting-outlook)
7. [Verifying the install](#7-verifying-the-install)
8. [Deploying](#8-deploying)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. What you need

| | |
|---|---|
| **Node.js 22 or later** | CI runs on Node 22 (`.github/workflows/ci.yml`). Node 24 also works — that is what this repository is developed on. `npm` ships with it. |
| **A PostgreSQL database** | The schema targets Postgres (`prisma/schema.prisma`). A free [Neon](https://neon.tech) project is what the project was built against and what the connection strings in `.env.example` are shaped for. Any Postgres will do, but Neon gives you the pooled and direct URLs the schema expects. |
| **A browser** | Nothing else. |

**No Anthropic API key is required.** GreenLight runs without one. The four
security sources (CISA KEV, NIST NVD, ToSDR, OSV.dev) are free and keyless, and
the compliance half is designed to be run by a person in Claude on an ordinary
subscription and pasted back — see [section 5](#5-using-claude-without-an-api-key).
Without any Claude credential the app still works; compliance fields are
recorded as **not found**, which routes most new software to *More information
required* rather than guessing.

**Optional:** [process-analyzer](https://github.com/AnuV6/process-analyzer)
running locally on port 3000, if you want to demonstrate the endpoint estate
page. It is a separate repository and is not required for anything else.

---

## 2. Install and run locally

From the unzipped folder:

```bash
npm install
```

Installs dependencies. It does **not** generate the Prisma client — that
happens in `npm run setup`.

```bash
cp .env.example .env
```

Then open `.env` and fill in the three required values: `DATABASE_URL`,
`DIRECT_DATABASE_URL` and `AUTH_SECRET`. See
[section 3](#3-configuration) for what each one is and where to get it. The app
refuses to start with an empty or malformed `DATABASE_URL` and names the
variable in the error (`lib/env.ts`), rather than 500-ing on every route.

Generate `AUTH_SECRET` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

```bash
npm run setup
```

Three steps in one: `prisma generate` (builds the typed client — nothing
typechecks or runs without it), `prisma migrate deploy` (applies the three
migrations in `prisma/migrations/`, including `add_email_intake`), and
`npm run seed`. Migrations go over `DIRECT_DATABASE_URL`, because Prisma
migrations cannot run through a connection pooler.

```bash
npm run dev
```

Starts Next.js on **http://localhost:3001**.

> **Why 3001 and not 3000.** `process-analyzer` hardcodes port 3000 with no
> `PORT` fallback, and that repository is not ours to change. GreenLight
> therefore takes 3001, in dev (`next dev -p 3001`) and in production
> (`next start -p 3001`). If you are demonstrating the estate page, start
> process-analyzer first so it gets 3000, then GreenLight.

### Signing in

The seed creates three accounts (`prisma/seed.ts`). The password is
`greenlight` for all of them.

| Email | Role | Can do |
|---|---|---|
| `support@bistec.example` | Requester | Raise requests, run research, paste findings |
| `ops@bistec.example` | Approver | All of the above, **plus decide** |
| `admin@bistec.example` | Administrator | Everything |

The roles are enforced, not decorative: a requester pressing **Approve** gets a
403 that names their role (`app/api/decide/route.ts`). Start with
`ops@bistec.example` if you want to see a decision made.

The sign-in page shows the demo accounts only when `NODE_ENV` is not
`production`.

### Resetting the data

```bash
npm run seed
```

Deletes and rewrites the demo data — catalog entries, requests, audit events
and the three users. Safe to run as often as you like; it is the way to get
back to a clean state between demonstrations. Note that Slack's catalog review
date is seeded as *today*, so the lapsed-entry behaviour is correct on whatever
day you run it.

---

## 3. Configuration

All configuration is environment variables in `.env` (local) or the host's
environment (deployed). `.env` is git-ignored and must never be committed.

| Variable | Required? | What it does | How to obtain it |
|---|---|---|---|
| `DATABASE_URL` | **Required** | The **pooled** Postgres connection the application uses at runtime. Validated at boot; must be a `postgres://` or `postgresql://` URL. | Neon dashboard → connection string with `-pooler` in the host. CLI: `neonctl connection-string --project-id <id> --pooled` |
| `DIRECT_DATABASE_URL` | **Required in practice** | The **direct** (unpooled) Postgres connection. Used only by `prisma migrate`, which cannot run through a pooler. Not fatal at runtime if absent, but `npm run setup` will fail without it. | Neon dashboard → connection string **without** `-pooler`. CLI: `neonctl connection-string --project-id <id>` |
| `AUTH_SECRET` | **Required** | Signs the NextAuth session cookie. | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` — use a **different** value in each environment. |
| `PROCESS_ANALYZER_URL` | Optional | Where GreenLight looks for process-analyzer, for the endpoint estate page and policy push. Defaults to `http://localhost:3000`. Validated as a URL at boot. | Leave as the default unless the analyzer runs elsewhere. |
| `ANTHROPIC_API_KEY` | Optional | Turns on the automatic synthesis layer: compliance research (SOC 2, ISO 27001, DPA, sub-processors, residency, SSO tier, pricing) and automatic reading of inbound emails. Without it, both steps become paste-back flows. | <https://console.anthropic.com/settings/keys>. **Not needed** — see [section 5](#5-using-claude-without-an-api-key). |
| `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` | Optional | Alternative route to Claude through Vercel AI Gateway. On Vercel the OIDC token is supplied by the platform, so there is no key to manage. A direct `ANTHROPIC_API_KEY` takes precedence. | Set automatically by Vercel; otherwise from the Vercel AI Gateway dashboard. |
| `NVD_API_KEY` | Optional | Raises the NIST NVD rate limit from 5 to 50 requests per 30 seconds. The NVD source works without it, just more slowly. | <https://nvd.nist.gov/developers/request-an-api-key> |
| `INTAKE_TOKEN` | Optional (**required for the Power Automate route**) | Shared secret accepted in an `x-greenlight-token` header on `POST /api/intake/email`, because a Power Automate flow cannot hold a session. **Must be at least 16 characters.** Below that the endpoint fails closed and accepts nothing — an unset or short secret would otherwise let an empty header match an empty secret and publish an open intake endpoint. Compared in constant time (`lib/intake-token.ts`). A short value also fails environment validation at boot. | `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"` |
| `INTAKE_ALLOWED_DOMAINS` | Optional | Comma-separated list of sender domains that may become requests. Defaults to `bistecglobal.com`. Sub-domains are accepted (`mail.bistecglobal.com`), look-alikes are not (`notbistecglobal.com`). Only the address inside angle brackets is trusted — a display name is attacker-controlled text. | Set to your own mail domain(s), e.g. `INTAKE_ALLOWED_DOMAINS="bistecglobal.com,bistec.lk"` |
| `NEXT_PUBLIC_SITE_URL` | Optional | Base URL used to make OpenGraph image URLs absolute. Defaults to `http://localhost:3001`. | Your deployed origin, e.g. `https://greenlight.vercel.app` |

> **Note on the demo accounts and email intake.** The seeded users are on
> `@bistec.example`, but `INTAKE_ALLOWED_DOMAINS` defaults to
> `bistecglobal.com`. That is deliberate — the sender of an email is checked
> against the allowed domains, not the signed-in user — but it means that if
> you paste a test email `From: someone@bistec.example`, it will be refused as
> "not an internal address". Use a `@bistecglobal.com` sender in your test
> email, or add `bistec.example` to `INTAKE_ALLOWED_DOMAINS`.

---

## 4. Using it

Sign in as `ops@bistec.example` / `greenlight` to see every path including the
decision.

The left rail has seven pages: Request queue, Software catalog, Endpoint
estate, Privacy assessments, Rule packs, Claude skills, Audit trail.

### 4.1 Raising a request with the form

1. **Request queue** → **Paste a request** (`/intake`).
2. Fill in the software, vendor, requester, team, legal entity, seat count and
   a justification. The lower half asks the privacy questions — what personal
   data is involved, whose, how many people, whether it crosses a border, how
   long it is kept.
3. Submit. You land on the request page.

The legal entity matters: it selects which rule pack governs the decision.
`rules/software-approval.bistec-global.yaml` (Sri Lanka, PDPA No. 9 of 2022)
is the software rule book. Packs are keyed by entity, so a second entity
under different law would be another file rather than a code change
requirement the Sri Lankan one does not.

### 4.2 Raising a request by pasting an email

1. **Request queue** → **Log an email** (`/intake/email`).
2. Select the message in Outlook, copy it, and paste it into the large box —
   **including the headers**. The parser wants a `From:` line; `Sent:`/`Date:`
   and `Subject:` are read if present, everything after the first blank line is
   the body.
3. As you type, the panel underneath shows what GreenLight has understood: the
   sender address, and whether that address is internal. If it is not, the page
   says so and names the domains that are allowed. Only the address inside
   angle brackets counts — `"ops@bistecglobal.com" <attacker@evil.com>` is
   refused, because a display name is not identity.
4. If no Claude credential is configured, a **Read it with Claude** panel
   appears with a **Copy prompt** button. See
   [section 5](#5-using-claude-without-an-api-key). Paste the JSON Claude
   returns into the **JSON from Claude** box.
5. Submit. You land on the created request.

The requester is always taken from the sender of the message, never from the
body — anyone can type anyone's name in an email.

The whole preview is computed in the browser by the same pure functions the
server runs on submit (`lib/email.ts`), so what you see is the actual outcome.
The server re-runs all of it regardless; the preview is a courtesy, not a check.

### 4.3 What happens when the email leaves something out

This is the interesting case, and it is worth demonstrating deliberately: paste
an email that does not name the legal entity.

GreenLight records a **gap** rather than a value for any of four fields it
cannot establish — which software, legal entity, team, and what it is for. A
field is a gap when the email does not say, and the legal entity is a gap even
when it could plausibly be *inferred*, because inferring it from a team name or
a timezone picks a rule book, and the wrong rule book produces a confident
verdict under the wrong law.

On the request page you then get two panels:

- **How this arrived** — the sender, when it was sent, and the original message
  kept verbatim, so an approver can check the reading against the words.
- **What the email does not say** — each gap with the reason it is a gap
  ("the email does not say", or "it was inferred rather than stated, and this
  field decides which rules apply"), followed by **a drafted reply**.

The draft is a complete, sendable message — a greeting using the sender's first
name, the questions as bullet points, and a line telling them a reply on the
thread will attach to the same request. It is labelled *Drafted, not sent*.

**GreenLight does not email colleagues by itself**, for the same reason it does
not approve anything by itself. A person reads the draft, adjusts it if they
want, and sends it. The queue shows such a request as *Returned — gaps
outstanding*.

### 4.4 Running compliance research

Open a Tier 2 request (one the catalog gate could not settle) as any signed-in
user.

1. Press **Research this software**. This runs the four keyless sources — CISA
   KEV for what is being actively exploited, NIST NVD for CVE history, ToSDR
   for a privacy grade, OSV.dev across four ecosystems. It takes about a
   second. Each source reports what it found, and an unreachable source reports
   **unavailable**, never *clean*.
2. The compliance half — SOC 2, ISO 27001, DPA, sub-processors, residency, SSO
   tier, pricing — has no public API. If no Claude credential is set you get a
   panel with **Copy research prompt** and **Paste findings**. Copy the prompt,
   run it in Claude with the `software-compliance-research` Skill loaded, and
   paste the JSON back.
3. The paste is validated strictly — it is untrusted input arriving at a
   compliance decision. A field marked `none` becomes **not found**, never a
   silent `false`. A field marked `claimed` still cannot satisfy a blocking
   requirement, however it arrived.
4. The rule pack then derives a verdict, requirement by requirement, and names
   the pack version that produced it.

With `ANTHROPIC_API_KEY` set, step 2 runs automatically and nothing else
changes — the rule pack cannot tell which route produced a fact.

### 4.5 Deciding

As `ops@bistec.example`, a decided request offers four buttons: **Approve**,
**Approve with conditions**, **Request more info**, **Reject**.

A requester pressing any of them gets a 403 naming their role. The decision,
the catalog write and the audit event commit in one transaction or not at all.

On approval the product is written into the catalog, so the next request for it
self-serves and never reaches an approver again.

### 4.6 The catalog and the self-service path

**Software catalog** (`/catalog`) lists what is already owned: seats total and
used, which legal entities the entry covers, approval and next-review dates,
count of actively-exploited vulnerabilities, and the gate verdict.

Every request hits this gate first:

| Tier | Condition | Who decides |
|---|---|---|
| 0 — Self-service | In catalog, entry still valid, approved for that entity, a free seat | Nobody. Provisioned and logged. |
| 1 — Spend only | In catalog and valid, but no free seat | Budget owner. The security question is already answered. |
| 2 — Full review | Not in catalog, or the entry no longer holds | Head of Operations, with a finished dossier. |

An entry re-escalates when its review date lapses, when it drifts out of entity
scope, or when new actively-exploited vulnerabilities appear after approval. In
the seeded data Slack's review date is *today*, so it lapses in front of you;
Microsoft 365 is held back because six new exploited vulnerabilities landed
after it was approved.

### 4.7 The endpoint estate

**Endpoint estate** (`/estate`) reconciles what was approved against what is
actually running, using process-analyzer as the source of reality.

- **Pull a scan** fetches the running process list from
  `PROCESS_ANALYZER_URL`, filters out native Windows and Microsoft components,
  and sorts the rest into: running and approved, running and **not** approved
  (shadow IT), approved but never seen (unused licences), and analyzer-flagged.
- **Sync policy** pushes the allow list (from catalog entries that are
  *currently valid*) and the deny list (from anything rejected) back to the
  analyzer. An entry that lapses drops off the allow list by itself.
- Shadow IT can be raised as a real request in one click, which then routes
  through the catalog gate like any other.

Two honest limits. Software that runs in a browser tab has no process, so an
endpoint scan can never see it — Confluence maps to an empty process list and
the page says so. And if process-analyzer is not running, the page says it is
unreachable and the API answers 503 with an actionable message; it does not
break the page, and this is what you will see on any hosted deployment, because
the analyzer reads a specific machine's processes and cannot be deployed
alongside the app.

---

## 5. Using Claude without an API key

GreenLight needs Claude for one class of question: the things that have no API.
Whether a vendor holds a current SOC 2 report, publishes a DPA, or discloses
its sub-processors lives as prose on trust centres, shaped differently by every
vendor. Reading an inbound email into structured fields is the same kind of
work. There are three routes to it, and **the app is fully usable on the third,
which needs no key at all.**

### Route 1 — automatic, with a credential

Set `ANTHROPIC_API_KEY` in `.env` (or deploy behind Vercel AI Gateway, where
the platform's OIDC token is used and there is no key to manage). Compliance
research and email extraction then run by themselves. The paste-back panels
disappear because there is nothing to paste.

### Route 2 — MCP, from Claude Code or Claude Desktop

Claude does the carrying itself, over an MCP server that runs against your
local database.

```bash
npm run mcp
```

The repository ships both configurations:

- **Claude Code** — `.mcp.json` at the repository root is already correct.
  Open the folder in Claude Code and the `greenlight` server is available.
- **Claude Desktop** — copy the contents of
  `mcp/claude_desktop_config.example.json` into your Claude Desktop config,
  adjusting `cwd` to wherever you unzipped the repository.

Four tools: `list_requests_needing_evidence`, `get_request`,
`run_security_sources`, `record_findings`. Then ask Claude to work the queue.

**There is deliberately no tool that approves anything.** Every MCP write lands
in the audit trail attributed to `Claude (MCP)`, so who gathered evidence and
who decided on it stay separable. A DPA recorded as `claimed` over MCP is
refused exactly as it would be in the UI.

### Route 3 — the paste-back Skill (no key, works on a subscription)

**This is the live route for this entry.** The account backing this project has
a Claude subscription, not an API key — and an OAuth token issued for the
Claude Code CLI is not accepted for application use. So GreenLight is built so
that the absence of a key costs you a copy and a paste, not a feature.

Two Skills ship in `skills/`, and both are also browsable and downloadable in
the app at **Claude skills** (`/skill`):

| Skill | Used for | Where you paste the result |
|---|---|---|
| `software-compliance-research` | SOC 2, ISO 27001, DPA, sub-processors, residency, SSO tier, price | The **Paste findings** box on a request |
| `email-request-triage` | Reading an emailed request into product, vendor, seats, team, entity, purpose, personal-data flags | The **JSON from Claude** box on `/intake/email` |

**Loading a Skill in Claude Code:** the `skills/` directory is in the
repository, so opening this folder in Claude Code makes both Skills available.
Ask for them by name.

**Loading a Skill in Claude Desktop or claude.ai:** go to `/skill` in the
running app, press **Download SKILL.md** for the one you want, and upload it as
a Skill in Claude's settings. Alternatively paste the contents of
`skills/<name>/SKILL.md` into the conversation before the prompt.

**Then, for each request:**

1. In GreenLight, press **Copy research prompt** (on a request) or **Copy
   prompt** (on `/intake/email`). If the clipboard is blocked, the prompt is
   shown on the page under *Show the prompt* — copy it by hand.
2. Paste it into Claude with the Skill loaded.
3. Copy the JSON object Claude returns and paste it back into GreenLight.

Both Skills return strict JSON that GreenLight validates and will reject if the
shape is wrong, with a message saying which field is wrong. Both carry the same
discipline: every field arrives with a provenance, and a field that could not
be established is marked `none` rather than guessed. The audit trail records
who did the research.

### Checking which route you are on

```bash
npm run check:ai
```

Reports which credential it found (`ANTHROPIC_API_KEY`, Vercel AI Gateway,
`ANTHROPIC_AUTH_TOKEN`, or nothing), makes one tiny real API call, and says
whether the API accepted it. It never prints the credential, so the output is
safe to paste.

With no credential it exits 1 and explains what that means — which is not a
failure, just route 3.

---

## 6. Connecting Outlook

A software request at BISTEC arrives as an email. There are two ways to get it
into GreenLight, and they reach the same endpoint and are handled identically —
they differ only in how the caller proves itself.

### 6.a The paste route — works for everyone, no licence needed

1. Open the email in Outlook.
2. Select all (Ctrl+A) and copy (Ctrl+C), making sure the `From:` /
   `Sent:` / `Subject:` header lines are included.
3. Go to `/intake/email` in GreenLight and paste.
4. Follow [section 4.2](#42-raising-a-request-by-pasting-an-email).

Nothing to configure, no licence, no admin involvement. `INTAKE_TOKEN` is not
needed for this route — you are signed in, and that is the proof.

This is the route that always works, and it is the fallback if anything in
6.b is unavailable.

### 6.b The automated route via Power Automate

> **Read this before starting.** The Power Automate action required here —
> **HTTP** — is a **premium connector**. It is not included in the
> Microsoft 365 seeded Power Automate licence that most BISTEC staff have, and
> requires a Power Automate Premium (per-user or per-flow) licence. **It may
> not be available on a standard BISTEC licence.** If it is not, the flow
> cannot be built as described, and the paste route in 6.a is the fallback that
> needs nothing at all. There is no way around this from inside GreenLight;
> the constraint is on the Power Platform side.

#### Step 1 — an Outlook rule to file the mail

In Outlook, create a folder (for example `Software Requests`) and a rule that
moves matching mail into it. Match on whatever your organisation actually uses —
a recipient alias such as `software-requests@bistecglobal.com`, or a subject
keyword. The rule exists so the flow has a narrow trigger and does not fire on
the whole inbox.

#### Step 2 — configure GreenLight

Set a shared secret in the environment (locally in `.env`, on Vercel in project
settings):

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

```
INTAKE_TOKEN=<the generated value>
INTAKE_ALLOWED_DOMAINS="bistecglobal.com"
```

**The token must be at least 16 characters.** Below that the endpoint fails
closed and rejects every caller, and the app reports the problem at boot. This
is deliberate: without a floor, an unconfigured deployment would treat an empty
header as matching an empty secret and publish an open intake endpoint.

GreenLight must also be reachable from Microsoft's cloud, so the automated
route needs the deployed URL, not `localhost`.

#### Step 3 — the flow

In Power Automate, create an **Automated cloud flow**:

1. **Trigger:** *Office 365 Outlook — When a new email arrives in a folder
   (V3)*. Set **Folder** to the folder from step 1. Set **Include
   Attachments** to No.
2. **Action:** *HTTP* (premium).
   - **Method:** `POST`
   - **URI:** `https://<your-deployment>/api/intake/email`
   - **Headers:**
     - `Content-Type`: `application/json`
     - `x-greenlight-token`: the `INTAKE_TOKEN` value
   - **Body:**

     ```json
     {
       "email": {
         "from": "@{triggerOutputs()?['body/from']}",
         "subject": "@{triggerOutputs()?['body/subject']}",
         "body": "@{triggerOutputs()?['body/bodyPreview']}",
         "receivedAt": "@{triggerOutputs()?['body/receivedDateTime']}",
         "conversationId": "@{triggerOutputs()?['body/conversationId']}",
         "messageId": "@{triggerOutputs()?['body/id']}"
       }
     }
     ```

     In the designer you can pick each of these from the dynamic content
     panel rather than typing the expressions. Use the plain-text body field;
     `body/body` is HTML when the message is, and the extraction reads better
     from text.

3. Save and send yourself a test email into the folder.

Store the token in the flow as a secure input, or reference it from Azure Key
Vault, rather than leaving it in plain text in the flow definition.

#### What the endpoint does with it

- `from` is parsed for the address inside angle brackets, and checked against
  `INTAKE_ALLOWED_DOMAINS`. A non-internal sender is refused with 403 and no
  request is created.
- `conversationId` is the dedupe key. A reply on a thread that has already
  become a request is attached to that request as an audit event — it does not
  create a second one. Without this, an eight-message thread becomes eight
  requests, which is the failure every naive mailbox integration ships with.
- With a credential set, Claude reads the email automatically. Without one,
  the request is still created with the message intact and every field a gap,
  and a person runs the Skill afterwards. Losing the request would be the worse
  failure: a gap is visible, a dropped email is not.
- The response is `201` with `{ ok, requestId, gaps }`.

Note that a pasted email carries no thread id, so the paste route does not
dedupe. That is intentional — falling back to the subject line would collapse
unrelated requests that happen to share one.

#### Testing the endpoint with curl

Without the header, and with no session cookie:

```bash
curl -i -X POST http://localhost:3001/api/intake/email \
  -H "Content-Type: application/json" \
  -d '{"email":{"from":"Nimal Perera <nimal@bistecglobal.com>","subject":"Figma licences","body":"Hi, can we get Figma for the design team? About 5 of us."}}'
```

```
HTTP/1.1 401 Unauthorized
{"error":"Sign in, or send a valid x-greenlight-token header."}
```

With the header:

```bash
curl -i -X POST http://localhost:3001/api/intake/email \
  -H "Content-Type: application/json" \
  -H "x-greenlight-token: $INTAKE_TOKEN" \
  -d '{"email":{"from":"Nimal Perera <nimal@bistecglobal.com>","subject":"Figma licences","body":"Hi, can we get Figma for the design team? About 5 of us.","conversationId":"test-thread-001"}}'
```

```
HTTP/1.1 201 Created
{"ok":true,"requestId":"SR-1051","gaps":["entity"]}
```

Two other responses worth knowing:

- **403** if the sender's domain is not in `INTAKE_ALLOWED_DOMAINS` — try
  `from` of `someone@gmail.com` to see it.
- **200** with `"duplicate":true` if you POST the same `conversationId` twice.
  The second call attaches to the first request instead of creating a new one.

A short or unset `INTAKE_TOKEN` gives 401 for every value of the header,
including the correct one. That is the fail-closed behaviour, not a bug.

---

## 7. Verifying the install

```bash
npm run verify
```

Runs, in order: `tsc --noEmit` (typecheck), `vitest run` (the suite), and
`prisma generate && next build` (a production build). If all three pass, the
install is sound.

```bash
npm test
```

The suite alone. **264 tests across 15 files**, in about two seconds.

> The `README.md` claims 202 tests. That figure is stale — the observed count
> on this repository is 264. Trust the number the runner prints.

The suite never touches the network: every outbound call is mocked, so a CISA
outage or an NVD rate limit cannot turn it red. It needs no database and no
secrets, which is why CI can run it with placeholder environment values.

```bash
npm run test:coverage
```

Coverage report, if you want it.

```bash
npm run walkthrough
```

Takes one seeded request (`SR-1043` by default — pass another id as an
argument) and prints the whole loop on real data, using the same functions the
app uses: what arrived, the catalog gate's tier decision, the live security
sources, the compliance step, the rule-pack evaluation requirement by
requirement, the privacy screening, the decision point, the policy sync, and
the last five audit events.

This one **does** need a working `DATABASE_URL` and seeded data, and it does
hit the live security sources, so it takes a few seconds and needs an internet
connection. It is the fastest way to satisfy yourself that the parts fit
together.

Other scripts in `package.json`: `npm run start` (production server on 3001,
after a build), `npm run db:migrate` (`prisma migrate deploy`), `npm run db:push`
(`prisma migrate dev` — see [troubleshooting](#9-troubleshooting)),
`npm run brand` (regenerates brand assets; not needed to run the app).

---

## 8. Deploying

Full detail is in `DEPLOY.md`. Condensed:

### Vercel, from the dashboard

1. <https://vercel.com/new> → import the repository.
2. Framework preset **Next.js**, detected automatically. **Leave the build
   command alone.** `package.json` already sets `build` to
   `prisma generate && next build`, which Vercel needs because the Prisma
   client is generated rather than committed.
3. Add the environment variables. The three required ones:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the **pooled** Neon string (host contains `-pooler`) |
   | `DIRECT_DATABASE_URL` | the **direct** Neon string (no `-pooler`) |
   | `AUTH_SECRET` | a **freshly generated** value, not the local one |

   Add `INTAKE_TOKEN` and `INTAKE_ALLOWED_DOMAINS` too if you are wiring up
   Power Automate, and `NEXT_PUBLIC_SITE_URL` if you want correct OpenGraph
   images.

4. Deploy. The database is already migrated and seeded, so the first page load
   has data in it.

### Or from the CLI

```bash
vercel login          # opens a browser — this is the step that needs you
vercel link
vercel env add DATABASE_URL production
vercel env add DIRECT_DATABASE_URL production
vercel env add AUTH_SECRET production
vercel --prod
```

### Before you present

- **Warm it once.** Neon's free tier suspends an idle database and the first
  request after that pays a cold start. Load a page a minute before you begin.
- **`AUTH_SECRET` must differ between environments.** Reusing the local value
  in production means a session cookie minted on your laptop is valid on the
  public site.
- **The demo accounts still exist** with a shared password. The panel that
  advertises them is hidden when `NODE_ENV=production`, but the accounts
  themselves remain in the database. Remove them before this is anything but a
  demonstration.
- **The endpoint estate will show as unreachable** on any hosted deployment.
  process-analyzer reads a specific machine's processes and cannot be deployed
  alongside the app. This is correct behaviour, not a fault — run the analyzer
  locally when you want to demonstrate that half.

---

## 9. Troubleshooting

**`EPERM: operation not permitted, rename … query_engine-windows.dll.node` on Windows**

A running process is holding the Prisma query engine DLL, so `prisma generate`
cannot replace it. The usual culprits are a dev server left running, an MCP
server started with `npm run mcp`, or an editor-hosted MCP connection.

```powershell
Get-Process node | Stop-Process -Force
```

Then re-run the command. Stop the dev server and any MCP server **before**
`npm run setup`, `npm run build`, `npm run verify` or `npm run db:migrate` —
all of them run `prisma generate` or need the client. This is the single most
common failure on this repository.

**Something is already on port 3001, or the app is not where you expect**

GreenLight is on **3001**, not 3000. Port 3000 belongs to process-analyzer,
which hardcodes it. If 3001 is taken, find the holder with
`netstat -ano | findstr :3001` and stop it; changing the port means editing the
`dev` and `start` scripts and `PROCESS_ANALYZER_URL` expectations, so prefer
freeing 3001.

**`prisma migrate dev` hangs or fails with a TTY error**

`npm run db:push` maps to `prisma migrate dev`, which is interactive — it
prompts for a migration name and for confirmation before resetting. It needs a
real terminal and will not work in a non-interactive shell, a CI job, or a
background task. For applying existing migrations use the non-interactive
`npm run db:migrate` (`prisma migrate deploy`), which is what `npm run setup`
already does. Only use `db:push` when you are authoring a new migration, and
run it in a normal terminal.

**The first request after an idle period is slow, or times out**

Neon's free tier suspends an idle database. The first query wakes it and pays
several seconds of cold start. Load any page once and the next requests are
normal. If you are about to demonstrate, warm it a minute beforehand.

**Every route 500s and the error names an environment variable**

`lib/env.ts` validates the environment at boot and fails once, loudly, naming
the problem, rather than letting a wrong `DATABASE_URL` surface as an opaque
digest on every route. Read the message — it tells you exactly which variable
is wrong and why.

**Email intake refuses a test email as "not an internal address"**

The sender's domain is not in `INTAKE_ALLOWED_DOMAINS`, which defaults to
`bistecglobal.com`. Note that the seeded demo users are on `@bistec.example`,
which is **not** an allowed domain by default. Either use a
`@bistecglobal.com` sender in your test email, or add the domain to the
variable. Remember only the address inside angle brackets is examined; the
display name is ignored.

**The Power Automate HTTP action is greyed out or asks for an upgrade**

That is the premium-connector licensing limit described in
[section 6.b](#6b-the-automated-route-via-power-automate). Use the paste route
instead — it needs no licence and produces the same request.

**`/api/intake/email` returns 401 even with the right token**

`INTAKE_TOKEN` is unset or shorter than 16 characters, in which case the
endpoint rejects every caller by design. Check the boot output — environment
validation reports a short token by name and length.

**The paste-back panels have disappeared but Claude is not actually working**

The app shows the automatic path whenever it finds any credential, including
`ANTHROPIC_AUTH_TOKEN`. That variable is set by the Claude Code CLI for a
personal subscription and is **not** accepted for application use, so the app
believes it has a credential while every call is refused. Run
`npm run check:ai` — it reports exactly this case and says so. Unset
`ANTHROPIC_AUTH_TOKEN` in the shell you run the app from to get the paste-back
route back.

**The estate page says process-analyzer is unreachable**

Expected unless process-analyzer is running on `PROCESS_ANALYZER_URL`
(`http://localhost:3000` by default). The API answers 503 with an actionable
message and the page stays usable. Start the analyzer first if you want that
half of the demonstration.

**`npm install` succeeded but nothing typechecks**

The Prisma client is generated, not committed. Run `npx prisma generate`, or
just `npm run setup`.
