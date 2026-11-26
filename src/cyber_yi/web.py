"""Serve the local browser interface, casting results and model streams."""

import json
import secrets
from collections.abc import Callable, Mapping
from contextlib import closing
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib.resources import files

from .config import Settings, validate_question
from .divination import Hexagram, Reading, line_passage, read_cast, toss_coins
from .interpretation import Interpreter, ModelFailure

HOST = "127.0.0.1"
MAX_REQUEST_BYTES = 128 * 1024
ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/markdown-it.min.js": ("markdown-it.min.js", "text/javascript; charset=utf-8"),
}


def original_text(hexagram: Hexagram) -> dict:
    """Return hexagram's full text with six labeled lines in canonical bottom-to-top order."""
    return {
        "statement": hexagram.statement,
        "lines": [{"label": line_passage(hexagram, position, "").label, "text": text}
                  for position, text in enumerate(hexagram.lines, 1)],
        "extra": hexagram.extra,
    }


def make_handler(
    settings: Settings, corpus: Mapping[str, Hexagram], interpreter: Interpreter | None,
    model_error: str, randbelow: Callable[[int], int] = secrets.randbelow,
) -> type[BaseHTTPRequestHandler]:
    """Return a loopback HTTP handler for settings, a validated corpus and an optional interpreter.

    Use model_error to describe unavailable interpretation. The injected randbelow
    supplies coin outcomes in the range [0, bound).
    """
    resources = files("cyber_yi").joinpath("assets")
    assets = {url: (resources.joinpath(name).read_bytes(), media_type)
              for url, (name, media_type) in ASSETS.items()}

    class Handler(BaseHTTPRequestHandler):
        """Read a single local request and return a page or a JSON response."""

        def log_message(self, format: str, *args: object) -> None:
            """Discard the default access log described by format and args."""

        def allowed(self) -> bool:
            """Return whether Host and the optional Origin identify this loopback listener."""
            port = self.server.server_address[1]
            authority = HOST if port == 80 else f"{HOST}:{port}"
            origin = f"http://{authority}"
            return self.headers.get("Host") == authority and self.headers.get("Origin", origin) == origin

        def reply(self, status: int, body: bytes, media_type: str) -> None:
            """Send body (encoded bytes) with status and the declared media_type."""
            self.begin_reply(status, media_type, len(body))
            self.wfile.write(body)

        def begin_reply(self, status: int, media_type: str, length: int | None = None) -> None:
            """Send headers for status, media_type and optional fixed length in bytes."""
            self.send_response(status)
            self.send_header("Content-Type", media_type)
            if length is not None:
                self.send_header("Content-Length", str(length))
            else:
                self.send_header("Connection", "close")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy",
                             "default-src 'self'; img-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()

        def reply_json(self, status: int, value: dict) -> None:
            """Serialize the JSON-compatible value object and send it with status."""
            body = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.reply(status, body, "application/json; charset=utf-8")

        def write_event(self, kind: str, text: str = "") -> None:
            """Flush an NDJSON event with kind and text to the streaming response."""
            event = json.dumps({"type": kind, "text": text}, ensure_ascii=False)
            self.wfile.write((event + "\n").encode("utf-8"))
            self.wfile.flush()

        def reply_stream(self, model: Interpreter, question: str, reading: Reading) -> None:
            """Forward model deltas for question and reading until completion or disconnection."""
            self.close_connection = True
            try:
                self.begin_reply(200, "application/x-ndjson; charset=utf-8")
                self.wfile.flush()
                try:
                    with closing(model.stream_interpretation(question, reading)) as events:
                        for kind, text in events:
                            self.write_event(kind, text)
                except ModelFailure as error:
                    self.write_event("error", str(error))
                else:
                    self.write_event("done")
            except (BrokenPipeError, ConnectionResetError):
                return

        def read_json(self) -> dict:
            """Return a bounded UTF-8 JSON object, or raise ValueError or TypeError for invalid input."""
            if self.headers.get_content_type() != "application/json":
                raise ValueError("请使用 application/json")
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_REQUEST_BYTES:
                raise ValueError("请求为空或超出大小限制")
            try:
                data = json.loads(self.rfile.read(length).decode("utf-8"))
            except (UnicodeError, json.JSONDecodeError, RecursionError) as error:
                raise ValueError("请求须为有效的 JSON") from error
            if not isinstance(data, dict):
                raise TypeError("请求须为 JSON 对象")
            return data

        def do_GET(self) -> None:
            """Serve an interface asset or report model readiness and the question length limit."""
            if not self.allowed():
                self.reply_json(403, {"error": "请通过本机地址访问"})
            elif self.path == "/api/settings":
                self.reply_json(200, {
                    "max_question_length": settings.max_question_length,
                    "model_endpoint": settings.model.base_url if settings.model else None,
                    "can_interpret": interpreter is not None,
                    "model_error": model_error,
                })
            elif self.path in assets:
                body, media_type = assets[self.path]
                self.reply(200, body, media_type)
            else:
                self.reply_json(404, {"error": "找不到页面"})

        def do_POST(self) -> None:
            """Cast locally or interpret supplied values after reselecting the canonical evidence."""
            if not self.allowed():
                self.reply_json(403, {"error": "请通过本机地址访问"})
                return
            if self.path == "/api/cast":
                reading = read_cast(toss_coins(randbelow), corpus)
                payload = asdict(reading)
                payload["originals"] = {"primary": original_text(corpus[reading.primary.pattern])}
                if reading.changed is not None:
                    payload["originals"]["changed"] = original_text(corpus[reading.changed.pattern])
                self.reply_json(200, payload)
                return
            if self.path not in ("/api/interpret", "/api/interpret/stream"):
                self.reply_json(404, {"error": "找不到接口"})
                return
            try:
                data = self.read_json()
                question = validate_question(data.get("question"), settings.max_question_length)
                reading = read_cast(data.get("values"), corpus)
                if interpreter is None:
                    raise ModelFailure(model_error, 503)
                if self.path == "/api/interpret/stream":
                    self.reply_stream(interpreter, question, reading)
                    return
                answer = interpreter.interpret(question, reading)
            except (TypeError, ValueError) as error:
                self.reply_json(400, {"error": str(error)})
            except ModelFailure as error:
                self.reply_json(error.status, {"error": str(error)})
            else:
                self.reply_json(200, {"interpretation": answer})

    return Handler


def serve(
    settings: Settings, corpus: Mapping[str, Hexagram], interpreter: Interpreter | None,
    model_error: str,
) -> None:
    """Serve settings and corpus on loopback with interpreter or an optional model_error.

    Print the bound URL and block until interrupted. Raise OSError if the port cannot bind.
    """
    handler = make_handler(settings, corpus, interpreter, model_error)
    with ThreadingHTTPServer((HOST, settings.port), handler) as server:
        print(f"Cyber Yi · http://{HOST}:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            return
