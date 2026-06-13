#!/usr/bin/env python3
"""Unit tests for the speaking seed parser.

Run:
  python3 scripts/test_generate_speaking_seed.py

대상: scripts/generate_speaking_seed.py (미구현) — 모두 red여야 함
test_generate_listening_seed.py 구조 미러링.

배치 형식(scripts/speaking_content/batch_*.txt):
  scenario: slug | 제목(한국어) | emoji | difficulty(1~5) | min_level | context(영어 1~2문장 상황)
  ted | text_en
  user | text_en(기대 답안) | hint_ko(한국어 힌트)
"""
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

# Load the generator module by path (script lives alongside, not a package).
_SPEC = importlib.util.spec_from_file_location(
    "generate_speaking_seed",
    Path(__file__).resolve().parent / "generate_speaking_seed.py",
)
gen = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(gen)


# ────────────────────────────────────────────────────────────
# Helper
# ────────────────────────────────────────────────────────────

def write_tmp(content: str) -> str:
    fd, path = tempfile.mkstemp(suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(content)
    return path


# ────────────────────────────────────────────────────────────
# 1. parse_scenario_line
# ────────────────────────────────────────────────────────────

class ParseScenarioLineTests(unittest.TestCase):
    LOC = "test:1"

    def test_valid_scenario_line(self):
        """정상 scenario 줄 파싱."""
        s = gen.parse_scenario_line(
            "scenario: cafe-order | 카페 주문 | ☕ | 2 | 1"
            " | You are ordering at a café. The barista is friendly.",
            self.LOC,
        )
        self.assertEqual(s["slug"], "cafe-order")
        self.assertEqual(s["title"], "카페 주문")
        self.assertEqual(s["emoji"], "☕")
        self.assertEqual(s["difficulty"], 2)
        self.assertEqual(s["min_level"], 1)
        self.assertIn("café", s["context"])

    def test_difficulty_range_1_to_5(self):
        """difficulty 1~5 범위 밖이면 ValueError 또는 SeedError."""
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_scenario_line(
                "scenario: test | 제목 | 🏠 | 0 | 1 | Context here.",
                self.LOC,
            )
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_scenario_line(
                "scenario: test | 제목 | 🏠 | 6 | 1 | Context here.",
                self.LOC,
            )

    def test_difficulty_boundary_valid(self):
        """difficulty 1과 5는 유효."""
        s1 = gen.parse_scenario_line(
            "scenario: slug-a | 제목 | 🏠 | 1 | 1 | Context for scenario one.",
            self.LOC,
        )
        self.assertEqual(s1["difficulty"], 1)

        s5 = gen.parse_scenario_line(
            "scenario: slug-b | 제목 | 🏢 | 5 | 3 | Advanced context here.",
            self.LOC,
        )
        self.assertEqual(s5["difficulty"], 5)

    def test_min_level_parsed_as_int(self):
        """min_level은 정수로 파싱."""
        s = gen.parse_scenario_line(
            "scenario: test | 제목 | 🏠 | 3 | 2 | Some context.",
            self.LOC,
        )
        self.assertEqual(s["min_level"], 2)
        self.assertIsInstance(s["min_level"], int)

    def test_too_few_fields_raises(self):
        """필드 수 부족 → 에러."""
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_scenario_line("scenario: slug | 제목", self.LOC)

    def test_sort_order_assigned(self):
        """sort_order 필드가 반환됨 (0 이상 정수)."""
        s = gen.parse_scenario_line(
            "scenario: cafe | 카페 | ☕ | 1 | 1 | You are at a café.",
            self.LOC,
        )
        self.assertIn("sort_order", s)
        self.assertIsInstance(s["sort_order"], int)


# ────────────────────────────────────────────────────────────
# 2. parse_turn_line
# ────────────────────────────────────────────────────────────

class ParseTurnLineTests(unittest.TestCase):
    LOC = "test:1"

    def test_valid_ted_turn(self):
        """ted 줄 파싱 — hint 없음."""
        t = gen.parse_turn_line(
            "ted | Hello, what can I get you?",
            "cafe-order",
            1,
            self.LOC,
        )
        self.assertEqual(t["speaker"], "ted")
        self.assertEqual(t["text_en"], "Hello, what can I get you?")
        self.assertEqual(t["scenario_slug"], "cafe-order")
        self.assertEqual(t["turn_order"], 1)
        # ted 턴은 hint_ko 없음
        self.assertIsNone(t.get("hint_ko"))

    def test_valid_user_turn(self):
        """user 줄 파싱 — hint_ko 필수."""
        t = gen.parse_turn_line(
            "user | I would like a coffee please. | 커피 한 잔 주세요.",
            "cafe-order",
            2,
            self.LOC,
        )
        self.assertEqual(t["speaker"], "user")
        self.assertEqual(t["text_en"], "I would like a coffee please.")
        self.assertEqual(t["hint_ko"], "커피 한 잔 주세요.")
        self.assertEqual(t["turn_order"], 2)

    def test_user_turn_without_hint_raises(self):
        """user 줄에 hint_ko 없으면 에러."""
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_turn_line(
                "user | I would like a coffee please.",
                "cafe-order",
                2,
                self.LOC,
            )

    def test_invalid_speaker_raises(self):
        """ted/user 외의 speaker → 에러."""
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.parse_turn_line(
                "customer | I want coffee. | 커피 주세요.",
                "cafe-order",
                1,
                self.LOC,
            )

    def test_turn_has_id(self):
        """반환 딕셔너리에 id 필드 포함."""
        t = gen.parse_turn_line(
            "ted | Good morning!",
            "hotel-checkin",
            1,
            self.LOC,
        )
        self.assertIn("id", t)
        self.assertTrue(len(t["id"]) > 0)


# ────────────────────────────────────────────────────────────
# 3. parse_batch_file
# ────────────────────────────────────────────────────────────

class ParseBatchFileTests(unittest.TestCase):

    def test_blank_lines_and_comments_ignored(self):
        """빈 줄과 # 주석은 무시."""
        path = write_tmp(
            "# 이것은 주석\n"
            "\n"
            "scenario: cafe-order | 카페 주문 | ☕ | 1 | 1 | You are at a café.\n"
            "ted | Hello!\n"
            "user | Hi there. | 안녕하세요.\n"
            "ted | What would you like?\n"
            "user | Coffee please. | 커피 주세요.\n"
            "ted | Coming right up!\n"
            "\n"
            "# 또 다른 주석\n"
        )
        scenarios, turns = gen.parse_batch_file(path)
        self.assertEqual(len(scenarios), 1)
        self.assertEqual(len(turns), 5)

    def test_turns_belong_to_preceding_scenario(self):
        """턴은 직전 scenario에 소속."""
        path = write_tmp(
            "scenario: cafe-order | 카페 | ☕ | 1 | 1 | You are at a café.\n"
            "ted | Hello!\n"
            "user | Hi. | 안녕.\n"
            "ted | What do you want?\n"
            "user | Coffee. | 커피.\n"
            "ted | Sure!\n"
            "scenario: hotel-checkin | 호텔 | 🏨 | 2 | 2 | You are checking in.\n"
            "ted | Welcome!\n"
            "user | I have a reservation. | 예약했습니다.\n"
            "ted | Name please?\n"
            "user | Kim. | 김입니다.\n"
            "ted | Thank you!\n"
        )
        scenarios, turns = gen.parse_batch_file(path)
        self.assertEqual(len(scenarios), 2)
        cafe_turns = [t for t in turns if t["scenario_slug"] == "cafe-order"]
        hotel_turns = [t for t in turns if t["scenario_slug"] == "hotel-checkin"]
        self.assertEqual(len(cafe_turns), 5)
        self.assertEqual(len(hotel_turns), 5)

    def test_two_scenarios_parsed(self):
        """시나리오 2개 파싱."""
        path = write_tmp(
            "scenario: s1 | 제목1 | ☕ | 1 | 1 | Context one here.\n"
            "ted | Turn one.\n"
            "user | Response one. | 응답 하나.\n"
            "ted | Follow up.\n"
            "user | More response. | 더 많은 응답.\n"
            "ted | Good!\n"
            "scenario: s2 | 제목2 | 🏨 | 2 | 1 | Context two here.\n"
            "ted | Hello s2.\n"
            "user | Hi s2. | 안녕 s2.\n"
            "ted | Welcome s2.\n"
            "user | Thank you. | 감사합니다.\n"
            "ted | See you.\n"
        )
        scenarios, turns = gen.parse_batch_file(path)
        self.assertEqual(len(scenarios), 2)


# ────────────────────────────────────────────────────────────
# 4. validate
# ────────────────────────────────────────────────────────────

class ValidateTests(unittest.TestCase):

    def _make_scenario(self, slug, sort_order=1):
        return {
            "slug": slug,
            "title": f"제목-{slug}",
            "emoji": "☕",
            "difficulty": 2,
            "min_level": 1,
            "context": "Some context here.",
            "sort_order": sort_order,
        }

    def _make_turns(self, slug, count=5):
        """ted 시작, user 최소 1개, 5턴(ted-user-ted-user-ted) 구조."""
        turns = []
        for i in range(count):
            speaker = "ted" if i % 2 == 0 else "user"
            t = {
                "id": f"t-{slug}-{i}",
                "scenario_slug": slug,
                "turn_order": i + 1,
                "speaker": speaker,
                "text_en": f"Turn {i + 1} text.",
                "hint_ko": "힌트." if speaker == "user" else None,
            }
            turns.append(t)
        return turns

    def test_valid_scenario_5_turns_passes(self):
        """시나리오당 5턴 → 통과."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = self._make_turns("cafe-order", 5)
        gen.validate(scenarios, turns)

    def test_valid_scenario_7_turns_passes(self):
        """시나리오당 7턴 → 통과."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = self._make_turns("cafe-order", 7)
        gen.validate(scenarios, turns)

    def test_too_few_turns_raises(self):
        """턴 4개 이하 → ValueError (최소 5턴)."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = self._make_turns("cafe-order", 4)
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(scenarios, turns)

    def test_too_many_turns_raises(self):
        """턴 8개 이상 → ValueError (최대 7턴)."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = self._make_turns("cafe-order", 8)
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(scenarios, turns)

    def test_first_turn_must_be_ted(self):
        """첫 턴은 반드시 ted → user로 시작하면 에러."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = self._make_turns("cafe-order", 5)
        # 첫 턴을 user로 바꿈
        turns[0]["speaker"] = "user"
        turns[0]["hint_ko"] = "힌트."
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(scenarios, turns)

    def test_at_least_one_user_turn_required(self):
        """user 턴 0개(전부 ted) → 에러."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = [
            {"id": f"t{i}", "scenario_slug": "cafe-order", "turn_order": i + 1,
             "speaker": "ted", "text_en": f"Ted turn {i+1}.", "hint_ko": None}
            for i in range(5)
        ]
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(scenarios, turns)

    def test_consecutive_user_turns_raises(self):
        """연속 user 턴 금지."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = [
            {"id": "t1", "scenario_slug": "cafe-order", "turn_order": 1, "speaker": "ted", "text_en": "Hi.", "hint_ko": None},
            {"id": "t2", "scenario_slug": "cafe-order", "turn_order": 2, "speaker": "user", "text_en": "Hello.", "hint_ko": "안녕."},
            {"id": "t3", "scenario_slug": "cafe-order", "turn_order": 3, "speaker": "user", "text_en": "And also.", "hint_ko": "또."},  # 연속 user
            {"id": "t4", "scenario_slug": "cafe-order", "turn_order": 4, "speaker": "ted", "text_en": "OK.", "hint_ko": None},
            {"id": "t5", "scenario_slug": "cafe-order", "turn_order": 5, "speaker": "ted", "text_en": "Bye.", "hint_ko": None},
        ]
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(scenarios, turns)

    def test_duplicate_slug_raises(self):
        """slug 중복 → ValueError."""
        scenarios = [
            self._make_scenario("cafe-order", sort_order=1),
            self._make_scenario("cafe-order", sort_order=2),  # 중복
        ]
        turns = self._make_turns("cafe-order", 5)
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(scenarios, turns)

    def test_orphan_turn_raises(self):
        """시나리오 없는 턴(고아 턴) → ValueError."""
        scenarios = [self._make_scenario("cafe-order")]
        turns = self._make_turns("cafe-order", 5)
        turns.append({
            "id": "orphan-1",
            "scenario_slug": "nonexistent-slug",  # 고아 턴
            "turn_order": 1,
            "speaker": "ted",
            "text_en": "Orphan turn.",
            "hint_ko": None,
        })
        with self.assertRaises((ValueError, gen.SeedError)):
            gen.validate(scenarios, turns)

    def test_multiple_valid_scenarios_passes(self):
        """여러 시나리오 모두 5~7턴 → 통과."""
        scenarios = [
            self._make_scenario("cafe-order", 1),
            self._make_scenario("hotel-checkin", 2),
        ]
        turns = self._make_turns("cafe-order", 5) + self._make_turns("hotel-checkin", 7)
        gen.validate(scenarios, turns)


# ────────────────────────────────────────────────────────────
# 5. 출력 구조 (JSON + SQL)
# ────────────────────────────────────────────────────────────

class OutputStructureTests(unittest.TestCase):
    """generate_speaking_seed 함수 호출 시 출력 구조 검증."""

    BATCH_CONTENT = (
        "scenario: cafe-order | 카페 주문 | ☕ | 1 | 1 | You are ordering at a café.\n"
        "ted | Hello! What can I get you?\n"
        "user | I would like a coffee please. | 커피 한 잔 주세요.\n"
        "ted | What size?\n"
        "user | Large please. | 큰 사이즈로 주세요.\n"
        "ted | Coming right up!\n"
    )

    def setUp(self):
        self.batch_path = write_tmp(self.BATCH_CONTENT)
        self.scenarios, self.turns = gen.parse_batch_file(self.batch_path)

    def test_scenarios_have_required_fields(self):
        """시나리오 딕셔너리에 필수 필드 모두 포함."""
        s = self.scenarios[0]
        for field in ("slug", "title", "emoji", "difficulty", "min_level", "context", "sort_order"):
            self.assertIn(field, s, f"Missing field: {field}")

    def test_turns_have_required_fields(self):
        """턴 딕셔너리에 필수 필드 모두 포함."""
        for t in self.turns:
            for field in ("id", "scenario_slug", "turn_order", "speaker", "text_en"):
                self.assertIn(field, t, f"Missing field: {field}")
            if t["speaker"] == "user":
                self.assertIn("hint_ko", t)

    def test_turns_hint_ko_null_for_ted(self):
        """ted 턴의 hint_ko는 None."""
        ted_turns = [t for t in self.turns if t["speaker"] == "ted"]
        for t in ted_turns:
            self.assertIsNone(t.get("hint_ko"))

    def test_json_output_structure(self):
        """generate_speaking_pack 함수가 {scenarios, turns} 구조 반환."""
        # generate_speaking_pack(scenarios, turns) → dict
        result = gen.generate_speaking_pack(self.scenarios, self.turns)
        self.assertIn("scenarios", result)
        self.assertIn("turns", result)
        self.assertIsInstance(result["scenarios"], list)
        self.assertIsInstance(result["turns"], list)

    def test_sql_output_idempotent(self):
        """generate_sql 함수가 ON CONFLICT 포함한 SQL 반환."""
        sql = gen.generate_sql(self.scenarios, self.turns)
        self.assertIsInstance(sql, str)
        # ON CONFLICT → idempotent upsert
        self.assertIn("ON CONFLICT", sql)
        # 시나리오 slug 포함
        self.assertIn("cafe-order", sql)


# ────────────────────────────────────────────────────────────
# 6. SeedError 존재 확인
# ────────────────────────────────────────────────────────────

class SeedErrorTests(unittest.TestCase):
    def test_seed_error_is_exception(self):
        """SeedError가 예외 클래스로 정의됨."""
        self.assertTrue(issubclass(gen.SeedError, Exception))


if __name__ == "__main__":
    unittest.main(verbosity=2)
