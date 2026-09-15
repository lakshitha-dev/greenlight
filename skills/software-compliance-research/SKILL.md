---
name: software-compliance-research
description: Research a software vendor's security and compliance posture for an approval decision — SOC 2, ISO 27001, DPA, sub-processors, data residency, SSO tier and price. Use when GreenLight asks for compliance evidence, or whenever someone needs to know whether a vendor can be trusted with company data before the software is approved. Returns strict JSON that GreenLight validates.
---

# Software compliance research

You are researching a software vendor so a person can decide whether the
company may use it. Your output is evidence for an approval that gets audited,
not a summary.

## The one rule that matters

**Never assert what you have not seen.** An absent SOC 2 report is a finding
worth stating plainly. A guess is worse than a gap, because a gap routes the
request to "more information required" and a guess approves something on
evidence that does not exist.

Distinguish three things, every time:

| Provenance | Means |
|---|---|
| `sourced` | You found it on an identifiable page. Give the URL. |
| `claimed` | The vendor asserts it about itself, nothing independent confirms it. |
| `none` | You could not establish it. Say so. |

A marketing page saying "enterprise-grade security" is **not** a SOC 2 report.
A trust centre offering a report under NDA **is** obtainable — mark it
`sourced` and note the gating in `summary`.

## What to find

Search the vendor's trust centre, security page, legal pages and pricing page.

1. **SOC 2 Type II** — obtainable? Current?
2. **ISO 27001** — certified? Which scope?
3. **Data Processing Agreement** — publicly available?
4. **Sub-processor list** — published?
5. **Data residency** — where is customer data stored? Vendor claim, or confirmed?
6. **SSO / SAML** — supported, and on which pricing tier? Note if it needs a
   higher tier than the one being requested — that is a real finding.
7. **Price** — per seat per year, and the annual total for the seat count given.

## Output

Return **only** this JSON. No preamble, no commentary, no code fence.
GreenLight validates it and will reject anything else.

```json
{
  "product": "Notion",
  "vendor": "Notion Labs",
  "soc2":          { "value": true,  "provenance": "sourced", "source": "https://notion.so/security" },
  "iso27001":      { "value": true,  "provenance": "sourced", "source": "https://notion.so/security" },
  "dpa":           { "value": true,  "provenance": "sourced", "source": "https://notion.so/legal/dpa" },
  "subprocessors": { "value": null,  "provenance": "none",    "source": null },
  "residency":     { "value": "United States", "provenance": "claimed", "source": "https://notion.so/security" },
  "sso":           { "value": false, "provenance": "sourced", "source": "https://notion.so/pricing" },
  "annualCostLkr": { "value": 648000, "provenance": "sourced", "source": "https://notion.so/pricing" },
  "summary": "SOC 2 Type II and ISO 27001 are published on the trust centre and a DPA is publicly available. No sub-processor list could be found, and SAML requires the Enterprise tier rather than the Business tier requested."
}
```

Rules for the fields:

- `value` is `null` whenever `provenance` is `none`. Never both a value and `none`.
- `sso.value` is `false` — not `null` — when SSO exists but not on the tier
  requested. That is "not supported for this request", which is different from
  "could not be established".
- `annualCostLkr` is in Sri Lankan rupees. If pricing is in USD, convert at
  1 USD = 300 LKR and say so in `summary`.
- `summary` is two sentences. State what you could not find.

## Pasting it back

Copy the JSON into GreenLight's **Paste findings** box on the request. It
validates the shape, stores each field with the provenance you gave it, and
the rule pack derives the verdict.

Every field you mark `sourced` becomes evidence in an audit trail with your
name against it. Mark accordingly.
