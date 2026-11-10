#!/usr/bin/env python3
"""
generate-icons.py — build Ultron's application icons.

Produces entirely original, geometric artwork: a graphite plate with a
segmented crimson ring around a hexagonal core. No third-party or
copyrighted character imagery is used.

Outputs (overwritten):
    build/icon.png   512x512  application icon (About page, window)
    build/icon.ico   multi-size Windows icon (16-256)
    build/tray.png   32x32    tray icon (transparent background)

Requirements: Pillow + numpy (dev-time only; not a runtime dependency).

Usage:
    python3 scripts/generate-icons.py
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# ── Palette ────────────────────────────────────────────────────────────
GRAPHITE_CENTER = (34, 36, 40)
GRAPHITE_EDGE = (13, 14, 16)
CRIMSON_BRIGHT = (214, 62, 54)
CRIMSON_DEEP = (138, 24, 28)
SILVER = (198, 202, 208)

BUILD_DIR = Path(__file__).resolve().parent.parent / "build"
SS = 4  # supersampling factor


def radial_plate(size: int) -> Image.Image:
    """Dark graphite plate with a soft radial falloff."""
    y, x = np.mgrid[0:size, 0:size]
    cx = cy = size / 2

    # Normalised radius (0 centre → 1 corner)
    r = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (size / 2)
    r = np.clip(r, 0, 1) ** 1.4

    center = np.array(GRAPHITE_CENTER, dtype=float)
    edge = np.array(GRAPHITE_EDGE, dtype=float)

    rgb = center[None, None, :] * (1 - r)[..., None] + edge[None, None, :] * r[..., None]
    return Image.fromarray(rgb.astype(np.uint8), mode="RGB").convert("RGBA")


def rounded_mask(size: int, radius: int) -> Image.Image:
    """Anti-aliased rounded-square mask."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def draw_segmented_ring(draw: ImageDraw.ImageDraw, size: int, ring_r: float, width: float,
                        segments: int = 6, gap_deg: float = 16.0, start_deg: float = -90.0) -> None:
    """Crimson ring split into segments, with a bright-to-deep gradient."""
    cx = cy = size / 2
    span = 360.0 / segments
    for i in range(segments):
        a0 = start_deg + i * span + gap_deg / 2
        a1 = start_deg + (i + 1) * span - gap_deg / 2

        # Gradient across segments: brightest at the top-left
        t = i / max(segments - 1, 1)
        color = tuple(
            int(CRIMSON_BRIGHT[c] * (1 - t) + CRIMSON_DEEP[c] * t) for c in range(3)
        )

        box = (cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r)
        draw.arc(box, start=a0, end=a1, fill=color + (255,), width=int(width))


def draw_hexagon(draw: ImageDraw.ImageDraw, size: int, radius: float, width: int, color: tuple[int, int, int, int]) -> None:
    """Pointy-top hexagon outline."""
    cx = cy = size / 2
    points = [
        (
            cx + radius * math.cos(math.radians(60 * i - 90)),
            cy + radius * math.sin(math.radians(60 * i - 90)),
        )
        for i in range(6)
    ]
    draw.line(points + [points[0]], fill=color, width=width, joint="curve")


def build_icon(pixels: int = 512) -> Image.Image:
    """Full application icon."""
    size = pixels * SS

    plate = radial_plate(size)
    plate.putalpha(rounded_mask(size, radius=int(size * 0.22)))

    # Subtle top highlight (brushed-metal feel)
    gloss = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(gloss)
    gdraw.ellipse(
        (-size * 0.45, -size * 1.05, size * 1.45, size * 0.45),
        fill=(255, 255, 255, 12),
    )
    # Soften the light falloff so the plate reads as brushed metal, not a band
    gloss = gloss.filter(ImageFilter.GaussianBlur(size * 0.09))
    gloss.putalpha(Image.composite(gloss.split()[3], Image.new("L", (size, size), 0), rounded_mask(size, int(size * 0.22))))
    plate = Image.alpha_composite(plate, gloss)

    ring_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ring_layer)
    draw_segmented_ring(draw, size, ring_r=size * 0.335, width=size * 0.055)

    # Core: silver hexagon with a crimson centre
    draw_hexagon(draw, size, radius=size * 0.185, width=max(2, int(size * 0.012)), color=SILVER + (150,))
    draw.ellipse(
        (
            size / 2 - size * 0.062,
            size / 2 - size * 0.062,
            size / 2 + size * 0.062,
            size / 2 + size * 0.062,
        ),
        fill=CRIMSON_BRIGHT + (255,),
    )

    # Crimson glow behind the ring
    glow = ring_layer.filter(ImageFilter.GaussianBlur(size * 0.035))
    glow.putalpha(glow.split()[3].point(lambda v: int(v * 0.55)))

    plate = Image.alpha_composite(plate, glow)
    plate = Image.alpha_composite(plate, ring_layer)

    return plate.resize((pixels, pixels), Image.LANCZOS)


def build_tray(pixels: int = 32) -> Image.Image:
    """Simplified tray mark: ring + core, no plate (reads at 16-32 px)."""
    size = pixels * 8
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    draw_segmented_ring(draw, size, ring_r=size * 0.31, width=size * 0.075, gap_deg=20.0)
    draw.ellipse(
        (
            size / 2 - size * 0.115,
            size / 2 - size * 0.115,
            size / 2 + size * 0.115,
            size / 2 + size * 0.115,
        ),
        fill=CRIMSON_BRIGHT + (255,),
    )

    return layer.resize((pixels, pixels), Image.LANCZOS)


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    icon = build_icon(512)
    icon.save(BUILD_DIR / "icon.png")
    icon.save(
        BUILD_DIR / "icon.ico",
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )

    build_tray(32).save(BUILD_DIR / "tray.png")

    print(f"Wrote {BUILD_DIR / 'icon.png'}")
    print(f"Wrote {BUILD_DIR / 'icon.ico'}")
    print(f"Wrote {BUILD_DIR / 'tray.png'}")


if __name__ == "__main__":
    main()
