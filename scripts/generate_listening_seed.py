#!/usr/bin/env python3
"""Generate listening content pack + seed SQL from batch text files.

Reads scripts/listening_content/batch_*.txt, validates every clip/question, and
emits two artifacts:

  a. content/listening-pack.json  — structured pack consumed by the app/repository
  b. supabase/migrations/005_listening.sql — idempotent schema fixes + seed INSERTs

Batch format (one clip block per clip line, see scripts/listening_content/*.txt):

  clip: slug | 제목(한국어) | difficulty(1~5) | tag1,tag2 | transcript_en | transcript_ko
  q | prompt(영어 질문) | 보기1;보기2=정답보기;보기3 | explanation(한국어 1~2문장)

A `q` line belongs to the most recent `clip` line. Each clip carries 1~2
questions. duration_seconds = round(transcript_en word count / 2.5).

Validation failures raise SeedError and abort with a clear message.

Run:
  python3 scripts/generate_listening_seed.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "scripts" / "listening_content"
JSON_OUTPUT = ROOT / "content" / "listening-pack.json"
SQL_OUTPUT = ROOT / "supabase" / "migrations" / "005_listening.sql"
SCRIPT_REL = "scripts/generate_listening_seed.py"

# Words spoken per second used to estimate clip length from the transcript.
WORDS_PER_SECOND = 2.5

# Allowed number of questions attached to a single clip.
MIN_QUESTIONS_PER_CLIP = 1
MAX_QUESTIONS_PER_CLIP = 2


class SeedError(Exception):
    """Raised on any content validation failure."""


def estimate_duration_seconds(transcript_en: str) -> int:
    """round(word count / WORDS_PER_SECOND)."""
    word_count = len(transcript_en.split())
    return round(word_count / WORDS_PER_SECOND)


def parse_payload_with_answer(payload: str) -> tuple[list[str], str]:
    """Parse a `opt1;opt2=answer;opt3` payload into (choices, answer).

    The `=answer` marker may sit on any choice; the marked choice is the
    correct answer and is also kept in the choices list.
    """
    parts = [p.strip() for p in payload.split(";")]
    choices: list[str] = []
    answer: str | None = None
    for part in parts:
        if part == "":
            continue
        if "=" in part:
            label, ans = part.split("=", 1)
            label = label.strip()
            ans = ans.strip()
            choices.append(label)
            answer = ans
        else:
            choices.append(part)
    if answer is None:
        raise SeedError(f"payload에 '=정답' 구분자가 없습니다: {payload!r}")
    return choices, answer


def parse_clip_line(line: str, location: str) -> dict:
    body = line[len("clip:") :].strip() if line.startswith("clip:") else line.strip()
    parts = [p.strip() for p in body.split("|")]
    if len(parts) != 6:
        raise SeedError(
            f"{location}: clip 라인은 "
            f"'slug | 제목 | difficulty | tags | transcript_en | transcript_ko' "
            f"6필드가 필요합니다 (현재 {len(parts)}필드): {line!r}"
        )
    slug, title, difficulty_raw, tags_raw, transcript_en, transcript_ko = parts
    if not slug:
        raise SeedError(f"{location}: clip slug가 비어 있습니다.")
    if not title:
        raise SeedError(f"{location}: clip 제목이 비어 있습니다 (slug={slug}).")
    if not transcript_en:
        raise SeedError(f"{location}: transcript_en이 비어 있습니다 (slug={slug}).")
    if not transcript_ko:
        raise SeedError(f"{location}: transcript_ko가 비어 있습니다 (slug={slug}).")

    try:
        difficulty = int(difficulty_raw)
    except ValueError:
        raise SeedError(
            f"{location}: difficulty가 정수가 아닙니다: {difficulty_raw!r}"
        )
    if difficulty < 1 or difficulty > 5:
        raise SeedError(
            f"{location}: difficulty는 1~5 범위여야 합니다 (현재 {difficulty}): "
            f"slug={slug}"
        )

    tags = [t.strip() for t in tags_raw.split(",") if t.strip() != ""]

    return {
        "slug": slug,
        "title": title,
        "difficulty": difficulty,
        "tags": tags,
        "transcript_en": transcript_en,
        "transcript_ko": transcript_ko,
        "duration_seconds": estimate_duration_seconds(transcript_en),
    }


def parse_question_line(line: str, clip_slug: str, location: str) -> dict:
    parts = [p.strip() for p in line.split("|")]
    if len(parts) != 4:
        raise SeedError(
            f"{location}: 문항 라인은 'q | prompt | payload | explanation' "
            f"4필드가 필요합니다 (현재 {len(parts)}필드): {line!r}"
        )
    marker, prompt, payload, explanation = parts
    if marker != "q":
        raise SeedError(
            f"{location}: 문항 라인은 'q'로 시작해야 합니다 (현재 {marker!r})."
        )
    if not prompt:
        raise SeedError(f"{location}: prompt가 비어 있습니다.")
    if not explanation:
        raise SeedError(f"{location}: 해설(explanation)이 비어 있습니다.")

    choices, answer = parse_payload_with_answer(payload)
    if len(choices) < 2:
        raise SeedError(
            f"{location}: 보기는 2개 이상이어야 합니다 (현재 {len(choices)}개): "
            f"{payload!r}"
        )
    if answer not in choices:
        raise SeedError(
            f"{location}: 정답 {answer!r}이(가) 보기 {choices}에 포함되어 있지 "
            f"않습니다."
        )

    return {
        "clip_slug": clip_slug,
        "prompt": prompt,
        "choices": choices,
        "answer": answer,
        "explanation": explanation,
    }


def parse_batch_file(path: str | Path) -> tuple[list[dict], list[dict]]:
    """Parse a single batch file into (clips, questions).

    Clips and questions are returned as flat lists; each question carries its
    owning clip's slug via `clip_slug`.
    """
    path = Path(path)
    clips: list[dict] = []
    questions: list[dict] = []
    current_slug: str | None = None

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        location = f"{path.name}:{lineno}"
        if line == "" or line.startswith("#"):
            continue
        if line.startswith("clip:"):
            clip = parse_clip_line(line, location)
            clips.append(clip)
            current_slug = clip["slug"]
        elif line.startswith("q "):
            if current_slug is None:
                raise SeedError(
                    f"{location}: clip 라인보다 먼저 문항이 등장했습니다: {line!r}"
                )
            questions.append(parse_question_line(line, current_slug, location))
        else:
            raise SeedError(
                f"{location}: 알 수 없는 라인 (clip: 또는 q 로 시작해야 함): {line!r}"
            )

    return clips, questions


def parse_batches() -> tuple[list[dict], list[dict]]:
    """Parse every batch_*.txt into ordered (clips, questions) lists.

    Adds deterministic `sort_order` (1-based) to every clip, and per-clip
    `sort_order` + deterministic `id` to every question.
    """
    files = sorted(CONTENT_DIR.glob("batch_*.txt"))
    if not files:
        raise SeedError(f"배치 파일이 없습니다: {CONTENT_DIR}/batch_*.txt")

    clips: list[dict] = []
    questions: list[dict] = []
    seen_slugs: dict[str, str] = {}

    for path in files:
        rel = path.relative_to(ROOT)
        file_clips, file_questions = parse_batch_file(path)
        for clip in file_clips:
            if clip["slug"] in seen_slugs:
                raise SeedError(
                    f"{rel}: slug {clip['slug']!r}가 중복됩니다 "
                    f"(앞선 정의: {seen_slugs[clip['slug']]})"
                )
            seen_slugs[clip["slug"]] = str(rel)
            clips.append(clip)
        questions.extend(file_questions)

    # Deterministic ordering: clips in file order, questions in file order
    # within each clip.
    for c_order, clip in enumerate(clips, 1):
        clip["sort_order"] = c_order

    per_clip_counter: dict[str, int] = {}
    for q in questions:
        slug = q["clip_slug"]
        per_clip_counter[slug] = per_clip_counter.get(slug, 0) + 1
        q_order = per_clip_counter[slug]
        q["sort_order"] = q_order
        q["id"] = f"{slug}:{q_order}"

    return clips, questions


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def validate(clips: list[dict], questions: list[dict]) -> None:
    slugs = {c["slug"] for c in clips}

    # No orphan questions.
    for q in questions:
        if q["clip_slug"] not in slugs:
            raise SeedError(
                f"문항 {q.get('id', q['prompt'])!r}의 clip_slug "
                f"{q['clip_slug']!r}가 어떤 클립과도 매칭되지 않습니다 (고아 문항)."
            )
        if q["answer"] not in q["choices"]:
            raise SeedError(
                f"문항 {q.get('id', q['prompt'])!r}의 정답 {q['answer']!r}이(가) "
                f"보기 {q['choices']}에 포함되어 있지 않습니다."
            )

    # 1~2 questions per clip.
    counts: dict[str, int] = {slug: 0 for slug in slugs}
    for q in questions:
        counts[q["clip_slug"]] += 1
    for clip in clips:
        n = counts[clip["slug"]]
        if n < MIN_QUESTIONS_PER_CLIP:
            raise SeedError(
                f"클립 {clip['slug']!r}에 문항이 하나도 없습니다 "
                f"(최소 {MIN_QUESTIONS_PER_CLIP}개 필요)."
            )
        if n > MAX_QUESTIONS_PER_CLIP:
            raise SeedError(
                f"클립 {clip['slug']!r}의 문항이 {n}개입니다 "
                f"(최대 {MAX_QUESTIONS_PER_CLIP}개)."
            )


# --------------------------------------------------------------------------- #
# Output builders
# --------------------------------------------------------------------------- #

def build_pack(clips: list[dict], questions: list[dict]) -> dict:
    out_clips = []
    for clip in clips:
        out_clips.append(
            {
                "id": clip["slug"],
                "slug": clip["slug"],
                "title": clip["title"],
                "transcript_en": clip["transcript_en"],
                "transcript_ko": clip["transcript_ko"],
                "duration_seconds": clip["duration_seconds"],
                "difficulty": clip["difficulty"],
                "tags": clip["tags"],
                "sort_order": clip["sort_order"],
            }
        )
    out_questions = []
    for q in questions:
        out_questions.append(
            {
                "id": q["id"],
                "clip_slug": q["clip_slug"],
                "prompt": q["prompt"],
                "choices": q["choices"],
                "answer": q["answer"],
                "explanation": q["explanation"],
                "sort_order": q["sort_order"],
            }
        )
    return {"clips": out_clips, "questions": out_questions}


def sql_str(value) -> str:
    """Render a value as a SQL literal, escaping single quotes. None/'' -> NULL."""
    if value is None:
        return "NULL"
    text = str(value)
    if text == "":
        return "NULL"
    return "'" + text.replace("'", "''") + "'"


def sql_text_array(values) -> str:
    if not values:
        return "ARRAY[]::TEXT[]"
    items = ", ".join(sql_str(v) for v in values)
    return f"ARRAY[{items}]::TEXT[]"


def options_jsonb(question: dict) -> str:
    """Build the {"choices": [...]} JSONB literal and escape it."""
    obj = {"choices": question["choices"]}
    dumped = json.dumps(obj, ensure_ascii=False)
    return "'" + dumped.replace("'", "''") + "'::JSONB"


SCHEMA_PREFIX = """\
-- Schema fixes for listening content (idempotent).
-- Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE in transaction — Supabase Cloud OK)
-- 리스닝 attempt는 quiz_type='listening'으로 기록 (remote.recordListeningAttempt)
-- 주의: ALTER TYPE ... ADD VALUE는 같은 트랜잭션 안에서 새 enum 값을 사용할 수 없으나,
--   본 시드는 새 값을 사용하지 않으므로(quiz_type 컬럼에 'listening' INSERT 없음) 단일 실행 OK.
ALTER TYPE quiz_type ADD VALUE IF NOT EXISTS 'listening';

