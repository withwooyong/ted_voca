#!/usr/bin/env python3
"""Generate grammar content pack + seed SQL from batch text files.

Reads scripts/grammar_content/batch_*.txt, validates every topic/question, and
emits two artifacts:

  a. content/grammar-pack.json  — structured pack consumed by the app/repository
  b. supabase/migrations/004_grammar.sql — idempotent schema fixes + seed INSERTs

Batch format (one topic block per topic line, see scripts/grammar_content/*.txt):

  topic: slug | 제목 | CEFR | tag1,tag2 | 설명...
  word_order  | prompt | English answer sentence | explanation
  blank_choice| prompt | opt1;opt2;...=answer    | explanation
  error_find  | prompt | seg1;seg2;...=answer     | explanation

Validation failures raise SeedError and abort with a clear message.

Run:
  python3 scripts/generate_grammar_seed.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "scripts" / "grammar_content"
JSON_OUTPUT = ROOT / "content" / "grammar-pack.json"
SQL_OUTPUT = ROOT / "supabase" / "migrations" / "004_grammar.sql"
SCRIPT_REL = "scripts/generate_grammar_seed.py"

QUESTION_TYPES = {"word_order", "blank_choice", "error_find"}

# Trailing punctuation stripped from word_order chips (kept in the answer).
TRAILING_PUNCT = ".!?"


class SeedError(Exception):
    """Raised on any content validation failure."""


def normalize_sentence(text: str) -> str:
    """Lowercase + collapse whitespace + drop trailing punctuation.

    Used to compare a word_order chip join against its answer sentence so that
    spacing/case/end-punctuation differences do not cause false mismatches.
    """
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text.rstrip(TRAILING_PUNCT).strip()


def chips_from_sentence(sentence: str) -> list[str]:
    """Split a word_order answer into chips: space-separated, trailing-punct
    removed from the final token (and any token)."""
    raw = sentence.strip().split()
    chips: list[str] = []
    for token in raw:
        clean = token.rstrip(TRAILING_PUNCT)
        if clean:
            chips.append(clean)
    return chips


def parse_payload_with_answer(payload: str) -> tuple[list[str], str]:
    """Parse a `opt1;opt2;...=answer` payload into (options, answer)."""
    if "=" not in payload:
        raise SeedError(f"payload에 '=정답' 구분자가 없습니다: {payload!r}")
    options_part, answer = payload.rsplit("=", 1)
    options = [o.strip() for o in options_part.split(";") if o.strip() != ""]
    return options, answer.strip()


def parse_topic_line(line: str, location: str) -> dict:
    body = line[len("topic:") :].strip()
    parts = [p.strip() for p in body.split("|")]
    if len(parts) != 5:
        raise SeedError(
            f"{location}: topic 라인은 'slug | 제목 | CEFR | tags | 설명' 5필드가 "
            f"필요합니다 (현재 {len(parts)}필드): {line!r}"
        )
    slug, title, cefr, tags_raw, explanation = parts
    tags = [t.strip() for t in tags_raw.split(",") if t.strip() != ""]
    if not slug:
        raise SeedError(f"{location}: topic slug가 비어 있습니다.")
    if not title:
        raise SeedError(f"{location}: topic 제목이 비어 있습니다 (slug={slug}).")
    if not explanation:
        raise SeedError(f"{location}: topic 설명이 비어 있습니다 (slug={slug}).")
    return {
        "slug": slug,
        "title": title,
        "cefr_level": cefr,
        "explanation": explanation,
        "tags": tags,
        "questions": [],
    }


def parse_question_line(line: str, topic_slug: str, location: str) -> dict:
    parts = [p.strip() for p in line.split("|")]
    if len(parts) != 4:
        raise SeedError(
            f"{location}: 문항 라인은 'type | prompt | payload | explanation' "
            f"4필드가 필요합니다 (현재 {len(parts)}필드): {line!r}"
        )
    qtype, prompt, payload, explanation = parts
    if qtype not in QUESTION_TYPES:
        raise SeedError(
            f"{location}: 알 수 없는 문항 유형 {qtype!r} "
            f"(허용: {', '.join(sorted(QUESTION_TYPES))})"
        )
    if not prompt:
        raise SeedError(f"{location}: prompt가 비어 있습니다.")
    if not explanation:
        raise SeedError(f"{location}: 해설(explanation)이 비어 있습니다.")

    if qtype == "word_order":
        answer = payload.strip()
        if not answer:
            raise SeedError(f"{location}: word_order 정답 문장이 비어 있습니다.")
        chips = chips_from_sentence(answer)
        if len(chips) < 4 or len(chips) > 9:
            raise SeedError(
                f"{location}: word_order 칩 개수는 4~9개여야 합니다 "
                f"(현재 {len(chips)}개): {answer!r}"
            )
        # 칩 join == answer 정규화 일치 검증
        if normalize_sentence(" ".join(chips)) != normalize_sentence(answer):
            raise SeedError(
                f"{location}: word_order 칩 결합이 정답과 일치하지 않습니다: "
                f"chips={chips} answer={answer!r}"
            )
        # 칩 모호성: 같은 단어(대소문자 무시)가 2번 나오면 배열 정답이 모호해짐
        seen: dict[str, int] = {}
        for chip in chips:
            key = chip.lower()
            seen[key] = seen.get(key, 0) + 1
        dups = sorted(k for k, n in seen.items() if n > 1)
        if dups:
            raise SeedError(
                f"{location}: word_order 칩에 중복 단어가 있어 정답이 모호합니다 "
                f"({', '.join(dups)}): {answer!r}"
            )
        options = chips
    else:
        options, answer = parse_payload_with_answer(payload)
        if len(options) < 2:
            raise SeedError(
                f"{location}: {qtype} 보기는 2개 이상이어야 합니다 "
                f"(현재 {len(options)}개): {payload!r}"
            )
        if answer not in options:
            raise SeedError(
                f"{location}: {qtype} 정답 {answer!r}이(가) 보기 {options}에 "
                f"포함되어 있지 않습니다."
            )

    return {
        "topic_slug": topic_slug,
        "question_type": qtype,
        "prompt": prompt,
        "options": options,
        "answer": answer,
        "explanation": explanation,
    }


def parse_batches() -> list[dict]:
    """Parse every batch_*.txt into an ordered list of topic dicts."""
    files = sorted(CONTENT_DIR.glob("batch_*.txt"))
    if not files:
        raise SeedError(f"배치 파일이 없습니다: {CONTENT_DIR}/batch_*.txt")

    topics: list[dict] = []
    seen_slugs: dict[str, str] = {}
    current: dict | None = None

    for path in files:
        rel = path.relative_to(ROOT)
        for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.strip()
            location = f"{rel}:{lineno}"
            if line == "" or line.startswith("#"):
                continue
            if line.startswith("topic:"):
                current = parse_topic_line(line, location)
                if current["slug"] in seen_slugs:
                    raise SeedError(
                        f"{location}: slug {current['slug']!r}가 중복됩니다 "
                        f"(앞선 정의: {seen_slugs[current['slug']]})"
                    )
                seen_slugs[current["slug"]] = location
                topics.append(current)
            else:
                if current is None:
                    raise SeedError(
                        f"{location}: topic 라인보다 먼저 문항이 등장했습니다: {line!r}"
                    )
                current["questions"].append(
                    parse_question_line(line, current["slug"], location)
                )

    for topic in topics:
        if not topic["questions"]:
            raise SeedError(
                f"토픽 {topic['slug']!r}에 문항이 하나도 없습니다."
            )
    return topics


# --------------------------------------------------------------------------- #
# Output builders
# --------------------------------------------------------------------------- #

def build_pack(topics: list[dict]) -> dict:
    out_topics = []
    out_questions = []
    for t_order, topic in enumerate(topics, 1):
        out_topics.append(
            {
                "slug": topic["slug"],
                "title": topic["title"],
                "cefr_level": topic["cefr_level"],
                "explanation": topic["explanation"],
                "tags": topic["tags"],
                "sort_order": t_order,
            }
        )
        for q_order, q in enumerate(topic["questions"], 1):
            out_questions.append(
                {
                    "id": f"{topic['slug']}:{q_order}",
                    "topic_slug": topic["slug"],
                    "question_type": q["question_type"],
                    "prompt": q["prompt"],
                    "options": q["options"],
                    "answer": q["answer"],
                    "explanation": q["explanation"],
                    "sort_order": q_order,
                }
            )
    return {"topics": out_topics, "questions": out_questions}


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
    """Build the options JSONB literal per question type and escape it."""
    qtype = question["question_type"]
    opts = question["options"]
    if qtype == "word_order":
        obj = {"chips": opts}
    elif qtype == "blank_choice":
        obj = {"choices": opts}
    else:  # error_find
        obj = {"segments": opts}
    dumped = json.dumps(obj, ensure_ascii=False)
    return "'" + dumped.replace("'", "''") + "'::JSONB"


SCHEMA_PREFIX = """\
-- Schema fixes for grammar content (idempotent).
-- Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE in transaction — Supabase Cloud OK)
-- 문법 attempt는 quiz_type='grammar'로 기록 (remote.recordGrammarAttempt)
ALTER TYPE quiz_type ADD VALUE IF NOT EXISTS 'grammar';

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS grammar_question_id UUID
  REFERENCES grammar_questions(id) ON DELETE SET NULL;

