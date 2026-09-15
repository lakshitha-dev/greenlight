"""Generate the PowerPoint version of the GreenLight deck.

    python scripts/build-deck-pptx.py     ->  docs/greenlight-deck.pptx

Why this exists rather than a hand-made .pptx: the deck already exists as
docs/greenlight-deck.html, and two copies of the same 13 slides maintained by
hand drift apart within a day. This script is the second copy, so an edit to
the content happens once, here, and both stay in step.

Two deliberate departures from the HTML:

  Fonts. The web deck loads Lato and IBM Plex Mono from Google Fonts. A .pptx
  has no such fallback — an unavailable font substitutes silently, and this
  file's whole job is to open correctly on a projector laptop that is not
  mine. So it uses Segoe UI and Consolas, present on any Windows machine. The
  deck's character is in its layout, colour and restraint, not the typeface.

  Chrome. The fixed brandmark and progress bar become a thin brand-coloured
  rule and a small wordmark, because PowerPoint has no fixed positioning and a
  per-slide redraw is closer to how the browser actually renders it anyway.
"""

from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

# ── palette — the CSS custom properties from greenlight-deck.html ───────────
GROUND = RGBColor(0xF8, 0xF9, 0xFB)
SURFACE = RGBColor(0xFF, 0xFF, 0xFF)
SURFACE2 = RGBColor(0xF1, 0xF3, 0xF6)
LINE = RGBColor(0xE2, 0xE5, 0xEB)
INK = RGBColor(0x11, 0x18, 0x27)
INK2 = RGBColor(0x37, 0x41, 0x51)
MUTED = RGBColor(0x4B, 0x55, 0x63)
FAINT = RGBColor(0x65, 0x6C, 0x7A)
BRAND = RGBColor(0x14, 0x37, 0x7D)

SIGNAL = RGBColor(0x1E, 0x7A, 0x32)
SIGNAL_SOFT = RGBColor(0xE7, 0xF5, 0xEA)
SIGNAL_LINE = RGBColor(0xA8, 0xD9, 0xB4)
CRIT = RGBColor(0xB4, 0x23, 0x18)
CRIT_SOFT = RGBColor(0xFD, 0xEC, 0xEB)
CRIT_LINE = RGBColor(0xF2, 0xB8, 0xB4)
WARN = RGBColor(0xB5, 0x47, 0x08)
WARN_SOFT = RGBColor(0xFD, 0xF2, 0xE7)
WARN_LINE = RGBColor(0xF0, 0xC3, 0x9A)
INFO = RGBColor(0x00, 0x70, 0x7F)
INFO_SOFT = RGBColor(0xE3, 0xF4, 0xF7)
INFO_LINE = RGBColor(0x9E, 0xD4, 0xDE)

TONE = {
    None: (SURFACE, LINE, INK),
    "ok": (SIGNAL_SOFT, SIGNAL_LINE, SIGNAL),
    "bad": (CRIT_SOFT, CRIT_LINE, CRIT),
    "warn": (WARN_SOFT, WARN_LINE, WARN),
    "info": (INFO_SOFT, INFO_LINE, INFO),
}

SANS = "Segoe UI"
MONO = "Consolas"

W, H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.92)
CONTENT_W = W - 2 * MARGIN


def hx(text, **kw):
    """One formatted run. Keys: b (bold), i, color, mono, size."""
    return (text, kw)


def write(tf, parts, size=13, color=INK2, space_after=6, line=1.32, align=None):
    """Fill a text frame with runs. `parts` is a list of hx() tuples, or a
    plain string. A part whose text contains a newline becomes separate
    paragraphs, so the source reads like the sentence it renders."""
    tf.word_wrap = True
    if isinstance(parts, str):
        parts = [hx(parts)]

    paras = [[]]
    for text, kw in parts:
        chunks = text.split("\n")
        for n, chunk in enumerate(chunks):
            if n:
                paras.append([])
            if chunk:
                paras[-1].append((chunk, kw))

    first = True
    for run_specs in paras:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.space_after = Pt(space_after)
        p.line_spacing = line
        if align:
            p.alignment = align
        if not run_specs:
            # a deliberate blank line
            r = p.add_run()
            r.text = " "
            r.font.size = Pt(size * 0.5)
            continue
        for text, kw in run_specs:
            r = p.add_run()
            r.text = text
            f = r.font
            f.size = Pt(kw.get("size", size))
            f.name = MONO if kw.get("mono") else SANS
            f.bold = kw.get("b", False)
            f.italic = kw.get("i", False)
            f.color.rgb = kw.get("color", color)
    return tf


