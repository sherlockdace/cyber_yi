"""Regression checks for traditional casting and the local corpus."""

import itertools
import math
import unittest
from collections import Counter
from pathlib import Path

from cyber_yi.divination import load_corpus, read_cast, toss_coins


class DivinationTests(unittest.TestCase):
    """Exercise observed examples and every supported combination."""

    @classmethod
    def setUpClass(cls) -> None:
        """Load the repository corpus once onto cls before running checks."""
        cls.corpus = load_corpus(Path("data/zhouyi.jsonl"))

    def test_toss_distribution(self) -> None:
        """Prove that the eight equal coin permutations have the expected counts."""
        counts = Counter()
        for coins in itertools.product((0, 1), repeat=3):
            sequence = iter(coins * 6)
            values = toss_coins(lambda _, sequence=sequence: next(sequence))
            self.assertEqual(values, (values[0],) * 6)
            counts[values[0]] += 1
        self.assertEqual(counts, {6: 1, 7: 3, 8: 3, 9: 1})

    def test_selection_examples(self) -> None:
        """Verify source figure, position, ordering and roles against known casts."""
        cases = (
            ((7, 7, 7, 7, 7, 7), 1, None, [(1, "卦辞", "主")]),
            ((9, 7, 7, 7, 7, 7), 1, 44, [(1, "初九", "主")]),
            ((7, 9, 7, 7, 7, 7), 1, 13, [(1, "九二", "主")]),
            ((9, 9, 7, 7, 7, 7), 1, 33, [(1, "九二", "主"), (1, "初九", "辅")]),
            ((9, 8, 8, 6, 9, 8), 3, 16, [(3, "卦辞", "贞"), (16, "卦辞", "悔")]),
            ((9, 9, 9, 9, 7, 7), 1, 20, [(20, "九五", "主"), (20, "上九", "辅")]),
            ((9, 9, 9, 9, 9, 7), 1, 23, [(23, "上九", "主")]),
            ((9, 9, 9, 9, 9, 9), 1, 2, [(1, "用九", "主")]),
            ((6, 6, 6, 6, 6, 6), 2, 1, [(2, "用六", "主")]),
            ((9, 6, 6, 6, 9, 6), 3, 50, [(50, "卦辞", "主")]),
        )
        for values, primary, changed, passages in cases:
            with self.subTest(values=values):
                result = read_cast(values, self.corpus)
                self.assertEqual(result.primary.number, primary)
                self.assertEqual(result.changed.number if result.changed else None, changed)
                self.assertEqual([(p.hexagram_number, p.label, p.role) for p in result.passages], passages)
        heng = read_cast((8, 9, 7, 7, 8, 8), self.corpus).passages[0]
        self.assertEqual(heng.text, "悔亡。")
        self.assertIn("能久中也", heng.commentary["小象"])

    def test_every_six_line_cast(self) -> None:
        """Resolve all 4,096 casts with nonempty passages and the matching commentary type."""
        counts = Counter()
        for values in itertools.product((6, 7, 8, 9), repeat=6):
            result = read_cast(values, self.corpus)
            moved = len(result.moving_lines)
            counts[moved] += 1
            self.assertEqual(result.changed is not None, moved > 0)
            self.assertEqual(len(result.passages), 2 if moved in (2, 3, 4) else 1)
            for passage in result.passages:
                self.assertTrue(passage.text)
                self.assertIn("彖传" if passage.label == "卦辞" else "小象", passage.commentary)
                self.assertTrue(all(passage.commentary.values()))
        self.assertEqual(counts, {count: 64 * math.comb(6, count) for count in range(7)})

    def test_invalid_values(self) -> None:
        """Reject missing lines, out-of-range numbers, booleans and string values."""
        for values in (None, [], [7] * 5, [7] * 5 + [10], [7] * 5 + [True], [7] * 5 + ["7"]):
            with self.subTest(values=values), self.assertRaises(ValueError):
                read_cast(values, self.corpus)
