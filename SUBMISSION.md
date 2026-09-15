# GreenLight — HeartForge submission

**Approvals that arrive ready to approve.**

| | |
|---|---|
| **Live app** | https://greenlight-umber.vercel.app |
| **Source** | https://github.com/lakshitha-dev/greenlight |
| **Department** | All — every department raises software requests; Operations decides |

Sign in with any seeded account, password `greenlight`:

| Account | Role |
|---|---|
| `ops@bistec.example` | Approver — can decide |
| `support@bistec.example` | Requester — raise and research |
| `admin@bistec.example` | Administrator |

---

## What is in this ZIP

| File | What it is |
|---|---|
| `Presentation-Deck.pptx` | **Presentation deck** — 12 slides, PowerPoint, with speaker notes |
| `Presentation-Deck.html` | The same deck, interactive. Open in a browser, arrow keys to advance |
| `Solution/` | **The solution** — the two Claude Skills, and what the rest of it is |
| `Installation-and-Usage.md` | **Installation & usage instructions** |
| `Test-Cases.md` | **Test cases** — numbered, runnable by hand |
| `Applicable-Departments.md` | **Applicable departments** |
| `Diagrams/` | Architecture and business diagrams (open at app.diagrams.net) |

The running app is at the live URL above and the full source is in the
repository — neither is duplicated here.

## The recurring task it removes

Every software request at BISTEC lands on one desk as an email. Answering it —
is this safe, does the contract allow it, does the law allow it, do we already
pay for it — takes hours per tool, every week.

GreenLight reads the email, checks the catalog first (most requests never need
an approver at all), researches what is left against live security sources plus
Claude, and hands a person a finished dossier. **It never approves anything.**

## Three things worth looking at

1. **A claimed fact cannot satisfy a blocking requirement.** A vendor's word
   about itself is not evidence.
2. **A gap is a finding, never a guess.** Anything that could not be
   established is reported as unknown and routed to a person.
3. **It works without an API key.** A Claude subscription is enough — the
   Skills carry the research and the triage.

## Try it in two minutes

1. Open the live app and sign in as `ops@bistec.example`.
2. Open **SR-1050** (Zoom) — nobody approved it. The catalog already answered.
3. Open **SR-1047** (Canva Pro) — it arrived as an email, and GreenLight has
   written the one question it still needs answered.
4. Open **SR-1042** (ScreenConnect) — four actively-exploited vulnerabilities,
   found live.

Verify it yourself: `npm run verify` — typecheck, 265 tests, production build.