def box(slide, l, t, w, h):
    tb = slide.shapes.add_textbox(l, t, w, h)
    tb.text_frame.word_wrap = True
    return tb.text_frame


class Slide:
    """A slide under construction, with a vertical cursor."""

    def __init__(self, prs, eyebrow=None):
        self.s = prs.slides.add_slide(prs.slide_layouts[6])
        self.s.background.fill.solid()
        self.s.background.fill.fore_color.rgb = GROUND

        rule = self.s.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, W, Inches(0.045))
        rule.fill.solid()
        rule.fill.fore_color.rgb = BRAND
        rule.line.fill.background()
        rule.shadow.inherit = False

        mark = box(self.s, MARGIN, Inches(0.2), Inches(3), Inches(0.3))
        write(mark, [hx("GreenLight", b=True, size=9.5, color=MUTED)], space_after=0)

        self.y = Inches(0.78)
        if eyebrow:
            tf = box(self.s, MARGIN, self.y, CONTENT_W, Inches(0.3))
            write(
                tf,
                [hx(" ".join(eyebrow.upper()).replace("   ", "  "), b=True, size=9.5, color=FAINT)],
                space_after=0,
            )
            self.y += Inches(0.42)

    # ── blocks ────────────────────────────────────────────────────────────
    def heading(self, text, big=False, color=INK, gap=0.16):
        size = 34 if big else 26
        h = Inches(1.35 if big else 0.62) if "\n" not in text else Inches(2.2)
        tf = box(self.s, MARGIN, self.y, CONTENT_W, h)
        write(tf, [hx(text, b=True, size=size, color=color)], line=1.1, space_after=0)
        self.y += h + Inches(gap)
        return self

    def lede(self, parts, width=0.72):
        tf = box(self.s, MARGIN, self.y, int(CONTENT_W * width), Inches(0.78))
        write(tf, parts, size=16, color=INK2, line=1.4, space_after=0)
        self.y += Inches(0.92)
        return self

    def body(self, parts, gap=0.2, width=0.86, size=13):
        n = sum(len(t) for t, _ in (parts if not isinstance(parts, str) else [(parts, {})]))
        h = Inches(0.42 + 0.30 * (n // 110))
        tf = box(self.s, MARGIN, self.y, int(CONTENT_W * width), h)
        write(tf, parts, size=size, color=INK2, line=1.38, space_after=0)
        self.y += h + Inches(gap)
        return self

    def cards(self, items, height=1.55, gap=0.22):
        """items: list of dicts {tone, title, num, num_color, body, rows, chips}"""
        n = len(items)
        g = Inches(gap)
        cw = int((CONTENT_W - g * (n - 1)) / n)
        top = self.y
        for i, it in enumerate(items):
            left = MARGIN + i * (cw + g)
            self._card(left, top, cw, Inches(height), it)
        self.y = top + Inches(height) + Inches(0.26)
        return self

    def card(self, item, height=1.1, width=1.0):
        self._card(MARGIN, self.y, int(CONTENT_W * width), Inches(height), item)
        self.y += Inches(height) + Inches(0.26)
        return self

    def _card(self, left, top, w, h, it):
        fill, border, accent = TONE[it.get("tone")]
        shp = self.s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, w, h)
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
        shp.line.color.rgb = border
        shp.line.width = Pt(1)
        shp.shadow.inherit = False
        shp.adjustments[0] = 0.06

        pad = Inches(0.22)
        tf = box(self.s, left + pad, top + Inches(0.16), w - 2 * pad, h - Inches(0.3))
        parts = []
        if it.get("num"):
            parts.append(hx(it["num"] + "\n", b=True, size=27, mono=True, color=it.get("num_color", INK)))
        if it.get("title"):
            title_color = it.get("title_color", INK)
            parts.append(hx(it["title"], b=True, size=12, color=title_color))
            if it.get("chip"):
                parts.append(hx("   " + it["chip"], b=True, size=8.5, mono=True, color=MUTED))
            parts.append(hx("\n"))
        for part in it.get("body", []) if isinstance(it.get("body"), list) else ([hx(it["body"])] if it.get("body") else []):
            parts.append(part)
        write(tf, parts, size=10.5, color=INK2, line=1.34, space_after=3)

        if it.get("rows"):
            rtf = box(self.s, left + pad, top + Inches(0.62), w - 2 * pad, h - Inches(0.7))
            rparts = []
            for k, val in it["rows"]:
                rparts.append(hx(f"{k}   ", mono=True, size=9.5, color=FAINT))
                rparts.extend(val if isinstance(val, list) else [hx(val)])
                rparts.append(hx("\n"))
            write(rtf, rparts, size=11, color=INK2, line=1.5, space_after=2)

    def rows(self, items, key_w=0.42, size=12.5, gap=0.22):
        h = Inches(0.34 * len(items) + 0.2)
        tf = box(self.s, MARGIN, self.y, CONTENT_W, h)
        parts = []
        for k, val in items:
            parts.append(hx(f"{k}   ", mono=True, size=size - 1.5, color=FAINT))
            parts.extend(val if isinstance(val, list) else [hx(val)])
            parts.append(hx("\n"))
        write(tf, parts, size=size, color=INK2, line=1.5, space_after=4)
        self.y += h + Inches(gap)
        return self

    def pills(self, items, gap=0.18):
        """items: list of (label, tone, trailing text)"""
        h = Inches(0.4 * len(items) + 0.15)
        top = self.y
        for i, (label, tone, trail) in enumerate(items):
            t = top + Inches(0.4 * i)
            _, border, accent = TONE[tone]
            fill = TONE[tone][0]
            pw = Inches(0.42 + 0.085 * len(label))
            shp = self.s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, MARGIN, t, pw, Inches(0.28))
            shp.fill.solid()
            shp.fill.fore_color.rgb = fill
            shp.line.color.rgb = border
            shp.line.width = Pt(0.75)
            shp.shadow.inherit = False
            shp.adjustments[0] = 0.5
            ptf = shp.text_frame
            ptf.margin_left = ptf.margin_right = 0
            ptf.margin_top = ptf.margin_bottom = 0
            ptf.vertical_anchor = MSO_ANCHOR.MIDDLE
            write(ptf, [hx(label, b=True, size=9, color=accent)], space_after=0, align=PP_ALIGN.CENTER)

            ttf = box(self.s, MARGIN + pw + Inches(0.14), t - Inches(0.015), CONTENT_W - pw, Inches(0.32))
            write(ttf, [hx(trail, size=12, color=INK2)], space_after=0)
        self.y = top + h + Inches(gap)
        return self

    def chips(self, labels):
        left = MARGIN
        for label in labels:
            cw = Inches(0.26 + 0.082 * len(label))
            shp = self.s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, self.y, cw, Inches(0.26))
            shp.fill.solid()
            shp.fill.fore_color.rgb = SURFACE2
            shp.line.color.rgb = LINE
            shp.line.width = Pt(0.75)
            shp.shadow.inherit = False
            shp.adjustments[0] = 0.18
            tf = shp.text_frame
            tf.margin_left = tf.margin_right = 0
            tf.margin_top = tf.margin_bottom = 0
            tf.vertical_anchor = MSO_ANCHOR.MIDDLE
            write(tf, [hx(label, size=8.5, mono=True, color=MUTED)], space_after=0, align=PP_ALIGN.CENTER)
            left += cw + Inches(0.12)
        self.y += Inches(0.42)
        return self

    def tiny(self, text):
        tf = box(self.s, MARGIN, H - Inches(1.05), CONTENT_W, Inches(0.7))
        write(tf, [hx(text, size=8.5, color=FAINT)], line=1.4, space_after=0)
        return self


