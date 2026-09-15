"""Generate the PowerPoint version of the GreenLight deck.

    python scripts/build-deck-pptx.py     ->  docs/greenlight-deck.pptx

Why this exists rather than a hand-made .pptx: the deck already exists as
docs/greenlight-deck.html, and two copies of the same slides maintained by
hand drift apart within a day (12 slides, ~10 minutes). This script is the second copy, so an edit to
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
        """items: (key, value) or (key, value, key_colour)."""
        h = Inches(0.4 * len(items) + 0.2)
        tf = box(self.s, MARGIN, self.y, CONTENT_W, h)
        parts = []
        for item in items:
            k, val = item[0], item[1]
            kc = item[2] if len(item) > 2 else FAINT
            parts.append(hx(f"{k}   ", mono=True, b=(len(item) > 2), size=size - 1, color=kc))
            parts.extend(val if isinstance(val, list) else [hx(val)])
            parts.append(hx("\n"))
        write(tf, parts, size=size, color=INK2, line=1.55, space_after=5)
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


    def notes(self, text):
        """Speaker notes. This is what makes the file presentable by someone
        who is not me — which is the point of handing a backup to the
        presentation coordinator."""
        self.s.notes_slide.notes_text_frame.text = text.strip()
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
            hx("Every software request in the company lands on one desk — and before anyone can say yes, "),
            hx("somebody has to research the vendor by hand. "),
            hx("That is the task this removes.", b=True, color=INK),
        ],
        width=0.62,
    )
    s.cards(
        [
            {"title": "The recurring task", "body": "Two to three hours of vendor research per tool, plus the days it waits in a queue. Every week."},
            {"title": "Built with Claude", "body": "Two Claude Skills do the reading a person used to do — on an ordinary subscription, no API key."},
            {"title": "Who it is for", "body": "Every department raises software requests. Operations decides. So: all of them."},
        ],
        height=1.3,
    )
    s.tiny("Lakshitha  ·  greenlight-umber.vercel.app")
    s.notes(
        "[~30s] Good morning. I'm Lakshitha.\n\n"
        "GreenLight is an approval console. It takes the software requests that land on "
        "Operations every week and hands them back with the homework already done.\n\n"
        "The recurring task it removes is vendor research — two to three hours a tool, plus "
        "the days it spends waiting.\n\n"
        "MOVE ON WITH: Let me show you why it mattered."
    )

    # 2 ── the hook
    s = Slide(prs, "Why I built it")
    s.heading("Last month the support team asked to\ninstall a remote-access tool.", big=True)
    s.lede(
        [
            hx("When GreenLight checked, it was already on the public list of software "),
            hx("being actively broken into right now", b=True, color=CRIT),
            hx("."),
        ],
        width=0.72,
    )
    s.body(
        [
            hx("And nobody did anything wrong.", b=True, color=INK),
            hx(" The requester had no reason to check. The approver had no way to find out. "),
            hx("The gap was not in the people — it was that answering the question properly takes hours nobody has."),
        ],
        width=0.78,
    )
    s.tiny(
        "Checked live against CISA's Known Exploited Vulnerabilities catalogue at the moment of "
        "asking. The figures are whatever the catalogue says that day — which is exactly the point."
    )
    s.notes(
        "[~60s] Last month the support team asked for a remote-access tool for a client service "
        "desk. A perfectly reasonable request.\n\n"
        "When GreenLight checked it against CISA's live list of software being actively "
        "exploited — it was on it.\n\n"
        "*** PAUSE HERE. Let that sit. ***\n\n"
        "Nobody could have known. The requester had no reason to check. The approver had no way "
        "to find out in the time available.\n\n"
        "IF ASKED the exact number: it is checked live, so it is whatever CISA says that day. "
        "That is deliberate — a number baked into a slide would already be out of date.\n\n"
        "MOVE ON WITH: The gap isn't the people. It's that answering properly takes hours."
    )

    # 3 ── the recurring task
    s = Slide(prs, "The recurring task")
    s.heading("One request. Nearly a week.")
    s.rows(
        [
            ("3 days", "It waits in the inbox. Every operational request in the company arrives at the same desk.", WARN),
            ("1–2 days", "It comes back incomplete — no justification, no cost, no security answer. The reply goes to the bottom of the queue.", WARN),
            ("2–3 hrs", "The approver becomes the researcher. Is this vendor safe? What does it cost? Are we allowed to use it here?", CRIT),
        ],
        size=12.5,
    )
    s.body(
        [
            hx("Then multiply that by every tool, every week.", b=True, color=INK),
            hx(" One person is the bottleneck for the whole company, and the work that makes them "),
            hx("the bottleneck is the same work every time."),
        ]
    )
    s.tiny(
        "Elapsed times are estimates and are marked as estimates throughout this deck. The "
        "missing-justification case is real — it happened to an ISO approval last month."
    )
    s.notes(
        "[~60s] Here is the week.\n\n"
        "Three days in the inbox — every operational request in the company arrives at one desk.\n\n"
        "Then it comes back incomplete, so another day or two.\n\n"
        "Then two to three hours of research, by the approver, by hand.\n\n"
        "Nearly a week for one tool.\n\n"
        "LAND THIS: the work that makes one person the bottleneck is the same work every single "
        "time. That is exactly what you automate.\n\n"
        "NOTE: say the word 'estimate' out loud here. It buys you credibility for slide 10."
    )

    # 4 ── before and after
    s = Slide(prs, "What changes")
    s.heading("The same request, before and after.")
    s.cards(
        [
            {
                "title": "What the approver used to open",
                "body": [
                    hx(
                        "Could we get Canva Pro for the\nmarketing team? There are 6 of us\n"
                        "and we are rebuilding the case-study\ntemplates.\n\nThanks,\nMarketing Lead\n\n",
                        mono=True,
                        size=9.5,
                        color=MUTED,
                    ),
                    hx("And nothing else.", b=True, color=INK),
                ],
            },
            {
                "tone": "ok",
                "title": "What the approver opens now",
                "rows": [
                    ("Own it?", "No — new to us"),
                    ("Attacked?", "Nothing on the live exploited list"),
                    ("Security", [hx("Independent audit report — "), hx("found", b=True, color=INK)]),
                    ("Our data", [hx("United States — "), hx("vendor's own word only", b=True, color=WARN)]),
                    ("Cost", "Within delegated spend authority"),
                    ("Privacy", [hx("Not stated", b=True, color=WARN), hx(" — question drafted")]),
                ],
            },
        ],
        height=2.5,
    )
    s.body(
        [
            hx("Same request. Same approver. "),
            hx("The homework is done before they open it", b=True, color=INK),
            hx(" — and what is still unknown is named, not quietly filled in."),
        ]
    )
    s.notes(
        "[~75s] THIS IS THE SLIDE. Slow down.\n\n"
        "Same request, both sides.\n\n"
        "Left: what the approver used to open. Six people want Canva Pro. And nothing else — no "
        "cost, no security answer, no legal position.\n\n"
        "Right: what they open now. Do we own it — no. Is anyone attacking it — no. Is there a "
        "security audit — yes, and here is where we found it.\n\n"
        "Where does our data sit — United States. But read that line carefully: that is the "
        "VENDOR'S OWN WORD. Nobody independent confirmed it, and GreenLight says so.\n\n"
        "And privacy: the email never mentioned it. So rather than assume, GreenLight has "
        "drafted the question — and a person sends it.\n\n"
        "LAND THIS: the homework is done, and what is unknown is named rather than filled in."
    )

    # 5 ── the biggest saving
    s = Slide(prs, "The biggest saving")
    s.heading("Most requests should never reach a person at all.")
    s.lede([hx("Before anything else, GreenLight asks one question: "), hx("do we already own this?", b=True, color=INK)])
    s.cards(
        [
            {"tone": "ok", "num": "Nobody", "num_color": SIGNAL, "body": "We own it and a licence is spare. Access in seconds, and it is still logged."},
            {"tone": "info", "num": "Finance", "num_color": INFO, "body": "We own it, no spare seat. That is a purchase, not a security question — so it never reaches IT."},
            {"tone": "warn", "num": "IT", "num_color": WARN, "body": "New to us, or the last answer has expired. This is the one worth an approver's attention."},
        ],
        height=1.8,
    )
    s.body(
        [
            hx("On one working day of real traffic, "),
            hx("3 of 11 requests were settled before anyone read them", b=True, color=INK),
            hx(" — and of the four asking for software we already own, "),
            hx("three needed no security review at all", b=True, color=INK),
            hx("."),
        ]
    )
    s.notes(
        "[~60s] The biggest saving is not doing the research faster. It is not doing it at all.\n\n"
        "First question: do we already own this?\n\n"
        "Yes, and a seat is free — nobody approves anything. Access in seconds, still logged.\n\n"
        "Yes, but no spare seat — that is a purchase, not a security question. It goes to whoever "
        "owns the budget. It never reaches IT.\n\n"
        "Only genuinely new software reaches an approver.\n\n"
        "NUMBER TO LAND: on one working day of real traffic, 3 of 11 were settled before anyone "
        "read them.\n\n"
        "IF CHALLENGED that 8 of 11 still needed review: yes — and that share falls every time "
        "something is approved, because approving it adds it to what we own. The queue shrinks "
        "as you use it."
    )

    # 6 ── what only Claude can do
    s = Slide(prs, "Where Claude does the work")
    s.heading("The questions you cannot look up.")
    s.cards(
        [
            {
                "title": "A database can answer these",
                "body": [
                    hx("Is anyone attacking it right now? How many serious flaws? What is its privacy record?\n\n", color=MUTED),
                    hx("CISA   ·   NIST   ·   ToSDR   ·   OSV\n\n", mono=True, size=9.5, color=MUTED),
                    hx("Four sources, about one second.", b=True, color=INK),
                ],
            },
            {
                "tone": "ok",
                "title": "Only Claude can answer these",
                "body": [
                    hx(
                        "Does this vendor hold a current security audit? Will they sign a data agreement? "
                        "Where does our data physically sit? Who else do they hand it to?\n\n"
                    ),
                    hx("There is no database for any of it.", b=True, color=INK),
                    hx(" It lives as prose on legal pages, in a different shape for every vendor."),
                ],
            },
        ],
        height=2.3,
    )
    s.body(
        [
            hx("That reading is the recurring task.", b=True, color=INK),
            hx(" It is what took two to three hours a time — and it is the part Claude takes off the desk."),
        ]
    )
    s.notes(
        "[~60s] Some of these questions a database answers. Four free sources, about a second, "
        "no key required — is anyone attacking it, how many serious flaws, what is its privacy "
        "record.\n\n"
        "But the questions that actually decide an approval have no database behind them.\n\n"
        "Does this vendor hold a current security audit? Will they sign a data agreement? Where "
        "does our data physically sit?\n\n"
        "That lives as prose, on legal pages, in a different shape for every single vendor. "
        "Somebody has to read it.\n\n"
        "LAND THIS: that reading IS the recurring task. It is what took the hours. That is the "
        "part Claude takes.\n\n"
        "IF ASKED about cost: it runs on an ordinary Claude subscription. No API key, no per-call "
        "billing."
    )

    # 7 ── trust
    s = Slide(prs, "Why you can trust it")
    s.heading("It tells you what it doesn't know.")
    s.lede(
        [hx("The thing everyone fears about an AI tool is confident nonsense. This one is built so it cannot produce any.")],
        width=0.66,
    )
    s.pills(
        [
            ("checked", "ok", "we queried a source anyone else can query too"),
            ("found", "info", "it is written on a page, and the page is kept"),
            ("their word", "warn", "the vendor says so about itself, nothing confirms it"),
            ("not found", "bad", "we could not establish it, and we say so"),
        ]
    )
    s.cards(
        [
            {
                "tone": "bad",
                "title": "A vendor's word is not evidence",
                "body": [hx("A vendor's own claim "), hx("cannot satisfy a requirement that blocks", b=True, color=INK), hx(", however it arrived.")],
            },
            {
                "tone": "info",
                "title": '"Not found" is an answer',
                "body": [
                    hx("A question it cannot settle comes back as "),
                    hx("more information required", b=True, color=INK),
                    hx(". Never a guess."),
                ],
            },
        ],
        height=1.25,
    )
    s.notes(
        "[~60s] The obvious objection to any AI tool is that it makes things up. So this is the "
        "part I would defend hardest.\n\n"
        "Every fact carries where it came from. We checked it. We found it written on a page. "
        "The vendor claims it about itself. Or we could not establish it.\n\n"
        "And two rules follow from that.\n\n"
        "A vendor's claim about itself cannot satisfy a requirement that blocks — their word is "
        "not evidence.\n\n"
        "And a question it cannot settle comes back as 'more information required'. Never a guess.\n\n"
        "LAND THIS: it tells you what it does not know. That is what makes it safe to rely on."
    )

    # 8 ── it keeps working
    s = Slide(prs, "After you stop watching")
    s.heading("Approvals expire by themselves.")
    s.rows(
        [
            ("→", [hx("Slack's approval "), hx("ran out this morning", b=True, color=INK), hx(". It dropped off the list of what may run on company machines, on its own.")]),
            ("→", [hx("Microsoft 365 — "), hx("six new actively-exploited vulnerabilities", b=True, color=CRIT), hx(" published since it was approved. It stops self-serving until someone looks again.")]),
            ("→", [hx("No ticket. No restart. Nobody notified", b=True, color=INK), hx(" — because nobody needed to be.")]),
        ],
        size=12.5,
    )
    s.card(
        {
            "tone": "warn",
            "title": "And it finds what nobody approved",
            "body": "GreenLight compares what was approved against what is actually installed on company machines — so software that arrived without asking shows up.",
        },
        height=1.0,
    )
    s.tiny(
        "Two products covering 550 seats were withheld automatically this morning — one because "
        "its approval expired, one because it came under attack after we approved it."
    )
    s.notes(
        "[~50s] An approval is not forever, and this is the part I would show a security lead.\n\n"
        "Slack's approval ran out this morning. It dropped off the list of what may run on "
        "company machines — on its own.\n\n"
        "Microsoft 365 came under attack after we approved it: six new actively-exploited "
        "vulnerabilities published since. So it stops self-serving until someone looks again.\n\n"
        "No ticket. No restart. Nobody notified — because nobody needed to be.\n\n"
        "Two products, 550 seats, handled this morning while everybody was asleep.\n\n"
        "AND: it also compares what we approved against what is actually running, so software "
        "that arrived without asking shows up."
    )

    # 9 ── who owns the policy
    s = Slide(prs, "Who owns the policy")
    s.heading("Operations changes the rules. Not a developer.")
    s.lede(
        [hx("The rules are a file Operations owns — nineteen requirements across software approval, ISO documents and privacy screening.")],
        width=0.68,
    )
    s.body(
        [
            hx("Change one and "),
            hx("nothing is deployed and no ticket is raised", b=True, color=INK),
            hx(". Every decision is stamped with the version of the rules that governed it, so an auditor asking "),
            hx('"what were the rules in March?"', i=True),
            hx(" gets an answer rather than an archaeology exercise."),
        ],
        width=0.82,
    )
    s.card(
        {
            "tone": "info",
            "title": "ISO audits are due early next year",
            "body": "The evidence file builds itself — every decision, who made it, when, and under which version of our own policy. Including the ones nobody had to touch.",
        },
        height=1.0,
    )
    s.notes(
        "[~45s] One thing worth saying to Operations directly.\n\n"
        "The rules are yours. Nineteen requirements, in a file you own — not in code, not in my "
        "head.\n\n"
        "Change one, and nothing gets deployed and no ticket gets raised.\n\n"
        "And every decision records which version of the rules governed it. So when the ISO audit "
        "asks what the rules were in March, there is an answer — rather than somebody digging "
        "through old emails.\n\n"
        "AUDIENCE NOTE: if Quality or Compliance are in the room, this is their slide. Look at them."
    )

    # 10 ── what it's worth
    s = Slide(prs, "What it's worth")
    s.heading("Honestly, split in two.")
    s.cards(
        [
            {
                "tone": "ok",
                "title": "We can show this today",
                "title_color": SIGNAL,
                "rows": [
                    ("·", [hx("898 licence seats", b=True, color=INK), hx(" tracked — "), hx("99 sitting unused", b=True, color=INK)]),
                    ("·", [hx("LKR 2.16m a year", b=True, color=INK), hx(" in seats nobody has opened")]),
                    ("·", [hx("3 of 11", b=True, color=INK), hx(" requests settled before anyone read them")]),
                    ("·", [hx("Software under active attack caught "), hx("before", b=True, color=INK), hx(" it is installed")]),
                    ("·", "An audit file that assembles itself"),
                ],
            },
            {
                "title": "Still to be measured",
                "title_color": WARN,
                "rows": [
                    ("1", "How many software requests arrive in a week?"),
                    ("2", "What share of them come back incomplete?"),
                    ("3", "How long does that round trip actually take?"),
                ],
            },
        ],
        height=2.45,
    )
    s.body(
        [
            hx("Ten minutes with Operations turns the time saved from an estimate into evidence. Until then I am calling it an estimate. ", color=MUTED),
            hx("It is running now, not a mockup — greenlight-umber.vercel.app.", b=True, color=INK),
        ],
        size=11.5,
    )
    s.notes(
        "[~60s] Split honestly, because I would rather you trusted the half I can prove.\n\n"
        "LEFT — what I can show you today:\n"
        "898 licence seats tracked. 99 of them sitting unused. That is 2.16 million rupees a year "
        "in licences nobody has opened.\n"
        "3 of 11 requests settled without an approver.\n"
        "Software under active attack caught before installation.\n\n"
        "RIGHT — what I cannot prove yet. How many requests a week. What share come back "
        "incomplete. How long the round trip really takes.\n\n"
        "Ten minutes with Operations turns those into evidence. Until then I am calling them "
        "estimates — and I would rather tell you which is which.\n\n"
        "FINALLY: it is running. Not a mockup. You can sign in this afternoon."
    )

    # 11 ── departments
    s = Slide(prs, "Applicable departments")
    s.heading("Every department asks. One department decides.")
    s.cards(
        [
            {"title": "Everyone raises requests", "body": "Delivery, QA, Marketing, Support, Infrastructure and Quality all ask for software. They get an answer in seconds, or a clear question back."},
            {"tone": "ok", "title": "Operations decides", "body": "The approver, and the only role that can. They stop being the research desk and go back to being the decision."},
            {"tone": "info", "title": "Finance, Legal and IT", "body": "Spend that needs a budget owner, privacy law that needs an assessment, and what is permitted to run on company machines."},
        ],
        height=1.9,
    )
    s.body(
        [
            hx("That is why this is submitted as "),
            hx("All", b=True, color=INK),
            hx(" — the queue belongs to Operations, but the request belongs to everyone."),
        ]
    )
    s.notes(
        "[~35s] Who is it for.\n\n"
        "Everyone raises software requests — Delivery, QA, Marketing, Support, Infrastructure, "
        "Quality. All of them.\n\n"
        "Operations decides, and is the only role that can.\n\n"
        "Finance owns the spend, Legal owns the privacy question, IT owns what runs on the "
        "machines.\n\n"
        "That is why it is submitted as All."
    )

    # 12 ── close
    s = Slide(prs, "GreenLight")
    s.heading("GreenLight never approves anything.", big=True, gap=0.0)
    s.heading("It makes sure a person can.", big=True, color=SIGNAL)
    s.tiny("BISTEC Global  ·  greenlight-umber.vercel.app")
    s.notes(
        "[~25s] One line to leave you with.\n\n"
        "GreenLight never approves anything. It makes sure a person can.\n\n"
        "*** PAUSE. Then: *** Thank you.\n\n"
        "LIKELY QUESTIONS:\n"
        "· Is it really running? Yes — sign in at the address on screen, any account, password "
        "'greenlight'.\n"
        "· What if Claude is wrong? It cannot approve anything, and anything it could not verify "
        "is marked unverified. A person decides every time.\n"
        "· What did it cost to build? An ordinary Claude subscription. No API key, no per-call "
        "billing.\n"
        "· Could my department use it? The rule engine is not software-specific — it already runs "
        "ISO document approvals through the same path."
    )

    out = Path(__file__).resolve().parent.parent / "docs" / "greenlight-deck.pptx"
    prs.save(out)
    n = len(prs.slides._sldIdLst)
    print(f"wrote {out}  ({out.stat().st_size / 1024:.0f} KB, {n} slides, speaker notes on all)")


if __name__ == "__main__":
    build()
