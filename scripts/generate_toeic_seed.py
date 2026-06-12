#!/usr/bin/env python3
"""Generate TOEIC 800 word pack JSON from batch files."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BATCH_DIR = Path(__file__).resolve().parent / "word_batches"
OUTPUT = ROOT / "content" / "toeic-800-pack.json"


def parse_batch(path: Path) -> list[dict]:
    words = []
    for line in path.read_text(encoding="utf-8").strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("|", 3)
        if len(parts) != 4:
            raise ValueError(f"Invalid line in {path.name}: {line}")
        lemma, pos, meaning_ko, example_en = parts
        words.append({
            "lemma": lemma.strip(),
            "pos": pos.strip(),
            "meaning_ko": meaning_ko.strip(),
            "example_en": example_en.strip(),
            "example_ko": "",
        })
    return words


def main() -> None:
    all_words: list[dict] = []
    for batch_file in sorted(BATCH_DIR.glob("batch_*.txt")):
        all_words.extend(parse_batch(batch_file))

    for i, word in enumerate(all_words, start=1):
        word["difficulty"] = min(5, (i - 1) // 100 + 1)
        word["tags"] = ["toeic", word["pos"]]
        word["sort_order"] = i

    pack = {
        "course": {
            "slug": "toeic-800",
            "title": "TOEIC 800",
            "description": "토익 800점 목표 핵심 어휘 500선",
        },
        "words": all_words,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)

    print(f"Wrote {len(all_words)} words to {OUTPUT}")


if __name__ == "__main__":
    main()
