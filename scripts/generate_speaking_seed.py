#!/usr/bin/env python3
"""Generate speaking content pack + seed SQL from batch text files.

Reads scripts/speaking_content/batch_*.txt, validates every scenario/turn, and
emits two artifacts:

  a. content/speaking-pack.json — structured pack consumed by the app/repository
  b. supabase/migrations/006_speaking.sql — idempotent schema fixes + seed INSERTs

Batch format (scripts/speaking_content/*.txt):

  scenario: slug | 제목(한국어) | emoji | difficulty(1~5) | min_level | context(영어 1~2문장)
  ted | text_en
  user | text_en(기대 답안) | hint_ko(한국어 힌트)

A turn line belongs to the most recent scenario line. Each scenario carries
5~7 turns: 첫 턴은 ted, ted/user 교대(연속 user 금지), user 최소 1개.

Validation failures raise SeedError and abort with a clear message.

Run:
  python3 scripts/generate_speaking_seed.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "scripts" / "speaking_content"
JSON_OUTPUT = ROOT / "content" / "speaking-pack.json"
SQL_OUTPUT = ROOT / "supabase" / "migrations" / "006_speaking.sql"
SCRIPT_REL = "scripts/generate_speaking_seed.py"

MIN_TURNS_PER_SCENARIO = 5
MAX_TURNS_PER_SCENARIO = 7
MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 5
MIN_LEVEL_FLOOR = 1
MIN_LEVEL_CEIL = 99

VALID_SPEAKERS = ("ted", "user")


class SeedError(Exception):
    """Raised on any content validation failure."""


# --------------------------------------------------------------------------- #
# Parsers
# --------------------------------------------------------------------------- #

def parse_scenario_line(line: str, location: str, sort_order: int = 0) -> dict:
    """Parse a `scenario:` line into a dict.

    Format: scenario: slug | 제목 | emoji | difficulty | min_level | context
    """
    body = (
        line[len("scenario:"):].strip()
        if line.startswith("scenario:")
        else line.strip()
    )
    parts = [p.strip() for p in body.split("|")]
    if len(parts) != 6:
        raise SeedError(
            f"{location}: scenario 라인은 "
            f"'slug | 제목 | emoji | difficulty | min_level | context' "
            f"6필드가 필요합니다 (현재 {len(parts)}필드): {line!r}"
        )
    slug, title, emoji, difficulty_raw, min_level_raw, context = parts
    if not slug:
        raise SeedError(f"{location}: scenario slug가 비어 있습니다.")
    if not title:
        raise SeedError(f"{location}: scenario 제목이 비어 있습니다 (slug={slug}).")
    if not emoji:
        raise SeedError(f"{location}: emoji가 비어 있습니다 (slug={slug}).")
    if not context:
        raise SeedError(f"{location}: context가 비어 있습니다 (slug={slug}).")

    try:
        difficulty = int(difficulty_raw)
    except ValueError:
        raise SeedError(
            f"{location}: difficulty가 정수가 아닙니다: {difficulty_raw!r}"
        )
    if difficulty < MIN_DIFFICULTY or difficulty > MAX_DIFFICULTY:
        raise SeedError(
            f"{location}: difficulty는 {MIN_DIFFICULTY}~{MAX_DIFFICULTY} 범위여야 "
            f"합니다 (현재 {difficulty}): slug={slug}"
        )

    try:
        min_level = int(min_level_raw)
    except ValueError:
        raise SeedError(
            f"{location}: min_level이 정수가 아닙니다: {min_level_raw!r}"
        )
    if min_level < MIN_LEVEL_FLOOR or min_level > MIN_LEVEL_CEIL:
        raise SeedError(
            f"{location}: min_level은 {MIN_LEVEL_FLOOR}~{MIN_LEVEL_CEIL} 범위여야 "
            f"합니다 (현재 {min_level}): slug={slug}"
        )

    return {
        "slug": slug,
        "title": title,
        "emoji": emoji,
        "difficulty": difficulty,
        "min_level": min_level,
        "context": context,
        "sort_order": sort_order,
    }


def parse_turn_line(
    line: str, scenario_slug: str, order: int, location: str
) -> dict:
    """Parse a `ted | ...` or `user | ... | hint` line into a dict.

    ted turns have no hint_ko (None); user turns require hint_ko.
    The deterministic id is '{scenario_slug}:{order}'.
    """
    parts = [p.strip() for p in line.split("|")]
    if len(parts) < 2:
        raise SeedError(
            f"{location}: turn 라인은 최소 'speaker | text_en' 형식이어야 합니다: "
            f"{line!r}"
        )
    speaker = parts[0]
    if speaker not in VALID_SPEAKERS:
        raise SeedError(
            f"{location}: speaker는 {VALID_SPEAKERS} 중 하나여야 합니다 "
            f"(현재 {speaker!r})."
        )

    text_en = parts[1]
    if not text_en:
        raise SeedError(f"{location}: text_en이 비어 있습니다 ({speaker}).")

    hint_ko = None
    if speaker == "user":
        if len(parts) < 3 or not parts[2]:
            raise SeedError(
                f"{location}: user 턴은 hint_ko가 필수입니다: {line!r}"
            )
        hint_ko = parts[2]
    else:  # ted
        if len(parts) >= 3 and parts[2]:
            raise SeedError(
                f"{location}: ted 턴에는 hint_ko를 둘 수 없습니다: {line!r}"
            )

    return {
        "id": f"{scenario_slug}:{order}",
        "scenario_slug": scenario_slug,
        "turn_order": order,
        "speaker": speaker,
        "text_en": text_en,
        "hint_ko": hint_ko,
    }


def parse_batch_file(path: str | Path) -> tuple[list[dict], list[dict]]:
    """Parse a single batch file into (scenarios, turns).

    Turns belong to the most recent scenario; turn_order is 1-based within
    each scenario. Blank lines and `#` comments are ignored.
    """
    path = Path(path)
    scenarios: list[dict] = []
    turns: list[dict] = []
    current_slug: str | None = None
    turn_counter = 0
    scenario_counter = 0

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        location = f"{path.name}:{lineno}"
        if line == "" or line.startswith("#"):
            continue
        if line.startswith("scenario:"):
            scenario_counter += 1
            scenario = parse_scenario_line(line, location, scenario_counter)
            scenarios.append(scenario)
            current_slug = scenario["slug"]
            turn_counter = 0
        elif line.split("|", 1)[0].strip() in VALID_SPEAKERS:
            if current_slug is None:
                raise SeedError(
                    f"{location}: scenario 라인보다 먼저 턴이 등장했습니다: {line!r}"
                )
            turn_counter += 1
            turns.append(
                parse_turn_line(line, current_slug, turn_counter, location)
            )
        else:
            raise SeedError(
                f"{location}: 알 수 없는 라인 "
                f"(scenario: 또는 ted/user 로 시작해야 함): {line!r}"
            )

    return scenarios, turns


def parse_batches() -> tuple[list[dict], list[dict]]:
    """Parse every batch_*.txt into ordered (scenarios, turns) lists.

    Re-assigns global deterministic sort_order to scenarios across files and
    guards against duplicate slugs.
    """
    files = sorted(CONTENT_DIR.glob("batch_*.txt"))
    if not files:
        raise SeedError(f"배치 파일이 없습니다: {CONTENT_DIR}/batch_*.txt")

    scenarios: list[dict] = []
    turns: list[dict] = []
    seen_slugs: dict[str, str] = {}

    for path in files:
        rel = path.relative_to(ROOT)
        file_scenarios, file_turns = parse_batch_file(path)
        for scenario in file_scenarios:
            if scenario["slug"] in seen_slugs:
                raise SeedError(
                    f"{rel}: slug {scenario['slug']!r}가 중복됩니다 "
                    f"(앞선 정의: {seen_slugs[scenario['slug']]})"
                )
            seen_slugs[scenario["slug"]] = str(rel)
            scenarios.append(scenario)
        turns.extend(file_turns)

    # Global deterministic sort_order (1-based, file then in-file order).
    for order, scenario in enumerate(scenarios, 1):
        scenario["sort_order"] = order

    return scenarios, turns


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def validate(scenarios: list[dict], turns: list[dict]) -> None:
    slugs = [s["slug"] for s in scenarios]
    slug_set = set(slugs)

    # Duplicate slug.
    if len(slugs) != len(slug_set):
        seen: set[str] = set()
        for s in slugs:
            if s in seen:
                raise SeedError(f"slug {s!r}가 중복됩니다.")
            seen.add(s)

    # difficulty / min_level range (defensive — also checked in parser).
    for s in scenarios:
        if s["difficulty"] < MIN_DIFFICULTY or s["difficulty"] > MAX_DIFFICULTY:
            raise SeedError(
                f"시나리오 {s['slug']!r}의 difficulty가 범위를 벗어났습니다: "
                f"{s['difficulty']}"
            )
        if s["min_level"] < MIN_LEVEL_FLOOR or s["min_level"] > MIN_LEVEL_CEIL:
            raise SeedError(
                f"시나리오 {s['slug']!r}의 min_level이 범위를 벗어났습니다: "
                f"{s['min_level']}"
            )

    # Orphan turns.
    for t in turns:
        if t["scenario_slug"] not in slug_set:
            raise SeedError(
                f"턴 {t.get('id', t['text_en'])!r}의 scenario_slug "
                f"{t['scenario_slug']!r}가 어떤 시나리오와도 매칭되지 않습니다 "
                f"(고아 턴)."
            )

    # Per-scenario turn structure.
    for s in scenarios:
        slug = s["slug"]
        s_turns = [t for t in turns if t["scenario_slug"] == slug]
        s_turns.sort(key=lambda t: t["turn_order"])

        n = len(s_turns)
        if n < MIN_TURNS_PER_SCENARIO:
            raise SeedError(
                f"시나리오 {slug!r}의 턴이 {n}개입니다 "
                f"(최소 {MIN_TURNS_PER_SCENARIO}개 필요)."
            )
        if n > MAX_TURNS_PER_SCENARIO:
            raise SeedError(
                f"시나리오 {slug!r}의 턴이 {n}개입니다 "
                f"(최대 {MAX_TURNS_PER_SCENARIO}개)."
            )

        # First turn must be ted.
        if s_turns[0]["speaker"] != "ted":
            raise SeedError(
                f"시나리오 {slug!r}의 첫 턴은 ted여야 합니다 "
                f"(현재 {s_turns[0]['speaker']!r})."
            )

        # At least one user turn.
        if not any(t["speaker"] == "user" for t in s_turns):
            raise SeedError(
                f"시나리오 {slug!r}에 user 턴이 하나도 없습니다 (최소 1개 필요)."
            )

        # No consecutive user turns.
        prev = None
        for t in s_turns:
            if t["speaker"] == "user" and prev == "user":
                raise SeedError(
                    f"시나리오 {slug!r}에 연속 user 턴이 있습니다 "
                    f"(turn_order={t['turn_order']})."
                )
            prev = t["speaker"]

        # user turns require hint_ko.
        for t in s_turns:
            if t["speaker"] == "user" and not t.get("hint_ko"):
                raise SeedError(
                    f"시나리오 {slug!r}의 user 턴(turn_order={t['turn_order']})에 "
                    f"hint_ko가 없습니다."
                )


# --------------------------------------------------------------------------- #
# Output builders
# --------------------------------------------------------------------------- #

def generate_speaking_pack(scenarios: list[dict], turns: list[dict]) -> dict:
    out_scenarios = []
    for s in scenarios:
        out_scenarios.append(
            {
                "id": s["slug"],
                "slug": s["slug"],
                "title": s["title"],
                "context": s["context"],
                "difficulty": s["difficulty"],
                "emoji": s["emoji"],
                "min_level": s["min_level"],
                "sort_order": s["sort_order"],
            }
        )
    out_turns = []
    for t in turns:
        out_turns.append(
            {
                "id": t["id"],
                "scenario_slug": t["scenario_slug"],
                "turn_order": t["turn_order"],
                "speaker": t["speaker"],
                "text_en": t["text_en"],
                "hint_ko": t["hint_ko"],
            }
        )
    return {"scenarios": out_scenarios, "turns": out_turns}


def sql_str(value) -> str:
    """Render a value as a SQL literal, escaping single quotes. None/'' -> NULL."""
    if value is None:
        return "NULL"
    text = str(value)
    if text == "":
        return "NULL"
    return "'" + text.replace("'", "''") + "'"


SCHEMA_PREFIX = """\
-- Schema fixes for speaking content (idempotent).
-- 001에서 speaking_scenarios.slug는 이미 UNIQUE NOT NULL → 중복 DDL 없음.
-- speaking_scenarios 확장 컬럼
ALTER TABLE speaking_scenarios ADD COLUMN IF NOT EXISTS emoji TEXT DEFAULT '💬';
ALTER TABLE speaking_scenarios ADD COLUMN IF NOT EXISTS min_level INT DEFAULT 1;
ALTER TABLE speaking_scenarios ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- dialogue_turns UNIQUE(scenario_id, turn_order): ON CONFLICT 시드 대상.
-- ADD CONSTRAINT IF NOT EXISTS 미지원 → DO 블록.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dialogue_turns_scenario_order_unique'
  ) THEN
    ALTER TABLE dialogue_turns
      ADD CONSTRAINT dialogue_turns_scenario_order_unique
      UNIQUE (scenario_id, turn_order);
  END IF;
