"""Writes app/favicon.ico from the BISTEC logo's square mark.

Split out from build-brand-assets.ts for one reason: sharp cannot encode ICO.
Everything else in the brand pipeline is sharp; this is the single exception.

Sizes stop at 48. Adding 64/128/256 takes the file from ~7 KB to ~57 KB and no
browser asks for them — the PNG icon covers every large-icon surface.
"""

import sys
from pathlib import Path

from PIL import Image

ALPHA = 8
ROOT = Path(__file__).resolve().parent.parent


def mark_box(im: Image.Image) -> tuple[int, int, int, int]:
    """The logo is mark + gap + wordmark, so the mark is the first run of
    occupied columns. Measured rather than hardcoded, for the same reason as in
    the TypeScript side."""
    alpha = im.getchannel("A")
    w, h = im.size
    px = alpha.load()

    x0 = None
    for x in range(w):
        on = any(px[x, y] > ALPHA for y in range(h))
        if on and x0 is None:
            x0 = x
        elif not on and x0 is not None:
            x1 = x - 1
            break
    else:
        raise SystemExit("could not find a mark: no gap after the first shape")

    ys = [y for y in range(h) if any(px[x, y] > ALPHA for x in range(x0, x1 + 1))]
    return (x0, ys[0], x1 + 1, ys[-1] + 1)


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: build-favicon.py <path-to-bistec-logo.png>")

    im = Image.open(sys.argv[1]).convert("RGBA")
    box = mark_box(im)
    mark = im.crop(box).resize((256, 256), Image.LANCZOS)

    out = ROOT / "app" / "favicon.ico"
    mark.save(out, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"  app/favicon.ico".ljust(40) + f"{out.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
