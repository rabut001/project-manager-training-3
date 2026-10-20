#!/usr/bin/env python3
"""原本上の切り出し範囲と画像一覧を、目視確認用に生成する。確認済みにはしない。"""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / ".cache/image-review"
OUT.mkdir(parents=True, exist_ok=True)


def montage(images, path, columns=5, width=500):
    rows = []
    for start in range(0, len(images), columns):
        group = images[start:start + columns]
        resized = []
        for label, image in group:
            image = image.convert("RGB")
            image.thumbnail((width, 1500))
            canvas = Image.new("RGB", (width, image.height + 30), "white")
            canvas.paste(image, (0, 30))
            ImageDraw.Draw(canvas).text((8, 8), label, fill="red")
            resized.append(canvas)
        row = Image.new("RGB", (columns * width, max(im.height for im in resized)), "#ddd")
        for i, image in enumerate(resized):
            row.paste(image, (i * width, 0))
        rows.append(row)
    canvas = Image.new("RGB", (columns * width, sum(im.height for im in rows)), "white")
    y = 0
    for row in rows:
        canvas.paste(row, (0, y)); y += row.height
    canvas.save(path)


def main():
    diagnostics = []
    for directory in sorted((ROOT / "public/data").iterdir()):
        if not directory.is_dir() or not (directory / "exam.json").exists():
            continue
        exam_id = directory.name
        records = json.loads((ROOT / "sources/ipa" / exam_id / "crops.json").read_text())
        montage([(f"{exam_id} Q{r['no']}", Image.open(ROOT / r["image"])) for r in records], OUT / f"{exam_id}-questions.png")
        pages = {}
        for record in records:
            pages.setdefault(record["page"], []).append(record)
        images = []
        document = pymupdf.open(ROOT / "sources/ipa" / exam_id / "questions.pdf")
        for number, crops in pages.items():
            page = document[number - 1]
            pix = page.get_pixmap(matrix=pymupdf.Matrix(1, 1), colorspace=pymupdf.csGRAY)
            source = Image.frombytes("L", (pix.width, pix.height), pix.samples)
            # The excluded two-point gap between adjacent crops must be blank.
            for previous, following in zip(crops, crops[1:]):
                top = round(previous["clipPoints"][3]); bottom = round(following["clipPoints"][1])
                strip = source.crop((15, top, source.width - 15, bottom))
                dark = sum(pixel < 150 for pixel in strip.getdata())
                if dark > 5:
                    diagnostics.append({"exam": exam_id, "after": previous["no"], "issue": "ink-between-crops", "pixels": dark})
            overlay = source.convert("RGB")
            draw = ImageDraw.Draw(overlay)
            for record in crops:
                draw.rectangle(record["clipPoints"], outline="red", width=1)
            images.append((f"{exam_id} PDF page {number}", overlay))
        montage(images, OUT / f"{exam_id}-source.png", columns=4, width=516)
        print(exam_id, flush=True)
    (OUT / "diagnostics.json").write_text(json.dumps(diagnostics, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