# ── the deck ───────────────────────────────────────────────────────────────
def build():
    prs = Presentation()
    prs.slide_width, prs.slide_height = W, H

    # 1 ── title
    s = Slide(prs, "HeartForge 2026  ·  BISTEC Global")
    s.heading("GreenLight", big=True, gap=0.02)
    s.lede([hx("Approvals that arrive ready to approve.")], width=0.5)
    s.body(
        [
            hx("Every software request in the company lands on one desk as an email. "),
            hx("GreenLight reads it, answers what can be answered, and hands a person a finished dossier. "),
            hx("It never approves anything.", b=True, color=INK),
        ],
        width=0.62,
    )
    s.cards(
        [
            {"title": "The recurring task", "body": "Researching a vendor by hand, two to three hours per tool, every week."},
            {"title": "Built with Claude", "body": "Two Skills and an MCP server. No API key needed — a subscription is enough."},
            {"title": "Applies to", "body": "All departments raise requests. Operations decides."},
        ],
        height=1.32,
    )
    s.tiny("Lakshitha  ·  greenlight-umber.vercel.app  ·  github.com/lakshitha-dev/greenlight")

    # 2 ── today
    s = Slide(prs, "Today")
    s.heading("Every software request in the company lands on one desk.")
    s.cards(
        [
            {"title": "It waits", "body": "Every operational request needs IT sign-off. They queue."},
            {"tone": "warn", "title": "It's unusable when opened", "body": "No justification, no security answer, no cost, no legal position."},
            {"tone": "bad", "title": "The approver becomes the researcher", "body": "Two to three hours of vendor research, per tool, by hand."},
        ],
        height=1.5,
    )
    s.body(
        [
            hx("Nobody did anything wrong.", b=True, color=INK),
            hx(" The requester didn't know what to include. The approver wasn't slow — they were buried."),
        ]
    )
    s.tiny(
        "Elapsed time is an estimate and is marked as one throughout. The missing-justification "
        "case is real: it happened to an ISO approval last month."
    )

    # 3 ── email intake
    s = Slide(prs, "Where it starts")
    s.heading("The request is an email. So GreenLight reads email.")
    s.lede(
        [
            hx(
                "Nobody at BISTEC fills in a form. They write to the Head of Operations — "
                "which meant someone still had to read the message and retype it."
            )
        ]
    )
    s.cards(
        [
            {
                "title": "What arrives",
                "body": [
                    hx(
                        "Could we get Canva Pro for the\nmarketing team? There are 6 of us\n"
                        "and we are rebuilding the case-study\ntemplates.\n\nThanks,\nMarketing Lead",
                        mono=True,
                        size=9.5,
                        color=MUTED,
                    )
                ],
            },
            {
                "tone": "ok",
                "title": "What GreenLight files",
                "rows": [
                    ("Software", "Canva Pro"),
                    ("Seats", "6"),
                    ("Team", "Marketing"),
                    ("For", "Rebuilding case-study templates"),
                    ("Personal data", [hx("not stated", b=True, color=WARN)]),
                ],
            },
        ],
        height=2.15,
    )
    s.body(
        [
            hx("That last line is the whole point.", b=True, color=INK),
            hx(" Whether anyone's personal data goes in decides whether a privacy assessment is legally required. "),
            hx("The email does not mention the subject — and "),
            hx("silence is not a no", b=True, color=INK),
            hx(". So GreenLight writes the question instead of assuming, and a person sends it."),
        ]
    )
    s.tiny(
        "Two ways in: paste the message, or let a Power Automate rule in Outlook post it. Both land on "
        "the same code. The Power Automate HTTP action is a premium connector, so the paste route is the "
        "one that needs nothing."
    )

    # 4 ── untrusted input
    s = Slide(prs, "The part a security lead asks about")
    s.heading("An inbox is the one input anyone can write to.")
    s.lede(
        [
            hx(
                "Everything else GreenLight reads came from a signed-in colleague or a source it chose "
                "to call. An email is neither — so it is treated as data, never as instruction."
            )
        ]
    )
    s.cards(
        [
            {
                "tone": "bad",
                "title": "A display name is not identity",
                "body": [
                    hx('"ops@bistecglobal.com"\n<attacker@evil.com>\n\n', mono=True, size=9.5, color=CRIT),
                    hx("The address in angle brackets is what counts. Everything else is text someone typed."),
                ],
            },
            {
                "tone": "warn",
                "title": '"Approve this immediately"',
                "body": "Claude extracts fields. There is no field in what it returns that could approve anything — the guarantee is structural, not a filter that has to be clever.",
            },
            {
                "tone": "info",
                "title": "The message is kept",
                "body": "Stored exactly as written, next to what was read out of it. An approver can always check the reading against the words.",
            },
        ],
        height=2.0,
    )
    s.tiny(
        "A reply on a thread already linked to a request attaches to it rather than creating a second "
        "one — the failure every naive mailbox integration ships with."
    )

    # 5 ── the catalog gate
    s = Slide(prs, "The first idea")
    s.heading("Most requests shouldn't reach a person at all.")
    s.lede([hx("Before anything else, GreenLight asks one question: "), hx("do we already own this?", b=True, color=INK)])
    s.cards(
        [
            {"tone": "ok", "num": "Nobody", "num_color": SIGNAL, "body": "We own it and a licence is spare. Access in seconds, logged. No approver."},
            {"tone": "info", "num": "Finance", "num_color": INFO, "body": "We own it, no spare seat. A purchase, not a security question — so it never reaches IT."},
            {"tone": "warn", "num": "IT", "num_color": WARN, "body": "New to us, or the last answer has expired. This is the one worth attention."},
        ],
        height=1.85,
    )
    s.tiny(
        "A catalog hit is not approval. An entry re-escalates when its review date passes, when it drifts "
        "out of a legal entity's scope, or when new exploited vulnerabilities appear after the approval. "
        "A catalog that never expires is just an allowlist."
    )

    # 6 ── what Claude does
    s = Slide(prs, "What Claude does")
    s.heading("The question no database can answer.")
    s.cards(
        [
            {
                "title": "Machines answer this",
                "body": [
                    hx("Is anyone attacking it right now? How many critical CVEs? What's the privacy grade?\n\n", color=MUTED),
                    hx("CISA KEV   ·   NIST NVD   ·   ToSDR   ·   OSV.dev\n\n", mono=True, size=9.5, color=MUTED),
                    hx("Four sources, about one second.", b=True, color=INK),
                ],
            },
            {
                "tone": "ok",
                "title": "Only Claude answers this",
                "body": [
                    hx(
                        "Does this vendor hold a current SOC 2? Is there a DPA? Where does our data actually go? "
                        "Does SSO exist on the tier we're buying?\n\n"
                    ),
                    hx("There is no API for any of it.", b=True, color=INK),
                    hx(" It lives as prose on trust centres and legal pages, in a different shape for every vendor."),
                ],
            },
        ],
        height=2.35,
    )
    s.body(
        [
            hx("Claude reads those pages and returns "),
            hx("typed facts with a source URL for each one", b=True, color=INK),
            hx(" — and states plainly what it could not find."),
        ]
    )

    # 7 ── provenance
    s = Slide(prs, "The rule that makes it trustworthy")
    s.heading("Every fact carries where it came from.")
    s.pills(
        [
            ("verified", "ok", "from a structured source anyone can re-query"),
            ("sourced", "info", "found on an identifiable page, URL kept"),
            ("claimed", "warn", "the vendor says so about itself, nothing confirms it"),
            ("not found", "bad", "could not be established"),
        ]
    )
    s.cards(
        [
            {
                "tone": "bad",
                "title": "A vendor's word is not evidence",
                "body": [hx("A "), hx("claimed", b=True, color=INK), hx(" fact cannot satisfy a blocking requirement — however it arrived.")],
            },
            {
                "tone": "info",
                "title": "Not found is a finding",
                "body": [
                    hx("A requirement that can't be evaluated returns "),
                    hx("more information required", b=True, color=INK),
                    hx(". Never a guess."),
                ],
            },
        ],
        height=1.3,
    )
    s.tiny(
        "This is the failure mode that sinks AI tools: confident synthesis of things nobody verified. "
        "GreenLight is built so it structurally cannot happen."
    )

    # 8 ── policy
    s = Slide(prs, "Policy")
    s.heading("The rules are a file Operations owns. Not code.")
    s.cards(
        [
            {
                "title": "Software approval",
                "chip": "BISTEC Global",
                "body": [
                    hx("software-approval@2.1\n", mono=True, size=9.5, color=MUTED),
                    hx("PDPA No. 9 of 2022. Eight requirements — SOC 2, DPA, residency, SSO, exploited CVEs."),
                ],
            },
            {
                "title": "ISO document approval",
                "chip": "same engine",
                "body": [
                    hx("iso-document-approval@1.0\n", mono=True, size=9.5, color=MUTED),
                    hx("Nothing to research. Five requirements a person judges — and the engine cannot tell the difference."),
                ],
            },
        ],
        height=1.7,
    )
    s.body(
        [
            hx("Change a rule and "),
            hx("nothing is deployed", b=True, color=INK),
            hx(" — you edit a YAML file and bump its version. Every decision is stamped with the version that governed it, so an auditor asking "),
            hx('"what were the rules in March?"', i=True),
            hx(" gets an answer rather than a git archaeology exercise."),
        ]
    )
    s.tiny(
        "One legal entity today, and policy is keyed by entity — a second is another file, not a code "
        "change. Proven by a test: the engine evaluates a leave-approval pack that exists only inside "
        "the test file."
    )

    # 9 ── approvals expire
    s = Slide(prs, "The part I'd show a security lead")
    s.heading("Approvals expire. On their own.")
    s.rows(
        [
            ("→", "Slack was approved in November with a ten-month review interval."),
            ("→", [hx("That interval "), hx("ran out today", b=True, color=INK), hx(".")]),
            (
                "→",
                [
                    hx("So "),
                    hx("slack.exe", mono=True, size=11.5),
                    hx(" "),
                    hx("dropped off the endpoint allow list by itself", b=True, color=CRIT),
                    hx(" — no ticket, no restart, nobody notified."),
                ],
            ),
        ],
        size=13.5,
    )
    s.card(
        {
            "tone": "warn",
            "title": "And Microsoft 365 is being watched",
            "body": [
                hx("Six new actively-exploited vulnerabilities have been published "),
                hx("since it was approved", b=True, color=INK),
                hx(". It stops self-serving until someone looks again."),
            ],
        },
        height=1.05,
    )
    s.tiny(
        "The same validity rule governs both the approval queue and what endpoints are permitted to run, "
        "so policy and enforcement cannot disagree."
    )

    # 10 ── the queue shrinks
    s = Slide(prs, "Why the queue shrinks")
    s.heading("Every decision made today\nis one that is never made again.", big=True)
    s.lede(
        [
            hx(
                "Approve something new and it joins the catalog. The next person who asks for it gets it "
                "in seconds, and the approver never sees the request."
            )
        ],
        width=0.62,
    )
    s.tiny(
        "A person still decides — GreenLight never approves anything. What it removes is the research, "
        "the chasing, and every request that should never have been asked twice."
    )

    # 11 ── what it's worth
    s = Slide(prs, "What it's worth")
    s.heading("Honestly, split in two.")
    s.cards(
        [
            {
                "tone": "ok",
                "title": "Demonstrable today",
                "title_color": SIGNAL,
                "rows": [
                    ("·", [hx("Exploited software caught "), hx("before", b=True, color=INK), hx(" anyone installs it")]),
                    ("·", "Approvals that revoke themselves when they expire"),
                    ("·", "Unapproved software found running on real machines"),
                    ("·", "An ISO audit trail that builds itself"),
                    ("·", [hx("898 seats", b=True, color=INK), hx(" tracked; the unused ones are money")]),
                ],
            },
            {
                "title": "Still to be measured",
                "title_color": WARN,
                "rows": [
                    ("1", "How many software requests arrive in a week?"),
                    ("2", "What share come back incomplete?"),
                    ("3", "How long does that round trip really take?"),
                ],
            },
        ],
        height=2.5,
    )
    s.body(
        [
            hx(
                "Ten minutes with Operations turns the time savings from an estimate into evidence. "
                "Until then I'm presenting them as estimates.",
                color=MUTED,
            )
        ],
        size=12,
    )

    # 12 ── not a mockup
    s = Slide(prs, "It's not a mockup")
    s.heading("Built to be used, not demonstrated.")
    s.cards(
        [
            {"num": "265", "body": "tests, weighted at the rules where a bug means a wrong approval. Three are regressions for defects that actually happened."},
            {"num": "4", "body": "live security sources, queried in about a second. No API key, no mock data."},
            {"num": "3", "body": "roles. A requester pressing Approve is refused and told why."},
        ],
        height=1.95,
    )
    s.cards(
        [
            {"tone": "info", "title": "Deployed and running", "body": "Postgres, sign-in, CI on every push. Not a laptop demo."},
            {"tone": "ok", "title": "Built with Claude", "body": "Claude does the research the app can't. The Skill ships with it, so it runs on an ordinary subscription."},
        ],
        height=1.15,
    )

    # 13 ── close
    s = Slide(prs, "GreenLight")
    s.heading("GreenLight never approves anything.", big=True, gap=0.0)
    s.heading("It makes sure a person can.", big=True, color=SIGNAL)
    s.tiny("BISTEC Global  ·  Approval console")

    out = Path(__file__).resolve().parent.parent / "docs" / "greenlight-deck.pptx"
    prs.save(out)
    print(f"wrote {out}  ({out.stat().st_size / 1024:.0f} KB, {len(prs.slides.__iter__.__self__._sldIdLst)} slides)")


if __name__ == "__main__":
    build()
