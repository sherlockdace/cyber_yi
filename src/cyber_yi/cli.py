"""Assemble the application for interactive or scripted local use."""

import argparse
import json
import secrets
import sys
from collections.abc import Mapping, Sequence
from dataclasses import asdict
from pathlib import Path

from .config import Settings, load_settings, validate_question
from .divination import Figure, Hexagram, Reading, load_corpus, read_cast, toss_coins
from .interpretation import ModelFailure, open_interpreter
from .web import serve


def main(argv: Sequence[str] | None = None) -> int:
    """Run the CLI with argv (or process arguments when None) and return an exit status."""
    parser = argparse.ArgumentParser(prog="cyber-yi", description="周易三钱起卦与经传解读")
    parser.add_argument("--config", type=Path, default=Path("config/settings.yaml"),
                        help="设置文件路径，默认 config/settings.yaml")
    commands = parser.add_subparsers(dest="command", required=True)
    cast = commands.add_parser("cast", help="起卦并查阅经文")
    cast.add_argument("question", nargs="?", help="所问之事，模型解读时必填")
    cast.add_argument("--lines", type=int, nargs=6, metavar="N",
                      help="复用六个爻值，按初爻到上爻排列")
    cast.add_argument("--interpret", action="store_true", help="将问题和取辞发送给已配置的模型")
    cast.add_argument("--json", action="store_true", help="以 JSON 输出卦象和解读")
    commands.add_parser("serve", help="在本机启动浏览器界面")
    args = parser.parse_args(argv)
    try:
        settings = load_settings(args.config)
        corpus = load_corpus(settings.corpus)
        if args.command == "cast":
            return run_cast(args, settings, corpus)
        return run_web(settings, corpus)
    except (OSError, ValueError) as error:
        print(f"错误：{error}", file=sys.stderr)
        return 1


def run_cast(args: argparse.Namespace, settings: Settings, corpus: Mapping[str, Hexagram]) -> int:
    """Handle cast args using settings and corpus, printing a result and returning an exit status."""
    question = ""
    if args.question is not None or args.interpret:
        question = validate_question(args.question, settings.max_question_length)
    values = args.lines if args.lines is not None else toss_coins(secrets.randbelow)
    reading = read_cast(values, corpus)
    answer = None
    failure = None
    if not args.json:
        print(format_reading(reading), flush=True)
    if args.interpret:
        try:
            interpreter = open_interpreter(settings)
            with interpreter.client:
                print(f"问题与所选经文将发送至 {interpreter.settings.base_url}", file=sys.stderr)
                answer = interpreter.interpret(question, reading)
        except ModelFailure as error:
            failure = str(error)
    if args.json:
        payload = asdict(reading)
        if args.interpret:
            payload.update(interpretation=answer, interpretation_error=failure)
        print(json.dumps(payload, ensure_ascii=False))
    elif answer is not None:
        print(f"\n解读\n{answer}")
    if failure is not None:
        print(f"解读失败：{failure}", file=sys.stderr)
        return 1
    return 0


def format_reading(reading: Reading) -> str:
    """Return a terminal view of reading with the cast, hexagrams and selected sources."""
    lines = [f"爻值（自下而上）{' '.join(map(str, reading.values))}",
             format_figure("本卦", reading.primary, reading.moving_lines)]
    if reading.changed is not None:
        lines.append(format_figure("之卦", reading.changed, ()))
    for item in reading.passages:
        lines.append(f"{item.role} · 第 {item.hexagram_number} 卦 {item.hexagram_name}{item.label}  {item.text}")
        lines.extend(f"  {title}  {text}" for title, text in item.commentary.items())
    return "\n".join(lines)


def format_figure(title: str, figure: Figure, moving: tuple[int, ...]) -> str:
    """Return a labeled terminal diagram of figure, marking the 1-based positions in moving."""
    result = [f"{title} · 第 {figure.number} 卦 {figure.name} · {figure.upper}上{figure.lower}下"]
    for position in range(6, 0, -1):
        line = "━━━━━" if figure.pattern[position - 1] == "1" else "━━ ━━"
        result.append(f"  {line}{'  动' if position in moving else ''}")
    return "\n".join(result)


def run_web(settings: Settings, corpus: Mapping[str, Hexagram]) -> int:
    """Start the local web server from settings and corpus and return zero on shutdown."""
    try:
        interpreter = open_interpreter(settings)
    except ModelFailure as error:
        serve(settings, corpus, None, str(error))
    else:
        with interpreter.client:
            serve(settings, corpus, interpreter, "")
    return 0
