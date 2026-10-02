#!/usr/bin/env python3
"""Build the site's animated illustrations into site/assets/anim/.

Stylised redraws of Oxygn's real work queues (a risk register): AI drafts the
work, it waits for review, a qualified person signs it off. No screenshot
pixels and no client text: every line of "text" is a grey bar.

Animation is SMIL only: the site-wide CSP blocks inline <style>, and SMIL needs
none. Each file has a -still twin (animations stripped, so base attributes
are the resting frame) that index.html serves to prefers-reduced-motion.

Run: python3 scripts/build-anim.py
"""
import re
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "assets" / "anim"
INK, PAPER, AIR, SAGE, MIST = "#1E1E1E", "#FEFEFE", "#8DB3FF", "#ABBAB9", "#DEDEDE"
MONO = "Menlo, ui-monospace, monospace"
SANS = "Helvetica, Arial, sans-serif"
EASE = "0.4 0 0.2 1"


def svg(w, h, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'font-family="{MONO}">\n{body}\n</svg>\n')


def text(x, y, s, size=11, fill=INK, anchor="start", family=None, extra=""):
    fam = f' font-family="{family}"' if family else ""
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{fam}{extra}>{s}</text>'


def fade(values, times, dur, begin="0s"):
    """Opacity keyframes; base opacity attribute is the still frame."""
    return (f'<animate attributeName="opacity" values="{values}" keyTimes="{times}" dur="{dur}" '
            f'begin="{begin}" repeatCount="indefinite"/>')


def chrome(w, h, title, right=""):
    """The site's window: mist panel, double ink rule, ink title bar."""
    return "\n".join([
        f'<rect x=".5" y=".5" width="{w-1}" height="{h-1}" fill="{MIST}" stroke="{INK}"/>',
        f'<rect x="3.5" y="3.5" width="{w-7}" height="{h-7}" fill="none" stroke="{INK}"/>',
        f'<rect x="4" y="4" width="{w-8}" height="22" fill="{INK}"/>',
        text(12, 19, title, 12, PAPER),
        text(w - 12, 19, right, 12, PAPER, "end") if right else "",
    ])


def bars(x, y, widths, fill, gap=10, h=6):
    return "".join(f'<rect x="{x}" y="{y + i*gap}" width="{w}" height="{h}" fill="{fill}"/>'
                   for i, w in enumerate(widths))


# --- 1. queue: the hero. Work drafted by AI joins the review queue; the oldest
# item gets signed off and leaves. Five cards cycle through four slots.
def queue():
    W, H, P, TOP = 368, 300, 58, 58
    D = 12.0  # seconds per card cycle; a new card every D/5
    cards = [
        ("R-08", [212, 168], AIR), ("R-09", [236, 120], SAGE), ("R-10", [190, 204], AIR),
        ("R-11", [224, 150], SAGE), ("R-12", [200, 180], AIR),
    ]
    pos = ";".join(f"0,{v}" for v in [-P, 0, 0, P, P, 2*P, 2*P, 3*P, 3*P, 4*P, 4*P])
    kt = "0;.06;.2;.26;.4;.46;.6;.66;.8;.86;1"
    parts = [chrome(W, H, "oxygn workforce", ""),
             f'<circle cx="{W-50}" cy="15" r="3.5" fill="{AIR}">'
             f'<animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>',
             text(W - 12, 19, "live", 12, PAPER, "end"),
             text(16, 46, "pending review", 11),
             text(W - 16, 46, "drafted by ai · signed off by people", 9, "#555", "end"),
             f'<clipPath id="q"><rect x="12" y="{TOP-2}" width="{W-24}" height="{H-TOP-10}"/></clipPath>',
             '<g clip-path="url(#q)">']
    for k, (key, ws, dot) in enumerate(cards):
        begin = f"{-(0.1 + 0.2*k) * D:.2f}s"
        still_y = k * P if k < 4 else 4 * P
        still_op = 1 if k < 4 else 0
        stamp_op = 1 if k == 3 else 0
        x, y = 12, TOP
        parts.append(
            f'<g transform="translate(0,{still_y})" opacity="{still_op}">'
            f'<animateTransform attributeName="transform" type="translate" values="{pos}" keyTimes="{kt}" '
            f'calcMode="spline" keySplines="{";".join([EASE]*10)}" dur="{D}s" begin="{begin}" repeatCount="indefinite"/>'
            + fade("0;1;1;0;0", "0;.06;.8;.86;1", f"{D}s", begin)
            + f'<rect x="{x+.5}" y="{y+.5}" width="{W-25}" height="50" fill="{PAPER}" stroke="{INK}"/>'
            + bars(x + 12, y + 10, ws, "#C9C9C9")
            + text(x + 12, y + 42, key, 10)
            + f'<rect x="{x+268}" y="{y+34}" width="8" height="8" fill="{dot}"/>'
            + f'<circle cx="{x+322}" cy="{y+24}" r="9" fill="none" stroke="{INK}"/>'
            + text(x + 322, y + 27, "ai", 8, INK, "middle")
            # the sign-off stamp, applied while the card sits in the last slot
            + f'<g opacity="{stamp_op}" transform="rotate(-5 {x+214} {y+22})">'
            + fade("0;0;1;1;0", "0;.68;.71;.86;1", f"{D}s", begin)
            + f'<rect x="{x+168}" y="{y+12}" width="92" height="20" fill="{AIR}" stroke="{INK}"/>'
            + text(x + 214, y + 26, "signed off", 10, INK, "middle")
            + "</g></g>")
    parts.append("</g>")
    return svg(W, H, "\n".join(parts))


