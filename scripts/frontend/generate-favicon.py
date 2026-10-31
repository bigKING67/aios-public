#!/usr/bin/env python3
"""Generate the AIOS lettermark icons in public/.

Layout: a 2x2 letter grid on an ink rounded square. A/I sit centered over the
O/S columns, so both rows share column axes, and the cap block is vertically
centered on the tile.

Usage (macOS, needs Helvetica Bold):
    uv run --with pillow python scripts/frontend/generate-favicon.py
    uv run --with pillow python scripts/frontend/generate-favicon.py --font /path/Bold.ttf --font-index 0

After regenerating, bump the ?v= query on the icon links in apps/web-vite/index.html.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = REPO_ROOT / "public"

# Geometry in 180px design units.
SIZE = 180
RADIUS = 36
FONT_SIZE = 74
ROW_GAP = 18
TRACKING = 4
INK = (34, 34, 34, 255)
PAPER = (255, 255, 255, 255)

SUPERSAMPLE = 8
ICO_SIZES = [16, 32, 48, 64, 128, 256]


def render(font_path: str, font_index: int) -> Image.Image:
    k = SUPERSAMPLE
    size = SIZE * k
    font = ImageFont.truetype(font_path, FONT_SIZE * k, index=font_index)
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=RADIUS * k, fill=INK)

    def box(ch: str) -> tuple[float, float, float, float]:
        return draw.textbbox((0, 0), ch, font=font, anchor="ls")

    cap_height = -box("I")[1]
    block = cap_height * 2 + ROW_GAP * k
    top = (size - block) / 2
    baselines = (top + cap_height, top + block)

    # Column axes come from the wider bottom row (O, S).
    o, s = box("O"), box("S")
    o_w, s_w = o[2] - o[0], s[2] - s[0]
    left = (size - (o_w + TRACKING * k + s_w)) / 2
    columns = (left + o_w / 2, left + o_w + TRACKING * k + s_w / 2)

    for row, baseline in zip(("AI", "OS"), baselines):
        for ch, center in zip(row, columns):
            b = box(ch)
            x = center - (b[2] - b[0]) / 2 - b[0]
            draw.text((x, baseline), ch, font=font, fill=PAPER, anchor="ls")

    return image


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--font", default="/System/Library/Fonts/Helvetica.ttc")
    parser.add_argument("--font-index", type=int, default=1, help="face index in a .ttc (Helvetica Bold = 1)")
    parser.add_argument("--out", type=Path, default=PUBLIC_DIR)
    args = parser.parse_args()

    master = render(args.font, args.font_index)
    png = master.resize((SIZE, SIZE), Image.LANCZOS)
    args.out.mkdir(parents=True, exist_ok=True)
    for name in ("favicon.png", "apple-touch-icon.png"):
        png.save(args.out / name, optimize=True)
    ico_frames = [master.resize((n, n), Image.LANCZOS) for n in ICO_SIZES]
    ico_frames[-1].save(args.out / "favicon.ico", sizes=[(n, n) for n in ICO_SIZES], append_images=ico_frames[:-1])
    print(f"wrote favicon.png, apple-touch-icon.png, favicon.ico -> {args.out}")


if __name__ == "__main__":
    main()
