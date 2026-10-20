#!/usr/bin/env python3
"""IPA公開ページからPM午前Ⅱの原本を取得する。開発コンテナ内で実行。"""
import argparse
import hashlib
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def metadata(year):
    era = f"r{year - 2018:02d}" if year >= 2020 else f"h{year - 1988:02d}"
    season, label = ("aki", "秋期") if year >= 2021 else (("oct", "10月") if year == 2020 else (("tokubetsu", "特別") if year == 2011 else ("haru", "春期")))
    name = f"令和{year - 2018}" if year >= 2020 else f"平成{year - 1988}"
    return {"id": f"{year}-{era}-{season}", "year": year, "title": f"{name}年度 {label}", "pageUrl": f"https://www.ipa.go.jp/shiken/mondai-kaiotu/{year}{era}.html"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("years", nargs="*", type=int, default=list(range(2025, 2008, -1)))
    args = parser.parse_args()
    base = ROOT / "sources/ipa"
    base.mkdir(parents=True, exist_ok=True)
    manifest_path = base / "manifest.json"
    existing = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    entries = {entry["year"]: entry for entry in existing}
    for year in args.years:
        entry = metadata(year)
        directory = base / entry["id"]
        directory.mkdir(exist_ok=True)
        html_path = directory / "index.html"
        if not html_path.exists():
            html_path.write_bytes(fetch(entry["pageUrl"]))
        html = html_path.read_text()
        links = re.findall(r'href=["\']([^"\']+)["\']', html)
        matches = {kind: [urllib.parse.urljoin(entry["pageUrl"], link) for link in links if re.search(rf'_pm_am2_{suffix}\.pdf$', link, re.I)] for kind, suffix in [("questions", "qs"), ("answers", "ans")]}
        for kind in matches:
            urls = sorted(set(matches[kind]))
            if len(urls) != 1:
                raise ValueError(f"{year} {kind}: expected one URL, found {urls}")
            path = directory / f"{kind}.pdf"
            if not path.exists():
                data = fetch(urls[0])
                if not data.startswith(b"%PDF"):
                    raise ValueError(f"Not a PDF: {urls[0]}")
                path.write_bytes(data)
            entry[kind] = {"url": urls[0], "file": str(path.relative_to(ROOT)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        entry["retrievedAt"] = entries.get(year, {}).get("retrievedAt", datetime.now(timezone.utc).isoformat())
        entries[year] = entry
        manifest_path.write_text(json.dumps(sorted(entries.values(), key=lambda x: -x["year"]), ensure_ascii=False, indent=2) + "\n")
        print(entry["id"], flush=True)


if __name__ == "__main__":
    main()