# --- 2. assess: one risk, assessed by AI, then signed off by a qualified person.
def assess():
    W, H, D = 300, 300, "9s"
    rows = [("probability", 112), ("impact", 144), ("score", 176)]
    p = [chrome(W, H, "risk assessment", "R-12"),
         f'<rect x="12" y="34" width="{W-24}" height="{H-46}" fill="{PAPER}" stroke="{INK}"/>']
    # the drafted description (bars), written line by line
    for i, w in enumerate([236, 250, 198, 120]):
        p.append(f'<rect x="24" y="{48 + i*11}" width="{w}" height="6" fill="#C9C9C9">'
                 f'<animate attributeName="width" values="0;0;{w};{w};0" keyTimes="0;{.02+i*.04:.2f};{.06+i*.04:.2f};.95;1" '
                 f'dur="{D}" repeatCount="indefinite"/></rect>')
    p.append(f'<line x1="24" y1="92" x2="{W-24}" y2="92" stroke="{INK}" stroke-dasharray="2 3"/>')
    for label, y in rows:
        p.append(text(24, y, label, 11))
    # values arrive one by one
    p.append(f'<g opacity="1">{fade("0;0;1;1;0", "0;.22;.25;.95;1", D)}'
             f'<rect x="150.5" y="{112-13.5}" width="96" height="19" fill="none" stroke="{INK}"/>'
             + text(198, 112, "4 · likely", 11, INK, "middle") + "</g>")
    p.append(f'<g opacity="1">{fade("0;0;1;1;0", "0;.3;.33;.95;1", D)}'
             f'<rect x="150.5" y="{144-13.5}" width="112" height="19" fill="none" stroke="{INK}"/>'
             + text(206, 144, "3 · moderate", 11, INK, "middle") + "</g>")
    p.append(f'<g opacity="0">{fade("0;0;1;1;0;0", "0;.38;.41;.46;.49;1", D)}'
             + text(152, 178, "4 × 3", 14, "#555") + "</g>")
    p.append(f'<g opacity="1">{fade("0;0;1;1;0", "0;.47;.5;.95;1", D)}'
             + text(152, 182, "12", 24, INK, family=SANS, extra=' font-weight="500"') + "</g>")
    # status: awaiting, then the qualified person signs
    p.append(f'<line x1="24" y1="204" x2="{W-24}" y2="204" stroke="{INK}"/>')
    p.append(f'<g opacity="0">{fade("0;0;1;1;0;0", "0;.52;.55;.7;.73;1", D)}'
             f'<rect x="24" y="218" width="{W-48}" height="26" fill="{MIST}" stroke="{INK}"/>'
             + text(W/2, 235, "awaiting qualified sign-off", 11, INK, "middle") + "</g>")
    p.append(f'<g opacity="1">{fade("0;0;1;1;0", "0;.7;.73;.95;1", D)}'
             f'<rect x="24" y="218" width="{W-48}" height="26" fill="{AIR}" stroke="{INK}"/>'
             + text(W/2, 235, "signed off · qualified person", 11, INK, "middle") + "</g>")
    # the signature: a pen stroke drawn under the status
    sig = "M40 270 c 10 -14 18 -14 20 0 s 12 12 22 -4 s 14 -10 18 2 s 16 6 26 -6 l 40 0"
    p.append(f'<path d="{sig}" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linecap="round" '
             f'stroke-dasharray="220" stroke-dashoffset="0">'
             f'<animate attributeName="stroke-dashoffset" values="220;220;0;0;220" keyTimes="0;.73;.86;.95;1" '
             f'dur="{D}" repeatCount="indefinite"/></path>')
    p.append(text(W - 24, 274, "reviewer", 10, "#555", "end"))
    return svg(W, H, "\n".join(p))


