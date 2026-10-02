#!/usr/bin/env python3
"""Build the site's animated illustrations into site/assets/anim/.

Stylised redraws of Oxygn's real Risk Register (Jira) for a client: the board,
one risk (RR-20) and the list. Keys, statuses, priorities, field names, field
values and counts are the real ones; summaries are grey bars, and no client,
person or date appears. Workflow: Pending Review -> Risk Accepted / Risk Live /
Risk Closed / Risk Cancelled. At capture: 168 risks, 167 Pending Review, RR-20
Risk Accepted with five sub-tasks.

Animation is SMIL only: the site-wide CSP blocks inline <style>, and SMIL needs
none. Each file has a -still twin (animations stripped, so base attributes
are the resting frame, matching the real data) that index.html serves to
prefers-reduced-motion.

Run: python3 scripts/build-anim.py
"""
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "assets" / "anim"
INK, PAPER, AIR, MIST = "#1E1E1E", "#FEFEFE", "#8DB3FF", "#DEDEDE"
BAR, DIM = "#C9C9C9", "#666666"
HIGH, MEDIUM = "#E5493A", "#F79232"  # Jira's priority colours
MONO = "Menlo, ui-monospace, monospace"
SANS = "Helvetica, Arial, sans-serif"


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="{MONO}">\n{body}\n</svg>\n')


def text(x, y, s, size=11, fill=INK, anchor="start", extra=""):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{extra}>{s}</text>'


def anim(attr, values, times, dur):
    return (f'<animate attributeName="{attr}" values="{values}" keyTimes="{times}" dur="{dur}" '
            f'repeatCount="indefinite"/>')


def fade(values, times, dur):
    """Opacity keyframes; the element's base opacity is the still frame."""
    return anim("opacity", values, times, dur)


def show(at, dur, end=".92"):
    """Hidden until `at`, then visible until the loop fades out."""
    return fade("0;0;1;1;0", f"0;{at};{float(at)+.03:.2f};{end};1", dur)


def chrome(w, h, title, right="", bar=INK, fg=PAPER, panel=MIST, rule=INK):
    """The site's window: panel, double rule, title bar."""
    return "\n".join([
        f'<rect x=".5" y=".5" width="{w-1}" height="{h-1}" fill="{panel}" stroke="{rule}"/>',
        f'<rect x="3.5" y="3.5" width="{w-7}" height="{h-7}" fill="none" stroke="{rule}"/>',
        f'<rect x="4" y="4" width="{w-8}" height="22" fill="{bar}"/>',
        text(12, 19, title, 12, fg),
        text(w - 12, 19, right, 12, fg, "end") if right else "",
    ])


def bars(x, y, widths, fill=BAR, gap=10, h=6):
    return "".join(f'<rect x="{x}" y="{y + i*gap}" width="{w}" height="{h}" fill="{fill}"/>'
                   for i, w in enumerate(widths))


def priority(x, y, level, label=True, fill=INK, size=11):
    """Jira's priority glyph: red chevrons for High, orange bars for Medium."""
    if level == "High":
        g = (f'<path d="M{x} {y-2} l4 -4 l4 4 M{x} {y+2} l4 -4 l4 4" fill="none" '
             f'stroke="{HIGH}" stroke-width="1.6"/>')
    else:
        g = (f'<path d="M{x} {y-4} h8 M{x} {y} h8" fill="none" stroke="{MEDIUM}" stroke-width="1.8"/>')
    return g + (text(x + 14, y + 3, level, size, fill) if label else "")


def unassigned(cx, cy, r=8, fill="#D0D0D0", stroke="#666"):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'
            f'<circle cx="{cx}" cy="{cy-2.5}" r="{r*.3:.1f}" fill="none" stroke="{stroke}"/>'
            f'<path d="M{cx-r*.5:.1f} {cy+r*.6:.1f} a{r*.5:.1f} {r*.45:.1f} 0 0 1 {r:.1f} 0" fill="none" stroke="{stroke}"/>')


def chip(x, y, label, w, filled=False, size=10):
    """A Jira status lozenge; Risk Accepted is filled in the site's air blue."""
    fill = AIR if filled else PAPER
    return (f'<rect x="{x+.5}" y="{y+.5}" width="{w}" height="17" fill="{fill}" stroke="{INK if filled else DIM}"/>'
            + text(x + w/2 + .5, y + 12.5, label, size, INK, "middle"))


