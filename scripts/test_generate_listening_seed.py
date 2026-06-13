#!/usr/bin/env python3
"""Unit tests for the listening seed parser.

Run:
  python3 scripts/test_generate_listening_seed.py

대상: scripts/generate_listening_seed.py (미구현) — 모두 red여야 함
test_generate_grammar_seed.py 구조 미러링.
"""
import importlib.util
import unittest
from pathlib import Path

# Load the generator module by path (script lives alongside, not a package).
_SPEC = importlib.util.spec_from_file_location(
    "generate_listening_seed",
    Path(__file__).resolve().parent / "generate_listening_seed.py",
)
gen = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(gen)


class ParseClipLineTests(unittest.TestCase):
    LOC = "test:1"

    def test_valid_clip_line(self):
        """정상 clip 줄 파싱."""
        c = gen.parse_clip_line(
            "clip: office-meeting | 사내 회의 공지 | 2 | office,meeting"
            " | The meeting starts at nine AM in room 301."
            " | 회의는 오전 9시 301호에서 시작합니다.",
            self.LOC,
        )
        self.assertEqual(c["slug"], "office-meeting")
        self.assertEqual(c["title"], "사내 회의 공지")
        self.assertEqual(c["difficulty"], 2)
        self.assertEqual(c["tags"], ["office", "meeting"])
        self.assertEqual(c["transcript_en"], "The meeting starts at nine AM in room 301.")
        self.assertEqual(c["transcript_ko"], "회의는 오전 9시 301호에서 시작합니다.")

    def test_duration_seconds_calculated_from_word_count(self):
        """duration_seconds = round(단어수 / 2.5) 계산."""
        # "The meeting starts at nine AM in room 301." → 8 단어 → round(8/2.5) = 3
        c = gen.parse_clip_line(
            "clip: test-slug | 제목 | 1 | test"
            " | The meeting starts at nine AM in room 301."
            " | 한국어 번역.",
            self.LOC,
        )
        words_in_transcript = len("The meeting starts at nine AM in room 301.".split())
        expected_duration = round(words_in_transcript / 2.5)
        self.assertEqual(c["duration_seconds"], expected_duration)

    def test_difficulty_range_1_to_5(self):
        """difficulty 1~5 범위 밖이면 ValueError."""
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_clip_line(
                "clip: test | 제목 | 0 | tag | Transcript. | 번역.",
                self.LOC,
            )
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_clip_line(
                "clip: test | 제목 | 6 | tag | Transcript. | 번역.",
                self.LOC,
            )

    def test_difficulty_boundary_valid(self):
        """difficulty 1과 5는 유효."""
        c1 = gen.parse_clip_line(
            "clip: slug-a | 제목 | 1 | tag | Valid transcript sentence. | 번역.",
            self.LOC,
        )
        self.assertEqual(c1["difficulty"], 1)

        c5 = gen.parse_clip_line(
            "clip: slug-b | 제목 | 5 | tag | Another valid transcript here. | 번역.",
            self.LOC,
        )
        self.assertEqual(c5["difficulty"], 5)

    def test_tags_comma_separated(self):
        """tags는 콤마로 분리된 리스트."""
        c = gen.parse_clip_line(
            "clip: slug | 제목 | 3 | travel,airport,announcement"
            " | Flight departs at noon. | 비행기 정오 출발.",
            self.LOC,
        )
        self.assertEqual(c["tags"], ["travel", "airport", "announcement"])

    def test_single_tag(self):
        """태그 1개도 리스트로."""
        c = gen.parse_clip_line(
            "clip: slug | 제목 | 2 | office | Meeting at two. | 2시에 회의.",
            self.LOC,
        )
        self.assertEqual(c["tags"], ["office"])

    def test_too_few_fields_raises(self):
        """필드 수 부족 → 에러."""
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_clip_line("clip: slug | 제목 | 2", self.LOC)


