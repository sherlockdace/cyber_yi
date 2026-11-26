"""Check streamed SDK deltas and their HTTP representation without a listener."""

import io
import json
import unittest
from pathlib import Path

import httpx2
from openai import OpenAI

from cyber_yi.config import ModelSettings, load_settings, read_yaml
from cyber_yi.divination import load_corpus, read_cast
from cyber_yi.interpretation import Interpreter
from cyber_yi.web import make_handler, original_text


class StreamTests(unittest.TestCase):
    """Exercise streaming, role separation and data used by the classic-text panel."""

    def test_sdk_stream_and_response(self) -> None:
        """Preserve both DeepSeek delta fields and signal a truncated or finished answer."""
        settings = load_settings(Path("config/settings.yaml"))
        corpus = load_corpus(settings.corpus)
        reading = read_cast((9, 7, 7, 7, 7, 7), corpus)
        model = ModelSettings("https://example.test", "stub", 2, 0, Path("config/prompts.yaml"),
                              {"reasoning_effort": "medium", "max_completion_tokens": 16384})
        prompts = read_yaml(model.prompts)

        for reason, expected in (("stop", "done"), ("length", "error")):
            with self.subTest(reason=reason):
                chunks = [
                    {"choices": []},
                    {"choices": [{"index": 0, "delta": {"reasoning_content": "先读**卦辞**。"},
                                  "finish_reason": None}]},
                    {"choices": [{"index": 0, "delta": {"content": "## 解读\n\n- 从准备开始"},
                                  "finish_reason": None}]},
                    {"choices": [{"index": 0, "delta": {}, "finish_reason": reason}]},
                ]

                def reply(request: httpx2.Request, chunks: list[dict] = chunks) -> httpx2.Response:
                    """Check the SDK request, then reply with the supplied SSE chunks and DONE."""
                    payload = json.loads(request.content)
                    self.assertTrue(payload["stream"])
                    self.assertEqual(payload["reasoning_effort"], "medium")
                    self.assertEqual(payload["max_completion_tokens"], 16384)
                    self.assertNotIn("max_tokens", payload)
                    self.assertEqual([message["role"] for message in payload["messages"]], ["system", "user"])
                    self.assertIn("四爻动：读之卦两条未动爻", payload["messages"][0]["content"])
                    user_message = payload["messages"][1]["content"]
                    self.assertTrue(user_message.startswith("怎么准备 {{ cast }}？\n\n"))
                    self.assertIn("本卦：乾", user_message)
                    self.assertIn("变卦：姤", user_message)
                    self.assertIn("动爻：1 爻（初九）", user_message)
                    self.assertIn("乾·初九（主读）：潛龍勿用。", user_message)
                    self.assertIn("小象：潛龍勿用、陽在下也。", user_message)
                    return httpx2.Response(200, headers={"Content-Type": "text/event-stream"},
                                           text="".join(f"data: {json.dumps(chunk)}\n\n" for chunk in chunks)
                                           + "data: [DONE]\n\n")

                with httpx2.Client(transport=httpx2.MockTransport(reply)) as http:
                    client = OpenAI(base_url=model.base_url, api_key="stub", http_client=http)
                    interpreter = Interpreter(client, model, prompts["system"], prompts["user"])
                    handler_type = make_handler(settings, corpus, interpreter, "")
                    handler = handler_type.__new__(handler_type)
                    handler.wfile = io.BytesIO()
                    handler.begin_reply = lambda *_: None
                    handler.reply_stream(interpreter, "怎么准备 {{ cast }}？", reading)
                events = [json.loads(line) for line in handler.wfile.getvalue().splitlines()]
                self.assertEqual([event["type"] for event in events], ["reasoning_content", "content", expected])
                self.assertEqual(events[0]["text"], "先读**卦辞**。")
                self.assertEqual(events[1]["text"], "## 解读\n\n- 从准备开始")

    def test_original_text_preserves_order(self) -> None:
        """Expose canonical bottom-to-top positions and attach the two special use texts."""
        corpus = load_corpus(Path("data/zhouyi.jsonl"))
        qian = original_text(corpus["111111"])
        kun = original_text(corpus["000000"])
        self.assertEqual([line["label"] for line in qian["lines"]], ["初九", "九二", "九三", "九四", "九五", "上九"])
        self.assertEqual([line["label"] for line in kun["lines"]], ["初六", "六二", "六三", "六四", "六五", "上六"])
        self.assertIn("無首", qian["extra"].replace("无", "無"))
        self.assertEqual(kun["extra"], "利永貞。")