# --- 1. queue (hero): the Risk Register board. The AI workforce has drafted
# 168 risks; 167 wait in Pending Review. A person accepts one: it moves to
# Risk Accepted and the counts change.
def queue():
    W, H, D = 368, 300, "9s"
    CW, LX, RX, TOP = 166, 12, 190, 34
    p = [chrome(W, H, "risk register", "board")]
    for x, name in [(LX, "Pending Review"), (RX, "Risk Accepted")]:
        p.append(f'<rect x="{x}" y="{TOP}" width="{CW}" height="{H-TOP-10}" fill="#E9E9E9"/>')
        p.append(text(x + 8, TOP + 15, name, 10))
    # column counts: 167 / 1 at rest; 166 / 2 once the risk is accepted
    p.append(f'<g>{fade("1;1;0;0;1", "0;.42;.44;.92;1", D)}{text(LX + 112, TOP + 15, "167", 10, DIM)}</g>')
    p.append(f'<g opacity="0">{show(".42", D)}{text(LX + 112, TOP + 15, "166", 10, DIM)}</g>')
    p.append(f'<g>{fade("1;1;0;0;1", "0;.42;.44;.92;1", D)}{text(RX + 106, TOP + 15, "1", 10, DIM)}</g>')
    p.append(f'<g opacity="0">{show(".42", D)}{text(RX + 106, TOP + 15, "2", 10, DIM)}</g>')

    def card(x, y, key, level, widths, sub=False):
        h = 74 if sub else 56
        s = (f'<rect x="{x+4.5}" y="{y+.5}" width="{CW-9}" height="{h}" fill="{PAPER}" stroke="#9A9A9A"/>'
             + bars(x + 14, y + 10, widths)
             + text(x + 14, y + 47, key, 10) + priority(x + 112, y + 44, level, label=False)
             + unassigned(x + CW - 22, y + 43))
        if sub:
            s += (f'<line x1="{x+5}" y1="{y+56}" x2="{x+CW-5}" y2="{y+56}" stroke="#D0D0D0"/>'
                  + text(x + 14, y + 69, "Subtasks", 9, DIM) + text(x + 70, y + 69, "0/5", 9, DIM))
        return s

    # Risk Accepted already holds RR-20
    p.append(card(RX, TOP + 24, "RR-20", "Medium", [118, 132, 86], sub=True))
    # Pending Review: RR-9..RR-11 shift up after RR-8 leaves
    p.append(f'<clipPath id="pc"><rect x="{LX}" y="{TOP+22}" width="{CW}" height="{H-TOP-32}"/></clipPath>')
    p.append('<g clip-path="url(#pc)"><g>'
             f'<animateTransform attributeName="transform" type="translate" values="0,0;0,0;0,-62;0,-62;0,0" '
             f'keyTimes="0;.44;.52;.92;1" dur="{D}" repeatCount="indefinite"/>')
    for i, (key, level, ws) in enumerate([("RR-9", "Medium", [128, 104, 60]), ("RR-10", "High", [120, 136, 92]),
                                          ("RR-11", "Medium", [134, 98, 70]), ("RR-12", "Medium", [110, 126, 80])]):
        p.append(card(LX, TOP + 24 + 62 * (i + 1), key, level, ws))
    p.append("</g></g>")
    # RR-8: lifted out of Pending Review and dropped into Risk Accepted
    p.append('<g>'
             f'<animateTransform attributeName="transform" type="translate" '
             f'values="0,0;0,0;0,-4;178,78;178,86;178,86;0,0" keyTimes="0;.12;.16;.36;.4;.92;1" '
             f'calcMode="spline" keySplines="0 0 1 1;.4 0 .2 1;.4 0 .2 1;.4 0 .2 1;0 0 1 1;0 0 1 1" '
             f'dur="{D}" repeatCount="indefinite"/>'
             + fade("0;1;1;0", "0;.04;.92;1", D)
             + card(LX, TOP + 24, "RR-8", "High", [124, 140, 96]) + "</g>")
    return svg(W, H, "\n".join(p))


