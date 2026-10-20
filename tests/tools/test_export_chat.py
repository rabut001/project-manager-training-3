"""Regression tests for transcript selection, privacy, dates, and safe rewrites."""
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from export_chat import ExportError, export_chat


def meta(identity="session-one"):
    return {"type": "session_meta", "payload": {
        "id": identity, "timestamp": "2026-10-19T23:59:00Z",
    }}


def message(role, text, **extra):
    return {"type": "response_item", "timestamp": "2026-10-20T00:00:00Z",
            "payload": {"type": "message", "role": role,
                        "content": [{"type": "input_text", "text": text}], **extra}}


def stream(*entries):
    return io.StringIO("\n".join(json.dumps(e, ensure_ascii=False) for e in entries))


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)

    def test_exports_once_and_excludes_internal_records(self):
        entries = [meta(), message("developer", "PRIVATE-DEVELOPER"),
                   message("system", "PRIVATE-SYSTEM"),
                   message("assistant", "PRIVATE-ANALYSIS", channel="analysis"),
                   message("assistant", "PRIVATE-SUMMARY", phase="summary"),
                   message("assistant", "PRIVATE-TOOL", recipient="functions.exec"),
                   {"type": "response_item", "payload": {
                       "type": "reasoning", "summary": "PRIVATE-REASONING"}},
                   message("user", "質問\n\n```text\n本文\n```"),
                   {"type": "event_msg", "payload": {"type": "user_message", "message": "質問"}},
                   {"type": "compacted", "payload": {"message": "PRIVATE-COMPACTION"}},
                   message("assistant", "回答", phase="final_answer")]
        result = export_chat(stream(*entries), self.root).read_text()
        self.assertNotIn("PRIVATE-", result)
        self.assertEqual(result.count("## ユーザー\n"), 1)
        self.assertEqual(result.count("## アシスタント\n"), 1)
        self.assertIn("質問\n\n```text\n本文\n```", result)
        self.assertLess(result.index("質問"), result.index("回答"))

    def test_filters_context_but_preserves_request(self):
        source = stream(meta(), message("user", "<environment_context>PRIVATE-ENV</environment_context>"),
                        message("user", '<in-app-browser-context source="ambient-ui-state">'
                                'PRIVATE-BROWSER</in-app-browser-context>\n## My request:\n本文'),
                        message("user", "<external_codex_apps_open_page>PRIVATE-PAGE</external_codex_apps_open_page>"))
        result = export_chat(source, self.root).read_text()
        self.assertNotIn("PRIVATE-", result)
        self.assertIn("本文", result)
        self.assertNotIn("My request", result)
        self.assertEqual(result.count("## ユーザー\n"), 1)

    def test_question_answers_and_image_placeholder(self):
        reply = '<send_user_message_question_reply>' + json.dumps([
            {"question": "公開先は？", "answer": "GitHub Pages"}
        ]) + '</send_user_message_question_reply>'
        image = message("user", "画像を確認してください")
        image["payload"]["content"].append({"type": "input_image", "image_url": "PRIVATE-IMAGE-DATA"})
        result = export_chat(stream(meta(), message("user", reply), image), self.root).read_text()
        self.assertIn("質問: 公開先は？\n\n回答: GitHub Pages", result)
        self.assertIn("[画像添付]", result)
        self.assertNotIn("PRIVATE-IMAGE-DATA", result)

    def test_timezone_and_repeat_export(self):
        destination = export_chat(stream(meta(), message("user", "初回")), self.root)
        self.assertEqual(destination.relative_to(self.root).as_posix(),
                         "chat-exports/2026-10-20-0859/chat.md")
        self.assertIn("09:00:00 +0900", destination.read_text())
        export_chat(stream(meta(), message("user", "更新")), self.root)
        self.assertIn("更新", destination.read_text())
        self.assertNotIn("初回", destination.read_text())

    def test_different_session_does_not_overwrite(self):
        destination = export_chat(stream(meta(), message("user", "元の会話")), self.root)
        before = destination.read_bytes()
        with self.assertRaises(ExportError):
            export_chat(stream(meta("session-two"), message("user", "別の会話")), self.root)
        self.assertEqual(destination.read_bytes(), before)

    def test_bad_input_preserves_existing_output(self):
        destination = export_chat(stream(meta(), message("user", "保存済み")), self.root)
        before = destination.read_bytes()
        broken = stream(meta(), message("user", "不完全な新規会話")).getvalue() + '\n{"type":'
        with self.assertRaisesRegex(ExportError, "3行目"):
            export_chat(io.StringIO(broken), self.root)
        self.assertEqual(destination.read_bytes(), before)
        with self.assertRaisesRegex(ExportError, "session_meta"):
            export_chat(stream(message("user", "メタデータなし")), self.root)

    def test_empty_and_naive_timestamp_fail_without_output(self):
        with self.assertRaisesRegex(ExportError, "会話本文"):
            export_chat(stream(meta()), self.root)
        entry = meta()
        entry["payload"]["timestamp"] = "2026-10-19T23:59:00"
        with self.assertRaisesRegex(ExportError, "タイムゾーン"):
            export_chat(stream(entry, message("user", "本文")), self.root)
        self.assertFalse((self.root / "chat-exports").exists())


if __name__ == "__main__":
    unittest.main()
