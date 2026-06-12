#!/usr/bin/env python3
"""Unit tests for the grammar seed parser.

Run:
  python3 scripts/test_generate_grammar_seed.py
"""
import importlib.util
import unittest
from pathlib import Path

# Load the generator module by path (script lives alongside, not a package).
_SPEC = importlib.util.spec_from_file_location(
    "generate_grammar_seed",
    Path(__file__).resolve().parent / "generate_grammar_seed.py",
)
gen = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(gen)


class ParseQuestionLineTests(unittest.TestCase):
    LOC = "test:1"

    def test_word_order_valid(self):
        q = gen.parse_question_line(
            "word_order | 그는 여기서 5년째 일했다. | He has worked here for years. | 현재완료",
            "present-perfect",
            self.LOC,
        )
        self.assertEqual(q["question_type"], "word_order")
        # 칩은 끝 구두점 제거, answer는 원문 유지
        self.assertEqual(q["options"], ["He", "has", "worked", "here", "for", "years"])
        self.assertEqual(q["answer"], "He has worked here for years.")

    def test_blank_choice_valid(self):
        q = gen.parse_question_line(
            "blank_choice | She ___ finished. | has;have;had=has | 3인칭 단수",
            "present-perfect",
            self.LOC,
        )
        self.assertEqual(q["options"], ["has", "have", "had"])
        self.assertEqual(q["answer"], "has")

    def test_error_find_valid(self):
        q = gen.parse_question_line(
            "error_find | 틀린 곳: She have done it. | She;have;done;it=have | has가 맞음",
            "present-perfect",
            self.LOC,
        )
        self.assertEqual(q["answer"], "have")
        self.assertIn("have", q["options"])

    def test_blank_choice_answer_missing_detected(self):
        with self.assertRaises(gen.SeedError) as ctx:
            gen.parse_question_line(
                "blank_choice | She ___ done. | have;had=has | 정답이 보기에 없음",
                "t",
                self.LOC,
            )
        self.assertIn("포함되어", str(ctx.exception))

    def test_chip_ambiguity_detected(self):
        # 'the'가 두 번 → 칩 모호성으로 실패해야 한다.
        with self.assertRaises(gen.SeedError) as ctx:
            gen.parse_question_line(
                "word_order | 책상 위의 그 책 | The book on the desk. | 중복",
                "t",
                self.LOC,
            )
        self.assertIn("중복 단어", str(ctx.exception))

    def test_word_order_chip_join_mismatch_detected(self):
        # answer에 칩으로 분리 안 되는 내용은 없지만, 너무 적은 칩(<4) 검출 확인
        with self.assertRaises(gen.SeedError) as ctx:
            gen.parse_question_line(
                "word_order | 가라 | Go now home. | 칩 부족",
                "t",
                self.LOC,
            )
        self.assertIn("4~9", str(ctx.exception))

    def test_empty_explanation_detected(self):
        with self.assertRaises(gen.SeedError) as ctx:
            gen.parse_question_line(
                "blank_choice | She ___ done. | has;have=has | ",
                "t",
                self.LOC,
            )
        self.assertIn("해설", str(ctx.exception))

    def test_too_few_options_detected(self):
        with self.assertRaises(gen.SeedError) as ctx:
            gen.parse_question_line(
                "blank_choice | She ___ done. | has=has | 보기 1개",
                "t",
                self.LOC,
            )
        self.assertIn("2개 이상", str(ctx.exception))


class NormalizeAndChipTests(unittest.TestCase):
    def test_normalize_strips_case_space_punct(self):
        self.assertEqual(
            gen.normalize_sentence("  He  Has   Worked. "),
            "he has worked",
        )

    def test_chips_strip_trailing_punct(self):
        self.assertEqual(
            gen.chips_from_sentence("She left now!"),
            ["She", "left", "now"],
        )


class SqlEscapeTests(unittest.TestCase):
    def test_sql_str_escapes_single_quote(self):
        self.assertEqual(gen.sql_str("it's a test"), "'it''s a test'")

    def test_sql_str_none_and_empty(self):
        self.assertEqual(gen.sql_str(None), "NULL")
        self.assertEqual(gen.sql_str(""), "NULL")

    def test_options_jsonb_word_order_escapes_quote(self):
        q = {"question_type": "word_order", "options": ["It's", "fine"]}
        out = gen.options_jsonb(q)
        # JSON에 작은따옴표가 들어가면 '' 로 이스케이프되어야 한다.
        self.assertIn("''", out)
        self.assertTrue(out.endswith("::JSONB"))
        self.assertIn('"chips"', out)

    def test_options_jsonb_keys_per_type(self):
        self.assertIn(
            '"choices"',
            gen.options_jsonb({"question_type": "blank_choice", "options": ["a", "b"]}),
        )
        self.assertIn(
            '"segments"',
            gen.options_jsonb({"question_type": "error_find", "options": ["a", "b"]}),
        )


class DuplicateSlugTests(unittest.TestCase):
    def test_parse_topic_line_fields(self):
        t = gen.parse_topic_line(
            "topic: past-simple | 과거시제 | A2 | tense,exam | 끝난 일을 나타낸다.",
            "test:1",
        )
        self.assertEqual(t["slug"], "past-simple")
        self.assertEqual(t["tags"], ["tense", "exam"])
        self.assertEqual(t["cefr_level"], "A2")

    def test_topic_line_wrong_field_count(self):
        with self.assertRaises(gen.SeedError):
            gen.parse_topic_line("topic: past | 과거 | A2", "test:1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