# --- 2. assess (beside "Our answer"): RR-20, the risk that was accepted. Its
# fields are filled in, five sub-tasks are raised, and it is accepted.
def assess():
    W, H, D = 300, 386, "10s"
    p = [chrome(W, H, "RR-20", "risk"),
         f'<rect x="12" y="34" width="{W-24}" height="{H-46}" fill="{PAPER}" stroke="{INK}"/>',
         bars(22, 46, [236, 204])]
    # status: Pending Review, then Risk Accepted
    p.append(f'<g opacity="0">{fade("1;1;0;0;1", "0;.74;.77;.92;1", D)}{chip(22, 66, "Pending Review", 112)}</g>')
    p.append(f'<g>{fade("0;0;1;1;0", "0;.74;.77;.92;1", D)}{chip(22, 66, "Risk Accepted", 112, filled=True)}</g>')
    fields = [("Function Impacted", None), ("Review Interval", "Annually"), ("Review Cadence", "Periodic"),
              ("Risk Probability", "4 - Likely"), ("Risk Impact", "3 - Moderate"), ("Risk Score", "12"),
              ("Reviewed Date", "Add date")]
    for i, (label, value) in enumerate(fields):
        y = 110 + i * 24
        p.append(text(22, y, label, 10, DIM))
        at = f"{.06 + i*.06:.2f}"
        if value is None:
            v = f'<rect x="160.5" y="{y-11.5}" width="96" height="16" fill="{PAPER}" stroke="#9A9A9A"/>' + \
                f'<rect x="168" y="{y-6}" width="80" height="5" fill="{BAR}"/>'
        elif value == "Add date":
            v = text(161, y, value, 10, "#9A9A9A")
        elif value == "12":
            v = text(161, y + 1, value, 13, INK, extra=f' font-family="{SANS}" font-weight="500"')
        else:
            w = 9 + 6.1 * len(value)
            v = f'<rect x="160.5" y="{y-11.5}" width="{w:.0f}" height="16" fill="{PAPER}" stroke="{INK}"/>' + \
                text(165, y, value, 10)
        p.append(f'<g>{show(at, D)}{v}</g>')
    # sub-tasks: a review and four mitigations, raised one by one
    p.append(text(22, 290, "Subtasks", 11) + text(W - 22, 290, "0% Done", 9, DIM, "end"))
    p.append(f'<rect x="22" y="297" width="{W-44}" height="4" fill="#9A9A9A"/><rect x="22" y="297" width="52" height="4" fill="#2F6FEB"/>')
    # a review and four mitigations; two shown, the rest summarised
    subs = [("RR-176", "Open", [64]), ("RR-177", "Pending Review", [84])]
    for i, (key, status, ws) in enumerate(subs):
        y = 312 + i * 21
        row = (text(22, y + 12, key, 9, "#2F6FEB", extra=' text-decoration="underline"')
               + bars(70, y + 5, ws, gap=0) + priority(170, y + 10, "Medium", label=False)
               + chip(186, y, status, 92 if status != "Open" else 40, size=9))
        p.append(f'<g>{show(f"{.5 + i*.05:.2f}", D)}{row}</g>')
    p.append(f'<g>{show(".6", D)}{text(22, 368, "+3 more", 9, DIM)}</g>')
    return svg(W, H, "\n".join(p))