-- listening_clips 확장 컬럼
ALTER TABLE listening_clips ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE listening_clips ADD COLUMN IF NOT EXISTS audio_url TEXT;       -- v1.1 예약
ALTER TABLE listening_clips ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE listening_clips ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- slug NOT NULL 보장: NULL slug 행(001 시절 데이터)이 UNIQUE를 우회하지 않도록
-- 기존 행은 id 텍스트로 백필 후 제약 적용 (재실행 안전).
UPDATE listening_clips SET slug = id::text WHERE slug IS NULL;
ALTER TABLE listening_clips ALTER COLUMN slug SET NOT NULL;

-- UNIQUE(slug): ADD CONSTRAINT IF NOT EXISTS는 PG 미지원 → DO 블록.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listening_clips_slug_unique'
  ) THEN
    ALTER TABLE listening_clips
      ADD CONSTRAINT listening_clips_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- listening_questions 신설
CREATE TABLE IF NOT EXISTS listening_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clip_id UUID REFERENCES listening_clips(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,            -- {"choices": [...]}
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- UNIQUE(clip_id, sort_order): DO 블록.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listening_questions_clip_sort_unique'
  ) THEN
    ALTER TABLE listening_questions
      ADD CONSTRAINT listening_questions_clip_sort_unique
      UNIQUE (clip_id, sort_order);
  END IF;
