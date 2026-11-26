"""Verify the CLI, local HTTP routes and SDK against a loopback model stub."""

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from collections import deque
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

from cyber_yi.config import load_settings
from cyber_yi.divination import load_corpus
from cyber_yi.interpretation import open_interpreter
from cyber_yi.web import make_handler

CAST = [9, 7, 7, 7, 7, 7]


@contextmanager
def listening(handler: type[BaseHTTPRequestHandler]):
    """Yield a started loopback server for handler and shut it down on exit."""
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield server
        finally:
            server.shutdown()
            thread.join()


def local_request(port: int, path: str, data: dict | None = None, *, post: bool = False,
                  headers: dict | None = None):
    """Return status and body for path on loopback port with optional JSON data and headers.

    Set post for a bodyless POST. Decode a JSON response when applicable.
    """
    request = Request(f"http://127.0.0.1:{port}{path}", headers=headers or {},
                      method="POST" if post or data is not None else "GET")
    if data is not None:
        request.data = json.dumps(data).encode()
        request.add_header("Content-Type", "application/json")
    opener = build_opener(ProxyHandler({}))
    try:
        response = opener.open(request, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        return response.status, json.loads(body) if response.headers.get_content_type() == "application/json" else body


class StubModel(BaseHTTPRequestHandler):
    """Consume configured responses while recording the SDK's request body."""

    def log_message(self, format: str, *args: object) -> None:
        """Suppress the log identified by format and args."""

    def do_POST(self) -> None:
        """Record one Chat Completions request and write the queued mock response."""
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.server.requests.append((self.path, self.headers["Authorization"], data))
        status, content = self.server.replies.popleft()
        if status == "timeout":
            time.sleep(0.8)
            return
        body = {"id": "chat-test", "object": "chat.completion", "created": 0, "model": "stub",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": content},
                             "finish_reason": "stop"}]}
        if status != 200:
            body = {"error": {"message": "Synthetic error"}}
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