# --- 3. register (under the terminal): the list view. Rows are written in one
# after another; the last one, RR-20, is accepted.
def register():
    W, D = 736, "12s"
    BG, RULE, TXT, LINK = "#141414", "#555", "#D6D6D6", "#8DB3FF"
    rows = [("RR-17", "Medium", (330, 210)), ("RR-18", "Medium", (380, 170)),
            ("RR-19", "Medium", (300, 260)), ("RR-20", "Medium", (350, 230))]
    H = 82 + len(rows) * 34 + 34
    p = [f'<rect x=".5" y=".5" width="{W-1}" height="{H-1}" fill="{BG}" stroke="{RULE}"/>',
         f'<line x1="0" y1="30" x2="{W}" y2="30" stroke="{RULE}"/>',
         text(12, 20, "risk register · list", 12, "#AAAAAA"),
         text(W - 12, 20, "client instance", 12, "#AAAAAA", "end")]
    for x, h in [(16, "Work"), (500, "Priority"), (610, "Status")]:
        p.append(text(x, 54, h, 11, "#8A8A8A"))
    p.append(f'<line x1="12" y1="64" x2="{W-12}" y2="64" stroke="#333"/>')
    for i, (key, level, ws) in enumerate(rows):
        y = 70 + i * 34
        last = i == len(rows) - 1
        row = (text(16, y + 20, key, 11, LINK, extra=' text-decoration="underline"')
               + f'<rect x="72" y="{y+11}" width="{ws[0]}" height="6" fill="#3A3A3A"/>'
               + f'<rect x="72" y="{y+19}" width="{ws[1]}" height="6" fill="#3A3A3A"/>'
               + priority(500, y + 17, level, fill=TXT)
               + f'<line x1="12" y1="{y+33}" x2="{W-12}" y2="{y+33}" stroke="#262626"/>')
        status = (f'<rect x="610.5" y="{y+7.5}" width="104" height="18" fill="none" stroke="#777"/>'
                  + text(662.5, y + 20, "Pending Review", 10, "#BBBBBB", "middle"))
        if last:
            status = (f'<g opacity="0">{fade("1;1;0;0;1", "0;.62;.65;.92;1", D)}{status}</g>'
                      f'<g>{fade("0;0;1;1;0", "0;.62;.65;.92;1", D)}'
                      f'<rect x="610" y="{y+7}" width="104" height="19" fill="{AIR}"/>'
                      + text(662, y + 20, "Risk Accepted", 10, INK, "middle") + "</g>")
        p.append(f'<g>{show(f"{.05 + i*.1:.2f}", D)}{row}{status}</g>')
    y = 70 + len(rows) * 34
    p.append(text(W / 2, y + 22, "50 of 168", 11, "#AAAAAA", "middle"))
    return svg(W, H, "\n".join(p))


# --- The register as written: every risk in creation order, with its real
# priority, and the seconds after the first risk at which it was written.
PRIO = ("HMHMMMMHMMMMMMMMMMMMHMHMMMMMMHMMMHHXMHMMHHHHHMXMMMHMMMXMMMMMMMMMMMLMMMMMMMMHMMHMMHMMHHMMMM"
        "HMHMHHMMMMMMMMMXMHHHMMXMMHMMMHMMMHHMMMMMMMHHMMMHMMHMHHMMMMHMHMMHMMMMMMMMMMMMMM")
SECS = [0, 57, 58, 60, 62, 63, 65, 66, 68, 69, 71, 73, 74, 75, 77, 79, 80, 82, 83, 85, 86, 88, 89, 91, 93, 94, 96,
        98, 99, 101, 102, 104, 106, 107, 109, 110, 112, 114, 115, 117, 118, 120, 121, 123, 125, 126, 128, 130, 131,
        133, 134, 136, 138, 139, 141, 142, 144, 145, 147, 148, 150, 151, 153, 154, 156, 157, 159, 160, 162, 163, 165,
        166, 168, 169, 174, 175, 177, 178, 180, 181, 183, 184, 186, 188, 189, 191, 192, 194, 195, 197, 198, 200, 202,
        203, 205, 206, 208, 210, 211, 213, 214, 216, 218, 219, 221, 222, 224, 226, 227, 229, 230, 232, 233, 235, 237,
        238, 240, 241, 243, 245, 246, 248, 249, 251, 252, 254, 255, 257, 258, 260, 262, 263, 265, 266, 268, 270, 271,
        272, 274, 275, 277, 278, 280, 281, 283, 284, 286, 288, 296, 298, 299, 301, 302, 304, 305, 307, 308, 310, 311,
        313, 314, 316, 318, 319, 321, 322, 324, 326]
PER_MINUTE = [1, 20, 37, 38, 38, 34]   # risks written in each clock minute
RR20 = 12                              # RR-20's place in the order written
NAMES = {"X": "Highest", "H": "High", "M": "Medium", "L": "Low"}
SHADE = {"X": INK, "H": "#4A4A4A", "M": "#9A9A9A", "L": "#D0D0D0"}
assert len(PRIO) == len(SECS) == sum(PER_MINUTE) == 168 and SECS[-1] == 326
assert {k: PRIO.count(k) for k in "XHML"} == {"X": 5, "H": 40, "M": 122, "L": 1}

COLS, CELL, GAP, GX, GY = 14, 20, 4, 32, 58


