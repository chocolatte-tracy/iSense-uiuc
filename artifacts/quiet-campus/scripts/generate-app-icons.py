"""Resize the team's original logo; never redraw or replace its artwork."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
source = root / "assets" / "isense-icon-source.jpg"
destination = root / "public" / "icons"
destination.mkdir(parents=True, exist_ok=True)
original = Image.open(source).convert("RGB")
if original.width != original.height:
    raise ValueError("Please supply a square logo to preserve the original artwork.")
for name, size in [
    ("isense-192.png", 192), ("isense-512.png", 512),
    ("apple-touch-icon.png", 180), ("favicon-32.png", 32),
]:
    original.resize((size, size), Image.Resampling.LANCZOS).save(destination / name, optimize=True)
maskable = Image.new("RGB", (512, 512), "#f3f8fc")
inner = original.resize((410, 410), Image.Resampling.LANCZOS)
maskable.paste(inner, (51, 51))
maskable.save(destination / "isense-maskable-512.png", optimize=True)
print("Generated 5 icons from the original iSense logo.")
