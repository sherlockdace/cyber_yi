"""Compute and select passages for three-coin Zhouyi casts."""

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

TRIGRAMS = {
    "111": "乾", "110": "兌", "101": "離", "100": "震",
    "011": "巽", "010": "坎", "001": "艮", "000": "坤",
}
POSITIONS = ("初", "二", "三", "四", "五", "上")


@dataclass(frozen=True)
class Figure:
    """A numbered hexagram with a bottom-to-top yin/yang pattern."""

    number: int
    name: str
    pattern: str
    lower: str
    upper: str


@dataclass(frozen=True)
class Hexagram:
    """One validated corpus record with bottom-to-top lists of passages."""

    figure: Figure
    statement: str
    lines: tuple[str, ...]
    tuan: str
    image: str
    line_images: tuple[str, ...]
    extra: str | None
    extra_image: str | None


@dataclass(frozen=True)
class Passage:
    """A selected canonical quotation and its accompanying commentaries."""

    hexagram_number: int
    hexagram_name: str
    label: str
    position: int | None
    role: str
    text: str
    commentary: dict[str, str]


@dataclass(frozen=True)
class Reading:
    """All deterministic output for a single cast, ready for either interface."""

    values: tuple[int, ...]
    primary: Figure
    changed: Figure | None
    moving_lines: tuple[int, ...]
    passages: tuple[Passage, ...]


def load_corpus(path: Path) -> dict[str, Hexagram]:
    """Read UTF-8 JSONL at path and return all 64 hexagrams keyed by pattern.

    Raise OSError for unreadable files or ValueError for incomplete or invalid data.
    """
    corpus = {}
    numbers = set()
    with path.open(encoding="utf-8") as source:
        for line_number, line in enumerate(source, 1):
            try:
                item = parse_hexagram(json.loads(line))
                figure = item.figure
                if figure.pattern in corpus or figure.number in numbers:
                    raise ValueError("卦号或卦画重复")
            except (TypeError, ValueError, KeyError) as error:
                raise ValueError(f"{path} 第 {line_number} 行：{error}") from error
            corpus[figure.pattern] = item
            numbers.add(figure.number)
    if numbers != set(range(1, 65)):
        raise ValueError(f"{path} 必须包含 1–64 号卦各一条")
    return corpus


def parse_hexagram(record: object) -> Hexagram:
    """Validate a JSON-decoded record and return the immutable hexagram.

    Raise TypeError for non-object input, ValueError for malformed fields or KeyError for missing fields.
    """
    if not isinstance(record, dict) or not isinstance(record.get("commentary"), dict):
        raise TypeError("需要一个包含 commentary 的对象")
    number = record["number"]
    pattern = record["pattern"]
    if type(number) is not int or not 1 <= number <= 64:
        raise ValueError("number 必须是 1–64 的整数")
    if not isinstance(pattern, str) or len(pattern) != 6 or set(pattern) - {"0", "1"}:
        raise ValueError("pattern 必须是按初爻到上爻排列的六位 0/1 字符串")
    figure = Figure(number, required_text(record["name"]), pattern,
                    TRIGRAMS[pattern[:3]], TRIGRAMS[pattern[3:]])
    if number in (1, 2) and pattern != ("111111" if number == 1 else "000000"):
        raise ValueError("乾坤卦画错误")
    notes = record["commentary"]
    special = number in (1, 2)
    if not special and ("extra" in record or "extra" in notes):
        raise ValueError("extra 只用于乾坤两卦")
    return Hexagram(
        figure, required_text(record["statement"]), six_texts(record["lines"]),
        required_text(notes["tuan"]), required_text(notes["image"]), six_texts(notes["lines"]),
        required_text(record["extra"]) if special else None,
        required_text(notes["extra"]) if special else None,
    )


def required_text(value: object) -> str:
    """Return stripped text from value, or raise ValueError if blank or nontext."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("应为非空文本")
    return value.strip()


def six_texts(value: object) -> tuple[str, ...]:
    """Return six nonblank strings from a bottom-to-top JSON list, or raise ValueError."""
    if not isinstance(value, list) or len(value) != 6:
        raise ValueError("爻辞或小象必须依爻位提供六条")
    return tuple(required_text(text) for text in value)


def toss_coins(randbelow: Callable[[int], int]) -> tuple[int, ...]:
    """Return six bottom-to-top coin sums, using randbelow(2) for each coin.

    The injected randbelow function must return an integer from 0 to its bound minus one.
    """
    return tuple(sum(2 + randbelow(2) for _ in range(3)) for _ in range(6))


def read_cast(values: Sequence[int], corpus: Mapping[str, Hexagram]) -> Reading:
    """Resolve six bottom-to-top values of 6–9 against a validated pattern-to-hexagram corpus.

    Return both figures, 1-based changing positions and selected passages. Raise
    ValueError when values is not a six-element sequence of the supported integers.
    """
    if not isinstance(values, Sequence) or len(values) != 6 or any(
        type(value) is not int or value not in (6, 7, 8, 9) for value in values
    ):
        raise ValueError("爻值须为六个 6、7、8、9 整数，按初爻到上爻排列")
    pattern = "".join(str(value % 2) for value in values)
    moving = tuple(position for position, value in enumerate(values, 1) if value in (6, 9))
    primary = corpus[pattern]
    changed = None
    if moving:
        changed_pattern = "".join(
            str(int(bit) ^ (position in moving)) for position, bit in enumerate(pattern, 1)
        )
        changed = corpus[changed_pattern]
    return Reading(tuple(values), primary.figure, changed.figure if changed else None,
                   moving, select_passages(primary, changed, moving))


def select_passages(
    primary: Hexagram, changed: Hexagram | None, moving: tuple[int, ...],
) -> tuple[Passage, ...]:
    """Return ordered passages for primary, changed and ascending 1-based moving positions.

    The caller supplies a changed hexagram whenever moving is nonempty.
    """
    if changed is None:
        return (statement(primary),)
    match len(moving):
        case 1 | 2:
            target, positions = primary, moving[::-1]
        case 3:
            return (statement(primary, "贞"), statement(changed, "悔"))
        case 4 | 5:
            target = changed
            positions = tuple(position for position in range(1, 7) if position not in moving)
        case _:
            if primary.extra is not None and primary.extra_image is not None:
                label = "用九" if primary.figure.number == 1 else "用六"
                return (Passage(primary.figure.number, primary.figure.name, label, None, "主",
                                primary.extra, {"小象": primary.extra_image}),)
            return (statement(changed),)
    return tuple(line_passage(target, position, "主" if i == 0 else "辅")
                 for i, position in enumerate(positions))


def statement(hexagram: Hexagram, role: str = "主") -> Passage:
    """Return hexagram's statement and two commentaries with the given reading role."""
    return Passage(hexagram.figure.number, hexagram.figure.name, "卦辞", None, role,
                   hexagram.statement, {"彖传": hexagram.tuan, "大象": hexagram.image})


def line_passage(hexagram: Hexagram, position: int, role: str) -> Passage:
    """Return the quotation and images for position (1–6) in hexagram with the given role."""
    index = position - 1
    return Passage(hexagram.figure.number, hexagram.figure.name, line_label(hexagram.figure, position), position, role,
                   hexagram.lines[index], {"小象": hexagram.line_images[index], "大象": hexagram.image})


def line_label(figure: Figure, position: int) -> str:
    """Return the traditional yin or yang line title for figure at a position from 1 to 6."""
    index = position - 1
    yin_yang = "九" if figure.pattern[index] == "1" else "六"
    order = POSITIONS[index]
    return order + yin_yang if position in (1, 6) else yin_yang + order