class ParseQuestionLineTests(unittest.TestCase):
    LOC = "test:1"

    def test_valid_question_line(self):
        """정상 q 줄 파싱."""
        q = gen.parse_question_line(
            "q | When does the meeting start?"
            " | At 8;At 9=At 9;At 10;At noon"
            " | 9시에 시작한다고 했습니다.",
            "office-meeting",
            self.LOC,
        )
        self.assertEqual(q["clip_slug"], "office-meeting")
        self.assertEqual(q["prompt"], "When does the meeting start?")
        self.assertEqual(q["answer"], "At 9")
        self.assertIn("At 9", q["choices"])
        self.assertIn("At 8", q["choices"])
        self.assertEqual(q["explanation"], "9시에 시작한다고 했습니다.")

    def test_answer_not_in_choices_raises(self):
        """정답이 choices에 포함 안 되면 ValueError."""
        with self.assertRaises((ValueError, gen.SeedError)) as ctx:
            gen.parse_question_line(
                "q | What time? | At 8;At 10;At noon=At 9 | 9시.",
                "slug",
                self.LOC,
            )
        self.assertIn("포함", str(ctx.exception))

    def test_too_few_fields_raises(self):
        """필드 수 부족 → 에러."""
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_question_line("q | 질문만", "slug", self.LOC)

    def test_choices_parsed_correctly(self):
        """보기는 세미콜론으로 분리, =로 정답 표시."""
        q = gen.parse_question_line(
            "q | Where? | Room A;Room B=Room B;Room C;Room D | B에서 진행.",
            "slug",
            self.LOC,
        )
        self.assertEqual(q["answer"], "Room B")
        self.assertEqual(set(q["choices"]), {"Room A", "Room B", "Room C", "Room D"})


class ParseBatchFileTests(unittest.TestCase):
    """parse_batch_file 통합 테스트 — 임시 파일 생성."""

    def _write_tmp(self, content: str) -> str:
        import tempfile
        import os
        fd, path = tempfile.mkstemp(suffix=".txt")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def test_blank_lines_and_comments_ignored(self):
        """빈 줄과 # 주석은 무시."""
        path = self._write_tmp(
            "# 이것은 주석\n"
            "\n"
            "clip: office | 제목 | 2 | tag | The meeting is at nine. | 9시 회의.\n"
            "q | What time? | At 8;At 9=At 9;At 10;At noon | 9시입니다.\n"
            "\n"
            "# 또 다른 주석\n"
        )
        clips, questions = gen.parse_batch_file(path)
        self.assertEqual(len(clips), 1)
        self.assertEqual(len(questions), 1)

    def test_questions_belong_to_preceding_clip(self):
        """q 줄은 직전 clip에 소속."""
        path = self._write_tmp(
            "clip: clip-a | A 제목 | 1 | tag | Sentence one here. | 번역.\n"
            "q | Q1? | A;B=A;C;D | A입니다.\n"
            "clip: clip-b | B 제목 | 2 | tag | Sentence two here. | 번역.\n"
            "q | Q2? | A;B;C=B;D | B입니다.\n"
        )
        clips, questions = gen.parse_batch_file(path)
        self.assertEqual(len(clips), 2)
        self.assertEqual(len(questions), 2)
        a_qs = [q for q in questions if q["clip_slug"] == "clip-a"]
        b_qs = [q for q in questions if q["clip_slug"] == "clip-b"]
        self.assertEqual(len(a_qs), 1)
        self.assertEqual(len(b_qs), 1)

    def test_two_questions_per_clip(self):
        """클립당 2개 문항도 정상 파싱."""
        path = self._write_tmp(
            "clip: clip-x | X 제목 | 3 | tag | The quick brown fox jumps. | 번역.\n"
            "q | Q1? | A;B=A;C;D | A.\n"
            "q | Q2? | X;Y;Z=Y;W | Y.\n"
        )
        clips, questions = gen.parse_batch_file(path)
        self.assertEqual(len(clips), 1)
        self.assertEqual(len(questions), 2)
        self.assertTrue(all(q["clip_slug"] == "clip-x" for q in questions))


