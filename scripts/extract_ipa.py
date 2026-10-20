#!/usr/bin/env python3
"""PM午前Ⅱを切り出す。画像内容を削らず、問番号と25問の連番を検証する。

出力のOCRは作業用であり原本の代わりではない。既存解説を保持する。
抽出後は全画像を原本と照合し、別工程で解説をレビューすること。
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import csv
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata

from PIL import Image, ImageChops, ImageOps
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SCALE = 200 / 72
os.environ.setdefault("OMP_THREAD_LIMIT", "1")


def ocr(path, *, tsv=False, psm=6):
    command = ["tesseract", str(path), "stdout", "-l", "jpn" if tsv else "jpn+eng", "--psm", str(psm)]
    if tsv:
        command.append("tsv")
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout


def page_headers(args):
    pdf, page_index, cache = args
    with pymupdf.open(pdf) as document:
        page = document[page_index]
        clip = pymupdf.Rect(20, 30, 155, page.rect.height - 35)
        path = cache / f"page-{page_index+1:02d}-headers.png"
        page.get_pixmap(matrix=pymupdf.Matrix(3, 3), colorspace=pymupdf.csGRAY, clip=clip).save(path)
        result = path.with_suffix(".tsv").read_text() if path.with_suffix(".tsv").exists() else ocr(path, tsv=True)
        path.with_suffix(".tsv").write_text(result)
        lines = {}
        for row in csv.DictReader(io.StringIO(result), delimiter="\t"):
            if row["level"] == "5" and row["text"].strip():
                key = (row["block_num"], row["par_num"], row["line_num"])
                lines.setdefault(key, []).append(row)
        headers = []
        for words in lines.values():
            words.sort(key=lambda word: int(word["left"]))
            line = unicodedata.normalize("NFKC", "".join(word["text"].strip() for word in words))
            line = line.lstrip("・･.．-* ")
            match = re.match(r"[問間]\s*(\d{1,2})(?!\d)", line)
            if match:
                number = int(match[1])
                if 1 <= number <= 25:
                    headers.append({"no": number, "y": 30 + min(int(word["top"]) for word in words) / 3, "ocr": line})
        headers.sort(key=lambda header: header["y"])
        return {"page": page_index + 1, "headers": headers, "height": page.rect.height, "width": page.rect.width}


def extract(entry):
    exam_id = entry["id"]
    cache = ROOT / ".cache/extraction" / exam_id
    cache.mkdir(parents=True, exist_ok=True)
    source_dir = ROOT / "sources/ipa" / exam_id
    pdf = ROOT / entry["questions"]["file"]
    with pymupdf.open(pdf) as document:
        page_count = len(document)
    with ThreadPoolExecutor(max_workers=4) as executor:
        pages = list(executor.map(page_headers, [(pdf, i, cache) for i in range(page_count)]))
    (cache / "headers.json").write_text(json.dumps(pages, ensure_ascii=False, indent=2))
    overrides_path = source_dir / "header-overrides.json"
    if overrides_path.exists():
        overrides = json.loads(overrides_path.read_text())
        for page in pages:
            if str(page["page"]) in overrides:
                page["headers"] = overrides[str(page["page"])]
    numbers = [header["no"] for page in pages for header in page["headers"]]
    if numbers != list(range(1, 26)):
        raise ValueError(f"{exam_id}: headers must be 1..25, got {numbers}; inspect {cache / 'headers.json'}")
    answer_text = subprocess.run(["pdftotext", "-layout", str(ROOT / entry["answers"]["file"]), "-"], check=True, capture_output=True, text=True).stdout
    (cache / "answers.txt").write_text(answer_text)
    answers = {int(no): answer for no, answer in re.findall(r"問\s*(\d+)\s*([アイウエ])", answer_text)}
    answer_override = source_dir / "answer-overrides.json"
    if answer_override.exists():
        answers = {int(no): answer for no, answer in json.loads(answer_override.read_text())["answers"].items()}
    invalid_path = source_dir / "invalid-questions.json"
    invalid = json.loads(invalid_path.read_text()) if invalid_path.exists() else {}
    for number in invalid:
        answers[int(number)] = None
    if sorted(answers) != list(range(1, 26)):
        raise ValueError(f"{exam_id}: incomplete official answer table: {answers}")
    out_dir = ROOT / "public/data" / exam_id
    out_dir.mkdir(parents=True, exist_ok=True)
    records = []
    with pymupdf.open(pdf) as document:
        for page_info in pages:
            page = document[page_info["page"] - 1]
            for i, header in enumerate(page_info["headers"]):
                top = header["y"] - 5
                # Entire page width preserves horizontally separated choices and diagrams.
                # Printed footer occupies the bottom 35pt and is excluded from the last question.
                bottom = page_info["headers"][i + 1]["y"] - 7 if i + 1 < len(page_info["headers"]) else page.rect.height - 55
                rect = pymupdf.Rect(15, top, page.rect.width - 15, bottom)
                pix = page.get_pixmap(matrix=pymupdf.Matrix(SCALE, SCALE), colorspace=pymupdf.csGRAY, clip=rect)
                image = Image.frombytes("L", (pix.width, pix.height), pix.samples)
                # Trim blank outer margins only; never discard disconnected content.
                ink = image.point(lambda p: 255 if p < 180 else 0)
                bounds = ink.getbbox()
                if not bounds:
                    raise ValueError(f"empty question: {exam_id} {header['no']}")
                left, upper, right, lower = bounds
                image = image.crop((max(0, left - 25), max(0, upper - 15), min(image.width, right + 25), min(image.height, lower + 20)))
                path = out_dir / f"q{header['no']:02d}.png"
                image.save(path, optimize=True)
                records.append({"no": header["no"], "page": page_info["page"], "clipPoints": list(rect), "pixelSize": list(image.size), "headerOcr": header.get("ocr", "manual override"), "image": str(path.relative_to(ROOT))})
    (source_dir / "crops.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n")
    with ThreadPoolExecutor(max_workers=4) as executor:
        texts = list(executor.map(lambda record: ocr(ROOT / record["image"], psm=6), records))
    text_dir = ROOT / ".cache/text"
    text_dir.mkdir(parents=True, exist_ok=True)
    (text_dir / f"{entry['year']}.txt").write_text("\n\n".join(f"=== 問{record['no']} 正解:{answers[record['no']]} PDFページ:{record['page']} ===\n{text}" for record, text in zip(records, texts)))
    previous_path = out_dir / "exam.json"
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
    old_questions = {q["no"]: q for q in previous.get("questions", [])}
    questions = []
    for record, text in zip(records, texts):
        number = record["no"]
        old = old_questions.get(number, {})
        question = {**old, "no": number, "answer": answers[number], "image": f"data/{exam_id}/q{number:02d}.png", "stem": old.get("stem", ""), "choices": old.get("choices", {}), "explanation": old.get("explanation", ""), "sourcePage": record["page"]}
        if str(number) in invalid:
            question["invalidReason"] = invalid[str(number)]
        questions.append(question)
        (cache / f"q{number:02d}.txt").write_text(text)
    data = {**previous, "id": exam_id, "title": entry["title"], "year": entry["year"], "sourceUrl": entry["questions"]["url"], "answerUrl": entry["answers"]["url"], "questions": questions}
    previous_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"{exam_id}: 25 images, official answers, OCR saved; visual review pending", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("years", nargs="*", type=int)
    args = parser.parse_args()
    entries = json.loads((ROOT / "sources/ipa/manifest.json").read_text())
    for entry in entries:
        if not args.years or entry["year"] in args.years:
            extract(entry)


if __name__ == "__main__":
    main()
