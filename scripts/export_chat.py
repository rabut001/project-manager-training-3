#!/usr/bin/env python3
"""Export Codex rollout messages to chat-exports/<session-start>/chat.md."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import TextIO
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ExportError(ValueError):
    """An input cannot be exported safely."""


CONTEXT = re.compile(
    r"^\s*<(environment_context|in-app-browser-context|external_codex_apps_open_page)"
    r"(?:\s[^>]*)?>.*?</\1>\s*", re.S
)
QUESTION_REPLY = re.compile(
    r"^\s*<send_user_message_question_reply>\s*(.*?)\s*"
    r"</send_user_message_question_reply>\s*$", re.S
)


def user_body(text: str) -> str:
    removed_browser = False
    while matched := CONTEXT.match(text):
        removed_browser |= matched.group(1) == "in-app-browser-context"
        text = text[matched.end():]
    if removed_browser:
        text = re.sub(r"^\s*## My request:\s*", "", text, count=1)
    reply = QUESTION_REPLY.fullmatch(text)
    if reply:
        try:
            answers = json.loads(reply.group(1))
        except json.JSONDecodeError as exc:
            raise ExportError("質問への回答JSONを解釈できません。") from exc
        if not isinstance(answers, list) or not all(
            isinstance(answer, dict)
            and isinstance(answer.get("question"), str)
            and isinstance(answer.get("answer"), str)
            for answer in answers
        ):
            raise ExportError("質問への回答形式に対応していません。")
        return "\n\n".join(
            f"質問: {answer['question']}\n\n回答: {answer['answer']}"
            for answer in answers
        )
    return text.strip()


def parse_time(value: object, zone: ZoneInfo) -> datetime:
    if not isinstance(value, str):
        raise ExportError("日時がありません。")
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ExportError("日時を解釈できません。") from exc
    if stamp.tzinfo is None:
        raise ExportError("日時にタイムゾーンがありません。")
    return stamp.astimezone(zone)


def read_chat(stream: TextIO, zone: ZoneInfo) -> tuple[str, datetime, list]:
    session_id = None
    started = None
    messages = []
    for line_no, line in enumerate(stream, 1):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ExportError(f"{line_no}行目: JSONとして読めません。") from exc
        if not isinstance(entry, dict):
            raise ExportError(f"{line_no}行目: JSONオブジェクトではありません。")
        payload = entry.get("payload")
        if not isinstance(payload, dict):
            continue
        if entry.get("type") == "session_meta":
            if session_id is not None:
                raise ExportError("複数のセッション情報が含まれています。")
            session_id = payload.get("id") or payload.get("session_id")
            if not isinstance(session_id, str) or not re.fullmatch(
                r"[a-zA-Z0-9_-]+", session_id
            ):
                raise ExportError("セッションIDがありません、または不正です。")
            started = parse_time(payload.get("timestamp") or entry.get("timestamp"), zone)
            continue
        # Events also contain copies of messages; never export them a second time.
        if entry.get("type") != "response_item" or payload.get("type") != "message":
            continue
        role = payload.get("role")
        if role not in ("user", "assistant"):
            continue
        if role == "assistant" and (
            payload.get("channel") not in (None, "commentary", "final")
            or payload.get("phase") not in (None, "commentary", "final_answer", "final")
            or payload.get("recipient") not in (None, "all")
        ):
            continue
        content = payload.get("content")
        if not isinstance(content, list):
            continue
        blocks = []
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") in ("input_text", "output_text", "text"):
                value = block.get("text")
                if isinstance(value, str) and value.strip():
                    blocks.append(value)
            elif block.get("type") in ("input_image", "output_image", "image"):
                blocks.append("[画像添付]")
        body = "\n\n".join(blocks).strip()
        if role == "user":
            body = user_body(body)
        if body:
            messages.append((role, parse_time(entry.get("timestamp"), zone), body))
    if session_id is None or started is None:
        raise ExportError("Codexのsession_metaがありません。rollout JSONLを指定してください。")
    if not messages:
        raise ExportError("出力できる会話本文がありません。")
    return session_id, started, messages


def export_chat(stream: TextIO, root: Path, zone_name: str = "Asia/Tokyo") -> Path:
    zone = ZoneInfo(zone_name)
    session_id, started, messages = read_chat(stream, zone)
    identity = f"セッションID: `{session_id}`"
    parts = [
        "# チャット書き出し\n\n",
        f"セッション開始: {started:%Y-%m-%d %H:%M:%S %z} ({zone_name})\n\n",
        identity + "\n",
    ]
    for role, stamp, body in messages:
        label = "ユーザー" if role == "user" else "アシスタント"
        parts.append(f"\n## {label}\n\n*{stamp:%Y-%m-%d %H:%M:%S %z}*\n\n{body}\n")
    destination = root / "chat-exports" / f"{started:%Y-%m-%d-%H%M}" / "chat.md"
    if destination.exists() and identity not in destination.read_text(encoding="utf-8").splitlines():
        raise ExportError("同時刻の別の会話が存在します。--repo-rootで別の出力先を指定してください。")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".md.tmp")
    temporary.write_text("".join(parts), encoding="utf-8")
    temporary.replace(destination)
    return destination


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transcript", required=True, help="Codex rollout JSONL。- は標準入力")
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--timezone", default="Asia/Tokyo", help="出力日時のタイムゾーン")
    args = parser.parse_args()
    try:
        if args.transcript == "-":
            destination = export_chat(sys.stdin, args.repo_root.resolve(), args.timezone)
        else:
            with Path(args.transcript).open(encoding="utf-8-sig") as stream:
                destination = export_chat(stream, args.repo_root.resolve(), args.timezone)
    except (ExportError, OSError, UnicodeError, ZoneInfoNotFoundError) as exc:
        print(f"書き出しエラー: {exc}", file=sys.stderr)
        return 1
    print(destination)
    return 0


if __name__ == "__main__":
    sys.exit(main())