END $$;

-- RLS: 누구나(authenticated) 읽기 가능. CREATE POLICY IF NOT EXISTS 미지원 → DROP 후 CREATE.
ALTER TABLE listening_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS listening_questions_read_all ON listening_questions;
CREATE POLICY listening_questions_read_all
  ON listening_questions FOR SELECT TO authenticated USING (TRUE);

-- quiz_attempts에 listening_question_id 추가
ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS listening_question_id UUID
  REFERENCES listening_questions(id) ON DELETE SET NULL;
"""


def build_sql(clips: list[dict], questions: list[dict]) -> str:
    pack = build_pack(clips, questions)
    clip_count = len(pack["clips"])
    question_count = len(pack["questions"])

    header = (
        "-- Ted Voca — Listening Seed (clips + questions)\n"
        f"-- Generated by: {SCRIPT_REL}\n"
        "-- Source: scripts/listening_content/batch_*.txt\n"
        f"-- Clip count: {clip_count}  Question count: {question_count}\n"
        "-- Idempotent: ON CONFLICT (slug) / (clip_id, sort_order) DO NOTHING\n"
        "-- Apply: supabase db push OR run in Supabase SQL Editor\n\n"
    )

    # Clips INSERT
    clip_rows = []
    for c in pack["clips"]:
        clip_rows.append(
            "  ("
            + ", ".join(
                [
                    sql_str(c["slug"]),
                    sql_str(c["title"]),
                    sql_str(c["transcript_en"]),
                    sql_str(c["transcript_ko"]),
                    str(c["duration_seconds"]),
                    str(c["difficulty"]),
                    sql_text_array(c["tags"]),
                    str(c["sort_order"]),
                ]
            )
            + ")"
        )
    clips_insert = (
        "-- Clips\n"
        "INSERT INTO listening_clips "
        "(slug, title, transcript_en, transcript_ko, duration_seconds, "
        "difficulty, tags, sort_order)\nVALUES\n"
        + ",\n".join(clip_rows)
        + "\nON CONFLICT (slug) DO NOTHING;\n\n"
    )

    # Questions INSERT — clip_id resolved via subquery on slug.
    q_rows = []
    for q in pack["questions"]:
        clip_subq = (
            f"(SELECT id FROM listening_clips WHERE slug = {sql_str(q['clip_slug'])})"
        )
        q_rows.append(
            "  ("
            + ", ".join(
                [
                    clip_subq,
                    sql_str(q["prompt"]),
                    options_jsonb(q),
                    sql_str(q["answer"]),
                    sql_str(q["explanation"]),
                    str(q["sort_order"]),
                ]
            )
            + ")"
        )
    questions_insert = (
        "-- Questions\n"
        "INSERT INTO listening_questions "
        "(clip_id, prompt, options, correct_answer, explanation, sort_order)\n"
        "VALUES\n"
        + ",\n".join(q_rows)
        + "\nON CONFLICT (clip_id, sort_order) DO NOTHING;\n"
    )

    return header + SCHEMA_PREFIX + "\n" + clips_insert + questions_insert


def main() -> None:
    try:
        clips, questions = parse_batches()
        validate(clips, questions)
    except SeedError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    pack = build_pack(clips, questions)
    JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(
        json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    sql = build_sql(clips, questions)
    SQL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SQL_OUTPUT.write_text(sql, encoding="utf-8")

    print(
        f"Wrote {len(pack['clips'])} clips / {len(pack['questions'])} questions"
    )
    print(f"  JSON: {JSON_OUTPUT}")
    print(f"  SQL:  {SQL_OUTPUT}")


if __name__ == "__main__":
    main()