END $$;

-- speaking_usage: 일일 사용량(비용 cap). user_id+usage_date PK.
CREATE TABLE IF NOT EXISTS speaking_usage (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INT DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

-- speaking_attempts: 발화 + 피드백 기록 (음성 파일 미저장 — 텍스트만).
CREATE TABLE IF NOT EXISTS speaking_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES speaking_scenarios(id) ON DELETE SET NULL,
  turn_order INT,
  user_text TEXT NOT NULL,
  feedback JSONB,                      -- {verdict, correction, alternative}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: 본인 row만. usage 증가·attempt insert는 Edge Function(service role)이
-- RLS를 우회하여 수행하므로, 정책은 본인 읽기/쓰기 위주로 둔다.
ALTER TABLE speaking_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS speaking_usage_select_own ON speaking_usage;
CREATE POLICY speaking_usage_select_own
  ON speaking_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS speaking_usage_insert_own ON speaking_usage;
CREATE POLICY speaking_usage_insert_own
  ON speaking_usage FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS speaking_usage_update_own ON speaking_usage;
CREATE POLICY speaking_usage_update_own
  ON speaking_usage FOR UPDATE TO authenticated USING (auth.uid() = user_id);

ALTER TABLE speaking_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS speaking_attempts_select_own ON speaking_attempts;
CREATE POLICY speaking_attempts_select_own
  ON speaking_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS speaking_attempts_insert_own ON speaking_attempts;
CREATE POLICY speaking_attempts_insert_own
  ON speaking_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 일일 사용량 원자적 검사·증가 (비용 한도 우회 방지 — Edge Function이 service role로 호출).
-- UPDATE ... WHERE count < limit 가 row lock으로 동시 요청을 직렬화 → 한도 초과 시 0행 반환.
CREATE OR REPLACE FUNCTION increment_speaking_usage(p_user UUID, p_date DATE, p_limit INT)
RETURNS TABLE(allowed BOOLEAN, remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO speaking_usage (user_id, usage_date, count)
  VALUES (p_user, p_date, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET count = speaking_usage.count + 1
    WHERE speaking_usage.count < p_limit
  RETURNING count INTO v_count;

  IF v_count IS NULL THEN
    -- ON CONFLICT WHERE가 막음(한도 도달) → 차단
    RETURN QUERY SELECT FALSE, 0;
  ELSE
    RETURN QUERY SELECT TRUE, GREATEST(0, p_limit - v_count);
  END IF;
END;
$$;

-- RPC는 service role만 실행 (authenticated 직접 호출 차단 — 한도 조작 방지).
REVOKE ALL ON FUNCTION increment_speaking_usage(UUID, DATE, INT) FROM PUBLIC, authenticated, anon;
"""


def generate_sql(scenarios: list[dict], turns: list[dict]) -> str:
    pack = generate_speaking_pack(scenarios, turns)
    scenario_count = len(pack["scenarios"])
    turn_count = len(pack["turns"])

    header = (
        "-- Ted Voca — Speaking Seed (scenarios + dialogue turns + usage/attempts schema)\n"
        f"-- Generated by: {SCRIPT_REL}\n"
        "-- Source: scripts/speaking_content/batch_*.txt\n"
        f"-- Scenario count: {scenario_count}  Turn count: {turn_count}\n"
        "-- Idempotent: ON CONFLICT (slug) / (scenario_id, turn_order) DO NOTHING\n"
        "-- Apply: supabase db push OR run in Supabase SQL Editor\n\n"
    )

    # Scenarios INSERT — ON CONFLICT(slug) DO UPDATE로 확장 컬럼 동기화.
    scenario_rows = []
    for s in pack["scenarios"]:
        scenario_rows.append(
            "  ("
            + ", ".join(
                [
                    sql_str(s["slug"]),
                    sql_str(s["title"]),
                    sql_str(s["context"]),
                    str(s["difficulty"]),
                    sql_str(s["emoji"]),
                    str(s["min_level"]),
                    str(s["sort_order"]),
                ]
            )
            + ")"
        )
    scenarios_insert = (
        "-- Scenarios\n"
        "INSERT INTO speaking_scenarios "
        "(slug, title, context, difficulty, emoji, min_level, sort_order)\n"
        "VALUES\n"
        + ",\n".join(scenario_rows)
        + "\nON CONFLICT (slug) DO UPDATE SET\n"
        "  title = EXCLUDED.title,\n"
        "  context = EXCLUDED.context,\n"
        "  difficulty = EXCLUDED.difficulty,\n"
        "  emoji = EXCLUDED.emoji,\n"
        "  min_level = EXCLUDED.min_level,\n"
        "  sort_order = EXCLUDED.sort_order;\n\n"
    )

    # Turns INSERT — scenario_id resolved via subquery on slug.
    turn_rows = []
    for t in pack["turns"]:
        scenario_subq = (
            f"(SELECT id FROM speaking_scenarios WHERE slug = "
            f"{sql_str(t['scenario_slug'])})"
        )
        turn_rows.append(
            "  ("
            + ", ".join(
                [
                    scenario_subq,
                    str(t["turn_order"]),
                    sql_str(t["speaker"]),
                    sql_str(t["text_en"]),
                    sql_str(t["hint_ko"]),
                ]
            )
            + ")"
        )
    turns_insert = (
        "-- Dialogue turns\n"
        "INSERT INTO dialogue_turns "
        "(scenario_id, turn_order, speaker, text_en, hint_ko)\n"
        "VALUES\n"
        + ",\n".join(turn_rows)
        + "\nON CONFLICT (scenario_id, turn_order) DO NOTHING;\n"
    )

    return header + SCHEMA_PREFIX + "\n" + scenarios_insert + turns_insert


def main() -> None:
    try:
        scenarios, turns = parse_batches()
        validate(scenarios, turns)
    except SeedError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    pack = generate_speaking_pack(scenarios, turns)
    JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(
        json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    sql = generate_sql(scenarios, turns)
    SQL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SQL_OUTPUT.write_text(sql, encoding="utf-8")

    print(
        f"Wrote {len(pack['scenarios'])} scenarios / {len(pack['turns'])} turns"
    )
    print(f"  JSON: {JSON_OUTPUT}")
    print(f"  SQL:  {SQL_OUTPUT}")


if __name__ == "__main__":
    main()
