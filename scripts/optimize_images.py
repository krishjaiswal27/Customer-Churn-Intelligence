"""Copy the images the site needs from assets/ into docs/assets/ as WebP.

Run from the repository root:
    python scripts/optimize_images.py

Originals in assets/ are only read, never modified. Prints each output's
pixel size (used for the width/height attributes in docs/index.html) and
file size, and warns if anything is over the 400 KB budget.
"""

from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets"
OUT = ROOT / "docs" / "assets"
BUDGET_KB = 400

# source path, output path, max width in px, trim the white export margin
IMAGES = [
    ("powerbi/executive_summary.jpg", "powerbi/executive_summary.webp", 1800, True),
    ("powerbi/segment_deep_dive.jpg", "powerbi/segment_deep_dive.webp", 1800, True),
    ("powerbi/customer_risk_scores.jpg", "powerbi/customer_risk_scores.webp", 1800, True),
    ("ml/shap_summary.png", "ml/shap_summary.webp", 1200, False),
    ("ml/shap_dot.png", "ml/shap_dot.webp", 1200, False),
    ("ml/roc_curve.png", "ml/roc_curve.webp", 1000, False),
    ("n8n/workflow.png", "n8n/workflow.webp", 1000, False),
]


def trim_white(im: Image.Image) -> Image.Image:
    """Crop the pure-white border Power BI adds around exported pages.

    The report canvas is #F2F2F2 (#F1F1F1 after JPEG), only 14 levels from
    white, so the threshold must sit below that or the crop eats into the
    canvas. 6 clears JPEG noise in the margin and stops at the canvas edge.
    """
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg).convert("L").point(lambda v: 255 if v > 6 else 0)
    box = diff.getbbox()
    return im.crop(box) if box else im


def main() -> None:
    for src_rel, out_rel, max_w, trim in IMAGES:
        src, out = SRC / src_rel, OUT / out_rel
        out.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as im:
            im = im.convert("RGB")
            if trim:
                im = trim_white(im)
            if im.width > max_w:
                im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
            quality = 82
            while True:
                im.save(out, "WEBP", quality=quality, method=6)
                kb = out.stat().st_size / 1024
                if kb <= BUDGET_KB or quality <= 50:
                    break
                quality -= 8
            flag = "  OVER BUDGET" if kb > BUDGET_KB else ""
            print(f"{out_rel:<40} {im.width}x{im.height}  {kb:6.0f} KB  q{quality}{flag}")


if __name__ == "__main__":
    main()
