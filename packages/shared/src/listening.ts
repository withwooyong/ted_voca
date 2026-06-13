// 리스닝 재생·채점·Memory Booster 로직 — plan: docs/plans/p4-listening.md §1.2, §4
// grammar.ts와 동일한 순수 함수·rng 주입·Like-타입 스타일.

import type { Rng } from './quiz';

/** 재생 속도 프리셋 (expo-speech rate 값) — plan §1.2.1 */
export const LISTENING_RATES = {
  slow: 0.75,
  normal: 1.0,
  fast: 1.25,
} as const;

export type ListeningRate = keyof typeof LISTENING_RATES;

export type ListeningClipLike = {
  id: string;
  slug: string;
  title: string;
  transcript_en: string;
  transcript_ko: string;
  duration_seconds: number;
  difficulty: number;
  tags: string[];
  sort_order: number;
};

export type ListeningQuestionLike = {
  id: string;
  clip_slug: string;
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
  sort_order: number;
};

/** comprehension 채점: trim 후 정확 일치 (normalize 없음) */
export function isListeningCorrect(q: ListeningQuestionLike, userAnswer: string): boolean {
  return userAnswer.trim() === q.answer.trim();
}

/** 특정 클립의 문항만 sort_order 오름차순으로 반환 */
export function questionsForClip(
  questions: ListeningQuestionLike[],
  clipSlug: string,
): ListeningQuestionLike[] {
  return questions
    .filter((q) => q.clip_slug === clipSlug)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * 세션 클립 선택: slug 기준 dedupe 후 rng로 Fisher-Yates 셔플, count개 반환.
 * count가 풀 크기를 넘으면 가능한 만큼만 반환.
 */
export function pickListeningClips(
  clips: ListeningClipLike[],
  count: number,
  rng: Rng,
): ListeningClipLike[] {
  if (count <= 0) return [];

  // slug dedupe — 첫 등장만 유지
  const seen = new Set<string>();
  const unique: ListeningClipLike[] = [];
  for (const c of clips) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    unique.push(c);
  }

  // Fisher-Yates
  const arr = [...unique];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.slice(0, count);
}

// ── Memory Booster ──────────────────────────────────────────

export type BoosterItem = {
  wordId: string;
  lemma: string;
  meaningKo: string;
  exampleEn: string;
};

/** buildBoosterQueue가 다루는 단어 입력 형태 (어휘 번들/DB 공용) */
type BoosterWord = {
  id: string;
  lemma: string;
  meaning_ko: string;
  example_en: string | null;
};

/** buildBoosterQueue가 다루는 attempt 입력 형태 */
type BoosterAttempt = {
  word_id?: string | null;
  created_at: string;
};

/**
 * Memory Booster 큐 생성 — plan §1.2.6.
 * - 최근 days일(기본 7, 경계 포함) 내 word_id 있는 attempt만
 * - 단어별로 가장 최근 attempt 하나로 dedupe
 * - example_en이 비어있지 않은 단어만
 * - 최신 학습순(최신 먼저) 정렬, limit개(기본 20)로 제한
 */
export function buildBoosterQueue(
  attempts: BoosterAttempt[],
  words: BoosterWord[],
  now: Date,
  opts?: { days?: number; limit?: number },
): BoosterItem[] {
  const days = opts?.days ?? 7;
  const limit = opts?.limit ?? 20;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const cutoff = now.getTime() - days * DAY_MS;

  const byId = new Map(words.map((w) => [w.id, w]));

  // 단어별 가장 최근 attempt 시각 (7일 이내 attempt만 고려)
  const latestByWord = new Map<string, number>();
  for (const a of attempts) {
    if (!a.word_id) continue;
    const t = new Date(a.created_at).getTime();
    if (t < cutoff) continue; // 경계 포함: cutoff 이상만
    const prev = latestByWord.get(a.word_id);
    if (prev === undefined || t > prev) latestByWord.set(a.word_id, t);
  }

  return [...latestByWord.entries()]
    .sort((a, b) => b[1] - a[1]) // 최신 먼저
    .flatMap(([wordId]) => {
      const w = byId.get(wordId);
      if (!w || !w.example_en) return [];
      return [
        {
          wordId: w.id,
          lemma: w.lemma,
          meaningKo: w.meaning_ko,
          exampleEn: w.example_en,
        },
      ];
    })
    .slice(0, limit);
}