# --- 3. register: the whole register, items signed off one after another.
def register():
    W, H, D = 736, 302, 12.0
    BG, RULE, DIM, TXT = "#141414", "#555", "#777", "#D6D6D6"
    keys = ["R-08", "R-09", "R-10", "R-11", "R-12", "R-13"]
    prio = ["high", "medium", "high", "medium", "medium", "high"]
    widths = [(300, 220), (340, 180), (280, 250), (320, 160), (260, 230), (310, 200)]
    p = [f'<rect x=".5" y=".5" width="{W-1}" height="{H-1}" fill="{BG}" stroke="{RULE}"/>',
         f'<line x1="0" y1="30" x2="{W}" y2="30" stroke="{RULE}"/>',
         text(12, 20, "risk register", 12, "#AAAAAA"),
         text(W - 12, 20, "client instance", 12, "#AAAAAA", "end")]
    for x, h in [(16, "key"), (90, "item"), (520, "priority"), (606, "status")]:
        p.append(text(x, 52, h, 11, DIM))
    for i, k in enumerate(keys):
        y = 66 + i * 38
        t0 = 0.1 + 0.12 * i  # when this row is signed off
        signed = i < 3       # still frame: half the register done
        p.append(f'<line x1="12" y1="{y+34}" x2="{W-12}" y2="{y+34}" stroke="#262626"/>')
        # a brief highlight as the reviewer reaches the row
        p.append(f'<rect x="12" y="{y}" width="{W-24}" height="34" fill="{AIR}" opacity="0">'
                 f'<animate attributeName="opacity" values="0;0;.14;0;0" keyTimes="0;{t0-.03:.2f};{t0:.2f};{t0+.06:.2f};1" '
                 f'dur="{D}s" repeatCount="indefinite"/></rect>')
        p.append(text(16, y + 21, k, 11, TXT))
        p.append(bars(90, y + 10, widths[i], "#333333", gap=10))
        p.append(text(520, y + 21, prio[i], 11, "#AAAAAA"))
        p.append(f'<g opacity="{0 if signed else 1}">{fade("1;1;0;0;1", f"0;{t0:.2f};{t0+.02:.2f};.94;1", f"{D}s")}'
                 f'<rect x="606.5" y="{y+7.5}" width="112" height="19" fill="none" stroke="{DIM}"/>'
                 + text(662, y + 21, "pending review", 10, "#AAAAAA", "middle") + "</g>")
        p.append(f'<g opacity="{1 if signed else 0}">{fade("0;0;1;1;0", f"0;{t0:.2f};{t0+.02:.2f};.94;1", f"{D}s")}'
                 f'<rect x="606" y="{y+7}" width="112" height="20" fill="{AIR}"/>'
                 + text(662, y + 21, "signed off", 10, INK, "middle") + "</g>")
    return svg(W, H, "\n".join(p))


def still(s):
    s = re.sub(r"<animate(Transform)?\b[^>]*/>", "", s)
    return s


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, build in [("queue", queue), ("assess", assess), ("register", register)]:
        s = build()
        (OUT / f"{name}.svg").write_text(s)
        (OUT / f"{name}-still.svg").write_text(still(s))
        print(f"{name}.svg {len(s)} bytes")


if __name__ == "__main__":
    main()