def cell_xy(i):
    return GX + (i % COLS) * (CELL + GAP), GY + (i // COLS) * (CELL + GAP)


def legend(y, items):
    x, out = 32, []
    for label, fill, stroke in items:
        out.append(f'<rect x="{x+.5}" y="{y-9.5}" width="10" height="10" fill="{fill}" stroke="{stroke}"/>'
                   + text(x + 15, y, label, 10))
        x += 22 + 6.1 * len(label)
    return "".join(out)


# --- written: AI execution. 168 cells appear at the real pace they were written.
def written():
    W, H, D = 400, 414, 12.0
    p = [chrome(W, H, "AI execution", "risk register")]
    for i, (k, t) in enumerate(zip(PRIO, SECS)):
        x, y = cell_xy(i)
        at = .04 + .66 * t / 326
        p.append(f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" fill="{SHADE[k]}">'
                 + fade("0;0;1;1;0", f"0;{at:.3f};{at+.01:.3f};.93;1", f"{D}s") + "</rect>")
    gb = GY + 12 * (CELL + GAP) + 6
    # the clock: a bar that runs for the 5 min 26 s, scaled
    p.append(f'<rect x="32" y="{gb}" width="336" height="4" fill="#C9C9C9"/>'
             f'<rect x="32" y="{gb}" width="336" height="4" fill="{INK}">'
             f'<animate attributeName="width" values="0;0;336;336;0" keyTimes="0;.04;.7;.93;1" dur="{D}s" repeatCount="indefinite"/></rect>')
    p.append(text(32, gb + 24, "168", 18, INK, extra=f' font-family="{SANS}" font-weight="500"')
             + text(70, gb + 24, "risks written", 11) + text(W - 32, gb + 24, "5 min 26 s", 11, INK, "end"))
    p.append(legend(gb + 44, [(NAMES[k], SHADE[k], SHADE[k]) for k in "XHML"]))
    return svg(W, H, "\n".join(p))


# --- decided: Human authority. The same 168; one has been accepted by a person.
def decided():
    W, H, D = 400, 414, "6s"
    p = [chrome(W, H, "Human authority", "risk register")]
    for i in range(168):
        x, y = cell_xy(i)
        if i != RR20:
            p.append(f'<rect x="{x+.5}" y="{y+.5}" width="{CELL-1}" height="{CELL-1}" fill="{PAPER}" stroke="#9A9A9A"/>')
    x, y = cell_xy(RR20)
    p.append(f'<rect x="{x}" y="{y}" width="{CELL}" height="{CELL}" fill="{AIR}" stroke="{INK}"/>')
    p.append(f'<rect x="{x-4.5}" y="{y-4.5}" width="{CELL+9}" height="{CELL+9}" fill="none" stroke="{INK}">'
             + fade("0;1;1;0;0", "0;.15;.6;.75;1", D) + "</rect>")
    # callout from the accepted cell
    p.append(f'<rect x="{x+CELL/2-148}" y="{y-26}" width="148" height="17" fill="{INK}"/>'
             + text(x + CELL / 2 - 142, y - 14, "RR-20 · Risk Accepted", 10, PAPER)
             + f'<line x1="{x+CELL/2}" y1="{y-9}" x2="{x+CELL/2}" y2="{y-5}" stroke="{INK}"/>')
    gb = GY + 12 * (CELL + GAP) + 6
    p.append(f'<rect x="32" y="{gb}" width="336" height="4" fill="#C9C9C9"/><rect x="32" y="{gb}" width="2" height="4" fill="{AIR}"/>')
    p.append(text(32, gb + 24, "1", 18, INK, extra=f' font-family="{SANS}" font-weight="500"')
             + text(48, gb + 24, "accepted by a person", 11) + text(W - 32, gb + 24, "167 to review", 11, INK, "end"))
    p.append(legend(gb + 44, [("Risk Accepted", AIR, INK), ("Pending Review", PAPER, "#9A9A9A")]))
    return svg(W, H, "\n".join(p))


def glyph(x, y, level):
    """Jira-style priority marks, including Highest and Low."""
    if level == "Highest":
        return (f'<path d="M{x} {y-5} l4 -4 l4 4 M{x} {y-1} l4 -4 l4 4 M{x} {y+3} l4 -4 l4 4" fill="none" '
                f'stroke="#CD1317" stroke-width="1.6"/>')
    if level == "Low":
        return f'<path d="M{x} {y-4} l4 4 l4 -4 M{x} {y} l4 4 l4 -4" fill="none" stroke="#2A8735" stroke-width="1.6"/>'
    return priority(x, y, level, label=False)


# --- priority: the register by priority, bars growing to the real counts.
def priority_chart():
    W, H, D = 420, 236, "8s"
    p = [chrome(W, H, "risk register · by priority", "168")]
    p.append(f'<rect x="12" y="34" width="{W-24}" height="{H-46}" fill="{PAPER}" stroke="{INK}"/>')
    track = 196
    for i, k in enumerate("XHML"):
        n, y = PRIO.count(k), 66 + i * 38
        w = max(2, round(track * n / 168))
        p.append(glyph(26, y, NAMES[k]) + text(42, y + 3, NAMES[k], 11))
        p.append(f'<rect x="112" y="{y-8}" width="{track}" height="14" fill="#E4E4E4"/>'
                 f'<rect x="112" y="{y-8}" width="{w}" height="14" fill="{SHADE[k] if k != "L" else "#8A8A8A"}">'
                 f'<animate attributeName="width" values="0;0;{w};{w};0" keyTimes="0;{.05+i*.06:.2f};{.3+i*.06:.2f};.93;1" '
                 f'dur="{D}" repeatCount="indefinite"/></rect>')
        p.append(text(W - 24, y + 4, f"{n}", 12, INK, "end", extra=f' font-family="{SANS}" font-weight="500"')
                 + text(112 + track + 8, y + 4, f"{100*n/168:.1f}%", 9, DIM))
    p.append(text(26, H - 20, "each risk arrives scored for probability and impact", 9, DIM))
    return svg(W, H, "\n".join(p))


# --- rate: risks written in each clock minute.
def rate():
    W, H, D = 420, 236, "8s"
    p = [chrome(W, H, "risks written per minute", "peak 38")]
    p.append(f'<rect x="12" y="34" width="{W-24}" height="{H-46}" fill="{PAPER}" stroke="{INK}"/>')
    base, top, bw = 186, 64, 40
    for t in range(0, 41, 10):
        y = base - (base - top) * t / 38
        if t <= 38:
            p.append(f'<line x1="40" y1="{y:.0f}" x2="{W-24}" y2="{y:.0f}" stroke="#E4E4E4"/>' + text(34, y + 3, str(t), 8, DIM, "end"))
    for i, n in enumerate(PER_MINUTE):
        h = (base - top) * n / 38
        x = 56 + i * 58
        p.append(f'<rect x="{x}" y="{base-h:.0f}" width="{bw}" height="{h:.0f}" fill="{INK}">'
                 f'<animate attributeName="height" values="0;0;{h:.0f};{h:.0f};0" keyTimes="0;{.05+i*.08:.2f};{.2+i*.08:.2f};.93;1" dur="{D}" repeatCount="indefinite"/>'
                 f'<animate attributeName="y" values="{base};{base};{base-h:.0f};{base-h:.0f};{base}" keyTimes="0;{.05+i*.08:.2f};{.2+i*.08:.2f};.93;1" dur="{D}" repeatCount="indefinite"/></rect>')
        p.append(f'<g>{fade("0;0;1;1;0", f"0;{.2+i*.08:.2f};{.23+i*.08:.2f};.93;1", D)}'
                 + text(x + bw / 2, base - h - 6, str(n), 11, INK, "middle") + "</g>")
        p.append(text(x + bw / 2, base + 14, f"min {i+1}", 9, DIM, "middle"))
    p.append(text(26, H - 20, "after the first, one every 1.6 s", 9, DIM))
    return svg(W, H, "\n".join(p))


def still(s):
    return re.sub(r"<animate(Transform)?\b[^>]*/>", "", s)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # the same data for site.js (live feed, replay); one source of truth
    import json
    (OUT.parent / "register.json").write_text(json.dumps({"first": 8, "prio": PRIO, "secs": SECS}, separators=(",", ":")) + "\n")
    for name, build in [("queue", queue), ("assess", assess), ("register", register), ("written", written),
                        ("decided", decided), ("priority", priority_chart), ("rate", rate)]:
        s = build()
        (OUT / f"{name}.svg").write_text(s)
        (OUT / f"{name}-still.svg").write_text(still(s))
        print(f"{name}.svg {len(s)} bytes")


if __name__ == "__main__":
    main()