class FlowTests(unittest.TestCase):
    """Verify shared results and error recovery through the actual public entry points."""

    @classmethod
    def setUpClass(cls) -> None:
        """Give cls an isolated offline configuration and the repository corpus."""
        temp = cls.enterClassContext(tempfile.TemporaryDirectory())
        cls.config = Path(temp) / "settings.yaml"
        corpus = Path("data/zhouyi.jsonl").resolve()
        cls.config.write_text(f"corpus: '{corpus}'\ndotenv: .env\nmax_question_length: 40\nport: 0\n"
                              "model:\n  base_url: null\n  name: null\n", encoding="utf-8")
        cls.settings = load_settings(cls.config)
        cls.corpus = load_corpus(cls.settings.corpus)

    def test_offline_cli(self) -> None:
        """Check CLI replay output, then retain it when interpretation is unconfigured."""
        command = [sys.executable, "-m", "cyber_yi", "--config", str(self.config), "cast", "如何准备面谈？", "--json",
                   "--lines", *map(str, CAST)]
        offline = subprocess.run(command, capture_output=True, text=True, check=True)
        reading = json.loads(offline.stdout)
        self.assertEqual(reading["changed"]["number"], 44)
        self.assertEqual(reading["passages"][0]["text"], "潛龍勿用。")
        unavailable = subprocess.run([*command, "--interpret"], check=False, capture_output=True, text=True)
        self.assertEqual(unavailable.returncode, 1)
        failed_reading = json.loads(unavailable.stdout)
        self.assertIn("尚未配置模型", failed_reading.pop("interpretation_error"))
        self.assertIsNone(failed_reading.pop("interpretation"))
        self.assertEqual(failed_reading, reading)

    def test_offline_web(self) -> None:
        """Test serving assets, no-model use, validation, and origin checks on a real listener."""
        coins = iter([1, 1, 1] + [0, 0, 1] * 5)
        handler = make_handler(self.settings, self.corpus, None, "未配置模型", lambda _: next(coins))
        with listening(handler) as web:
            port = web.server_port
            self.assertIn("赛博周易".encode(), local_request(port, "/")[1])
            self.assertEqual(local_request(port, "/style.css")[0], 200)
            self.assertEqual(local_request(port, "/app.js")[0], 200)
            self.assertFalse(local_request(port, "/api/settings")[1]["can_interpret"])
            status, reading = local_request(port, "/api/cast", post=True)
            self.assertEqual(status, 200)
            self.assertEqual(reading["values"], CAST)
            originals = reading.pop("originals")
            self.assertEqual([item["label"] for item in originals["primary"]["lines"]],
                             ["初九", "九二", "九三", "九四", "九五", "上九"])
            self.assertEqual(originals["changed"]["lines"][0]["label"], "初六")
            command = [sys.executable, "-m", "cyber_yi", "--config", str(self.config),
                       "cast", "--json", "--lines", *map(str, CAST)]
            cli = subprocess.run(command, capture_output=True, text=True, check=True)
            self.assertEqual(reading, json.loads(cli.stdout))
            payload = {"question": "请解读", "values": CAST}
            self.assertEqual(local_request(port, "/api/interpret", payload)[0], 503)
            self.assertEqual(local_request(port, "/api/interpret", {**payload, "question": " "})[0], 400)
            self.assertEqual(local_request(port, "/api/interpret", {**payload, "values": [7]})[0], 400)
            self.assertEqual(local_request(port, "/api/interpret", payload,
                                           headers={"Origin": "https://example.test"})[0], 403)

    def test_model_retry_preserves_evidence(self) -> None:
        """Exercise configured SDK success, timeout, authentication, limit and empty output."""
        with listening(StubModel) as model, tempfile.TemporaryDirectory() as temp:
            model.requests = []
            model.replies = deque([("timeout", None), (200, " "), (401, None), (429, None),
                                   (200, "解读示例"), (200, "CLI 解读示例")])
            root = Path(temp)
            config = root / "settings.yaml"
            config.write_text(
                f"corpus: '{self.settings.corpus}'\ndotenv: .env\nmax_question_length: 40\nport: 0\n"
                f"model:\n  base_url: http://127.0.0.1:{model.server_port}/v1\n  name: stub\n"
                "  reasoning_effort: medium\n  thinking: {type: enabled}\n"
                "  max_completion_tokens: 16384\n  top_p: 0.95\n  stop: null\n"
                "  timeout: 0.3\n  max_retries: 0\n  prompts: prompts.yaml\n", encoding="utf-8",
            )
            (root / "prompts.yaml").write_text(
                "system: 依据经文解读\nuser: |\n  {{ question }}\n  {{ cast }}\n  {{ passages }}\n",
                encoding="utf-8",
            )
            (root / ".env").write_text("OPENAI_API_KEY=local-test-dotenv\n", encoding="utf-8")
            settings = load_settings(config)
            with patch.dict(os.environ, {"OPENAI_API_KEY": "local-test-env", "NO_PROXY": "127.0.0.1"}):
                interpreter = open_interpreter(settings)
                handler = make_handler(settings, self.corpus, interpreter, "")
                with interpreter.client, listening(handler) as web:
                    payload = {"question": "如何准备面谈？", "values": CAST, "text": "伪造原文"}
                    responses = [local_request(web.server_port, "/api/interpret", payload) for _ in range(5)]
                command = [sys.executable, "-m", "cyber_yi", "--config", str(config),
                           "cast", payload["question"], "--json", "--interpret", "--lines", *map(str, CAST)]
                cli = subprocess.run(command, cwd=root, capture_output=True, text=True, check=True)
                self.assertEqual(json.loads(cli.stdout)["interpretation"], "CLI 解读示例")
            self.assertEqual([status for status, _ in responses], [504, 502, 502, 429, 200])
            self.assertEqual(responses[-1][1], {"interpretation": "解读示例"})
            self.assertEqual(len(model.requests), 6)
            for path, auth, request in model.requests:
                self.assertEqual((path, auth), ("/v1/chat/completions", "Bearer local-test-env"))
                self.assertEqual(request["model"], "stub")
                self.assertEqual(request["reasoning_effort"], "medium")
                self.assertEqual(request["thinking"], {"type": "enabled"})
                self.assertEqual(request["max_completion_tokens"], 16384)
                self.assertEqual(request["top_p"], 0.95)
                for omitted in ("max_tokens", "temperature", "stop"):
                    self.assertNotIn(omitted, request)
                system, user = request["messages"]
                self.assertEqual(system, {"role": "system", "content": "依据经文解读"})
                self.assertEqual(user["role"], "user")
                self.assertTrue(user["content"].startswith(payload["question"] + "\n"))
                self.assertIn("六爻（从初爻到上爻）：9、7、7、7、7、7", user["content"])
                self.assertIn("乾·初九（主读）：潛龍勿用。", user["content"])
                self.assertIn("小象：潛龍勿用、陽在下也。", user["content"])
                self.assertNotIn("伪造原文", user["content"])
