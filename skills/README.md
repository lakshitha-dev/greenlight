# The solution

GreenLight is an approval console. It reads a software request, checks whether
the company already owns the tool, researches what is left against live
security sources and Claude, and hands a person a finished dossier.

**It never approves anything.** A decision is the act the audit trail exists to
evidence, so it needs a named person with the authority to make it.

| | |
|---|---|
| **Running app** | https://greenlight-umber.vercel.app |
| **Source code** | https://github.com/lakshitha-dev/greenlight |

Sign in with any of the seeded accounts — password `greenlight`:
`ops@bistec.example` (approver, can decide), `support@bistec.example`
(requester), `admin@bistec.example`.

---

## The two Claude Skills in this folder

These are the part of the solution that runs inside Claude rather than inside
the app, and they are why the whole thing works on an ordinary subscription
with no API key.

| Skill | What it does |
|---|---|
| `software-compliance-research/SKILL.md` | Researches a vendor's SOC 2, ISO 27001, DPA, sub-processor list, data residency, SSO tier and price — the questions that have no public API and live as prose on trust centres. |
| `email-request-triage/SKILL.md` | Reads an emailed request and extracts the fields an approval needs: product, vendor, seats, team, purpose, and whether personal data is involved. |

Both return strict JSON that GreenLight validates before it touches anything.
Both are built around the same rule: **mark what you could not establish as
`none` rather than guessing.** A gap gets asked about by a person; a guess gets
approved.

## How to use one

**In Claude Code** — the skills live in `skills/` in the repository, so Claude
picks them up automatically when you work in that directory.

**In Claude Desktop or claude.ai** — open the `SKILL.md`, copy its contents
into the conversation, then paste the prompt GreenLight gives you. The app
generates that prompt for you:

- *Compliance research* — open any request needing full review and press
  **Copy research prompt**.
- *Email triage* — go to **Log an email**, paste the message, and press
  **Copy prompt**.

Either way, paste the JSON Claude returns back into the box the app shows. It
is validated strictly, because a pasted blob is untrusted input arriving at a
compliance decision.

## The rest of the solution

The app itself — a Next.js application with Postgres, sign-in with roles, a
rule engine reading versioned YAML policy files, privacy screening, an endpoint
estate reconciler, and an MCP server — is in the repository linked above. It is
deployed and running at the live URL; there is nothing to install to try it.

`INSTALL.md` in this ZIP covers running it locally if you would rather.