class ValidateTests(unittest.TestCase):
    """validate(clips, questions) 검증 테스트."""

    def _make_clip(self, slug, sort_order=1):
        return {
            "slug": slug,
            "title": f"제목-{slug}",
            "difficulty": 2,
            "tags": ["tag"],
            "transcript_en": "Some transcript sentence here.",
            "transcript_ko": "번역.",
            "duration_seconds": 4,
            "sort_order": sort_order,
        }

    def _make_question(self, clip_slug, sort_order=1, q_id="q1"):
        return {
            "id": q_id,
            "clip_slug": clip_slug,
            "prompt": "What?",
            "choices": ["A", "B", "C", "D"],
            "answer": "A",
            "explanation": "A입니다.",
            "sort_order": sort_order,
        }

    def test_valid_one_question_per_clip_passes(self):
        """클립당 1개 문항 → 통과."""
        clips = [self._make_clip("clip-a")]
        questions = [self._make_question("clip-a")]
        # 에러 없이 통과해야 함
        gen.validate(clips, questions)

    def test_valid_two_questions_per_clip_passes(self):
        """클립당 2개 문항 → 통과."""
        clips = [self._make_clip("clip-a")]
        questions = [
            self._make_question("clip-a", sort_order=1, q_id="q1"),
            self._make_question("clip-a", sort_order=2, q_id="q2"),
        ]
        gen.validate(clips, questions)

    def test_zero_questions_per_clip_raises(self):
        """문항 0개인 클립 → ValueError."""
        clips = [self._make_clip("clip-a")]
        questions = []  # 문항 없음
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(clips, questions)

    def test_three_questions_per_clip_raises(self):
        """문항 3개 이상인 클립 → ValueError."""
        clips = [self._make_clip("clip-a")]
        questions = [
            self._make_question("clip-a", sort_order=1, q_id="q1"),
            self._make_question("clip-a", sort_order=2, q_id="q2"),
            self._make_question("clip-a", sort_order=3, q_id="q3"),
        ]
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(clips, questions)

    def test_orphan_question_raises(self):
        """clip_slug 매칭 안 되는 문항 → ValueError."""
        clips = [self._make_clip("clip-a")]
        questions = [
            self._make_question("clip-a"),
            self._make_question("nonexistent-slug"),  # 고아 문항
        ]
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(clips, questions)

    def test_multiple_clips_all_valid(self):
        """여러 클립 모두 1~2개 문항 → 통과."""
        clips = [self._make_clip("clip-a"), self._make_clip("clip-b")]
        questions = [
            self._make_question("clip-a", sort_order=1, q_id="qa1"),
            self._make_question("clip-b", sort_order=1, q_id="qb1"),
            self._make_question("clip-b", sort_order=2, q_id="qb2"),
        ]
        gen.validate(clips, questions)


class DurationSecondsTests(unittest.TestCase):
    """duration_seconds 계산 상세 검증."""

    LOC = "test:1"

    def test_longer_transcript_longer_duration(self):
        """단어 수가 많을수록 duration_seconds가 커짐."""
        short = gen.parse_clip_line(
            "clip: short | 짧은 | 1 | tag | Go now. | 가라.",
            self.LOC,
        )
        long_ = gen.parse_clip_line(
            "clip: long | 긴 | 1 | tag"
            " | The quick brown fox jumps over the lazy dog near the river."
            " | 번역.",
            self.LOC,
        )
        self.assertGreater(long_["duration_seconds"], short["duration_seconds"])

    def test_rounding(self):
        """round() 적용 확인 — 5단어 → round(5/2.5) = 2."""
        c = gen.parse_clip_line(
            "clip: slug | 제목 | 1 | tag | One two three four five. | 번역.",
            self.LOC,
        )
        self.assertEqual(c["duration_seconds"], 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