ALTER TABLE grammar_topics
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

ALTER TABLE grammar_questions
  ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

-- UNIQUE(topic_id, sort_order): ADD CONSTRAINT IF NOT EXISTS는 PG 미지원 → DO 블록.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grammar_questions_topic_sort_unique'
  ) THEN
    ALTER TABLE grammar_questions
      ADD CONSTRAINT grammar_questions_topic_sort_unique
      UNIQUE (topic_id, sort_order);
  END IF;
END $$;
"""


def build_sql(topics: list[dict]) -> str:
    pack = build_pack(topics)
    topic_count = len(pack["topics"])
    question_count = len(pack["questions"])

    header = (
        "-- Ted Voca — Grammar Seed (topics + questions)\n"
        f"-- Generated by: {SCRIPT_REL}\n"
        "-- Source: scripts/grammar_content/batch_*.txt\n"
        f"-- Topic count: {topic_count}  Question count: {question_count}\n"
        "-- Idempotent: ON CONFLICT (slug) / (topic_id, sort_order) DO NOTHING\n"
        "-- Apply: supabase db push OR run in Supabase SQL Editor\n\n"
    )

    # Topics INSERT
    topic_rows = []
    for t in pack["topics"]:
        topic_rows.append(
            "  ("
            + ", ".join(
                [
                    sql_str(t["slug"]),
                    sql_str(t["title"]),
                    sql_str(t["cefr_level"]),
                    sql_str(t["explanation"]),
                    sql_text_array(t["tags"]),
                    str(t["sort_order"]),
                ]
            )
            + ")"
        )
    topics_insert = (
        "-- Topics\n"
        "INSERT INTO grammar_topics "
        "(slug, title, cefr_level, explanation, tags, sort_order)\nVALUES\n"
        + ",\n".join(topic_rows)
        + "\nON CONFLICT (slug) DO NOTHING;\n\n"
    )

    # Questions INSERT — topic_id resolved via subquery on slug.
    q_rows = []
    for q in pack["questions"]:
        topic_subq = (
            f"(SELECT id FROM grammar_topics WHERE slug = {sql_str(q['topic_slug'])})"
        )
        q_rows.append(
            "  ("
            + ", ".join(
                [
                    topic_subq,
                    sql_str(q["question_type"]),
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
        "INSERT INTO grammar_questions "
        "(topic_id, question_type, prompt, options, correct_answer, "
        "explanation, sort_order)\nVALUES\n"
        + ",\n".join(q_rows)
        + "\nON CONFLICT (topic_id, sort_order) DO NOTHING;\n"
    )

    return header + SCHEMA_PREFIX + "\n" + topics_insert + questions_insert


def main() -> None:
    try:
        topics = parse_batches()
    except SeedError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    pack = build_pack(topics)
    JSON_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    JSON_OUTPUT.write_text(
        json.dumps(pack, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    sql = build_sql(topics)
    SQL_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SQL_OUTPUT.write_text(sql, encoding="utf-8")

    print(
        f"Wrote {len(pack['topics'])} topics / {len(pack['questions'])} questions"
    )
    print(f"  JSON: {JSON_OUTPUT}")
    print(f"  SQL:  {SQL_OUTPUT}")


if __name__ == "__main__":
    main()
