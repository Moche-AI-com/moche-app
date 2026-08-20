#!/usr/bin/env python3
"""Regenerate the animated Moche-AI cloche assets for the signup confirmation email.

Usage:
    pip install pillow
    python scripts/email/generate-cloche-assets.py

Outputs (commit these):
    public/email/moche-cloche-loop.gif     animated logo; frame 1 is the complete
                                           static mark, which is what Outlook
                                           2007-2019 desktop displays
    public/email/moche-cloche-static.png   plain static render, same geometry

Alternative: skip this script and upload the GIF shared in the Perplexity
thread to public/email/ via the GitHub web UI (web upload handles binary).
"""

import math
import os

from PIL import Image, ImageDraw

OUT_DIR = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "email")
)

W = H = 320
CX = W // 2
BASE_Y = 236

INK = (7, 11, 20)        # dark field
CYAN = (82, 203, 222)    # gradient start
BLUE = (118, 152, 249)   # gradient end
MINT = (51, 230, 211)    # inner dome
ORANGE = (255, 139, 92)  # floating knob

RADII = [112, 82, 52]
ARC_W = 15
DOME_R = 30
BAR_HALF = 132
BAR_TOP, BAR_BOT = BASE_Y + 14, BASE_Y + 28
KNOB_CY = BASE_Y - RADII[0] - 42


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def scale(color, factor):
    return tuple(min(255, max(0, int(round(v * factor)))) for v in color)


def grad_at(x):
    return lerp(CYAN, BLUE, min(1.0, max(0.0, x / W)))


def draw_frame(factors, knob_dy=0.0):
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)

    for ai, radius in enumerate(RADII):
        steps = 120
        for s in range(steps):
            a0 = 180.0 + 180.0 * s / steps
            a1 = a0 + 180.0 / steps + 0.4
            mid = math.radians((a0 + a1) / 2)
            x = CX + radius * math.cos(mid)
            d.arc(
                [CX - radius, BASE_Y - radius, CX + radius, BASE_Y + radius],
                a0, a1, fill=scale(grad_at(x), factors[ai]), width=ARC_W,
            )

    d.pieslice(
        [CX - DOME_R, BASE_Y - DOME_R, CX + DOME_R, BASE_Y + DOME_R],
        180, 360, fill=scale(MINT, factors[3]),
    )

    for i in range(BAR_HALF * 2):
        x = CX - BAR_HALF + i
        d.line([(x, BAR_TOP), (x, BAR_BOT)], fill=scale(grad_at(x), factors[4]))
    cap_r = (BAR_BOT - BAR_TOP) // 2
    d.ellipse([CX - BAR_HALF - cap_r, BAR_TOP, CX - BAR_HALF + cap_r, BAR_BOT],
              fill=scale(grad_at(CX - BAR_HALF), factors[4]))
    d.ellipse([CX + BAR_HALF - cap_r, BAR_TOP, CX + BAR_HALF + cap_r, BAR_BOT],
              fill=scale(grad_at(CX + BAR_HALF), factors[4]))

    ky = KNOB_CY + knob_dy
    knob = scale(ORANGE, factors[5])
    d.rounded_rectangle([CX - 7, ky - 34, CX + 7, ky - 4], radius=6, fill=knob)
    d.ellipse([CX - 17, ky - 17, CX + 17, ky + 17], fill=knob)
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    frames = []
    total = 18
    for f in range(total):
        phase = 2 * math.pi * f / total
        factors = [
            1 + 0.30 * math.sin(phase - 1.7),    # outer arc
            1 + 0.30 * math.sin(phase - 0.85),   # middle arc
            1 + 0.30 * math.sin(phase),          # inner arc
            1 + 0.22 * math.sin(phase + 0.6),    # mint dome
            1 + 0.10 * math.sin(phase - 2.55),   # base bar
            1 + 0.16 * math.sin(phase + 1.1),    # knob
        ]
        frame = draw_frame(factors, 3.0 * math.sin(phase))
        frames.append(frame.convert("P", palette=Image.ADAPTIVE, colors=256, dither=Image.NONE))

    gif_path = os.path.join(OUT_DIR, "moche-cloche-loop.gif")
    frames[0].save(gif_path, save_all=True, append_images=frames[1:],
                   duration=60, loop=0, optimize=True)

    png_path = os.path.join(OUT_DIR, "moche-cloche-static.png")
    draw_frame([1, 1, 1, 1, 1, 1], 0).save(png_path)

    print("wrote", gif_path)
    print("wrote", png_path)


if __name__ == "__main__":
    main()
