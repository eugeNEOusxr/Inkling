"""Generate EugeneousXR app icon PNGs and a multi-size ICO."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"

BG = (5, 6, 10)          # #05060a
ACCENT = (99, 102, 241)   # #6366f1
ACCENT_LIGHT = (129, 140, 248)
GRID = (30, 41, 59)
WHITE = (226, 232, 240)


def draw_logo(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = size * 0.12
    inner = size - 2 * pad

    # Rounded card
    radius = int(size * 0.18)
    d.rounded_rectangle(
        (pad, pad, pad + inner, pad + inner),
        radius=radius,
        fill=(15, 20, 35, 255),
        outline=ACCENT,
        width=max(1, size // 64),
    )

    # Calendar header bar
    header_h = int(inner * 0.22)
    d.rounded_rectangle(
        (pad, pad, pad + inner, pad + header_h),
        radius=radius,
        fill=ACCENT,
    )
    d.rectangle(
        (pad, pad + header_h - radius, pad + inner, pad + header_h),
        fill=ACCENT,
    )

    # Grid area
    grid_top = pad + header_h + int(inner * 0.06)
    grid_left = pad + int(inner * 0.08)
    grid_w = int(inner * 0.84)
    grid_h = int(inner * 0.62)
    if size >= 48:
        cols, rows = 7, 5
        cell_w = max(2, grid_w // cols)
        cell_h = max(2, grid_h // rows)
        for r in range(rows):
            for c in range(cols):
                x0 = grid_left + c * cell_w + 1
                y0 = grid_top + r * cell_h + 1
                x1 = min(pad + inner, x0 + cell_w - 2)
                y1 = min(pad + inner, y0 + cell_h - 2)
                if x1 <= x0 or y1 <= y0:
                    continue
                highlight = (r + c) % 3 == 0
                fill = (40, 48, 72, 255) if highlight else (22, 28, 45, 255)
                d.rounded_rectangle(
                    (x0, y0, x1, y1),
                    radius=max(1, size // 80),
                    fill=fill,
                )
    else:
        d.rectangle(
            (grid_left, grid_top, grid_left + grid_w, grid_top + grid_h),
            fill=(22, 28, 45, 255),
        )

    # Accent dot (notification)
    dot_r = max(3, size // 28)
    cx = pad + inner - int(inner * 0.18)
    cy = pad + int(inner * 0.2)
    d.ellipse(
        (cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r),
        fill=(251, 191, 36, 255),
    )

    # 3D hint line
    d.line(
        (pad + int(inner * 0.15), pad + int(inner * 0.78), pad + int(inner * 0.85), pad + int(inner * 0.92)),
        fill=ACCENT_LIGHT,
        width=max(2, size // 48),
    )

    return img


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)

    sizes_png = [192, 512]
    for s in sizes_png:
        img = draw_logo(s)
        img.save(ICONS / f"icon-{s}.png", "PNG")
        print(f"Wrote icons/icon-{s}.png")

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_images = [draw_logo(s).convert("RGBA") for s, _ in ico_sizes]
    ico_path = ICONS / "app-icon.ico"
    ico_images[0].save(
        ico_path,
        format="ICO",
        sizes=ico_sizes,
        append_images=ico_images[1:],
    )
    print(f"Wrote icons/app-icon.ico")

    desktop = Path.home() / "OneDrive" / "Desktop" / "NotebookCalender.ico"
    try:
        ico_images[0].save(
            desktop,
            format="ICO",
            sizes=ico_sizes,
            append_images=ico_images[1:],
        )
        print(f"Wrote {desktop}")
    except OSError as e:
        print(f"Desktop copy skipped: {e}")


if __name__ == "__main__":
    main()
