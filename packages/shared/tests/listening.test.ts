// P4 Listening — 공유 로직 계약 테스트 (vitest)
// 대상: packages/shared/src/listening.ts (미구현) — 모두 red여야 함
import { describe, expect, it } from 'vitest';

import {
  buildBoosterQueue,
  isListeningCorrect,
  LISTENING_RATES,
  pickListeningClips,
  questionsForClip,
  type BoosterItem,
  type ListeningClipLike,
  type ListeningQuestionLike,
  type ListeningRate,
} from '../src/listening';

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

function clip(over: Partial<ListeningClipLike> & { id: string; slug: string }): ListeningClipLike {
  return {
    title: '테스트 클립',
    transcript_en: 'The meeting starts at nine.',
    transcript_ko: '회의는 9시에 시작합니다.',
    duration_seconds: 5,
    difficulty: 2,
    tags: ['office'],
    sort_order: 1,
    ...over,
  };
}

function question(
  over: Partial<ListeningQuestionLike> & { id: string; clip_slug: string },
): ListeningQuestionLike {
  return {
    prompt: 'When does the meeting start?',
    choices: ['At 8', 'At 9', 'At 10', 'At 11'],
    answer: 'At 9',
    explanation: '9시에 시작한다고 했습니다.',
    sort_order: 1,
    ...over,
  };
}

// ────────────────────────────────────────────────────────────
// 1. LISTENING_RATES 상수
// ────────────────────────────────────────────────────────────

describe('LISTENING_RATES 상수', () => {
  it('slow = 0.75', () => {
    expect(LISTENING_RATES.slow).toBe(0.75);
  });

  it('normal = 1.0', () => {
    expect(LISTENING_RATES.normal).toBe(1.0);
  });

  it('fast = 1.25', () => {
    expect(LISTENING_RATES.fast).toBe(1.25);
  });
});

// ────────────────────────────────────────────────────────────
// 2. isListeningCorrect
// ────────────────────────────────────────────────────────────

describe('isListeningCorrect', () => {
  const q = question({ id: 'q1', clip_slug: 'meeting' });

  it('정확히 일치하면 true', () => {
    expect(isListeningCorrect(q, 'At 9')).toBe(true);
  });

  it('앞뒤 공백이 있어도 trim 후 정확히 일치하면 true', () => {
    expect(isListeningCorrect(q, '  At 9  ')).toBe(true);
  });

  it('다른 보기는 false', () => {
    expect(isListeningCorrect(q, 'At 8')).toBe(false);
  });

  it('대소문자가 달라도 trim만 — 정확 일치 아니면 false', () => {
    // isListeningCorrect는 normalize 없이 trim 후 정확 일치
    expect(isListeningCorrect(q, 'at 9')).toBe(false);
  });

  it('빈 문자열은 false', () => {
    expect(isListeningCorrect(q, '')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 3. questionsForClip
// ────────────────────────────────────────────────────────────

describe('questionsForClip', () => {
  const qs: ListeningQuestionLike[] = [
    question({ id: 'q1', clip_slug: 'meeting', sort_order: 2 }),
    question({ id: 'q2', clip_slug: 'meeting', sort_order: 1, prompt: 'Who is speaking?' }),
    question({ id: 'q3', clip_slug: 'announcement', sort_order: 1 }),
  ];

  it('clipSlug와 일치하는 문항만 반환', () => {
    const result = questionsForClip(qs, 'meeting');
    expect(result.map((q) => q.id)).toEqual(expect.arrayContaining(['q1', 'q2']));
    expect(result.every((q) => q.clip_slug === 'meeting')).toBe(true);
  });

  it('sort_order 오름차순으로 정렬', () => {
    const result = questionsForClip(qs, 'meeting');
    expect(result[0].id).toBe('q2'); // sort_order 1
    expect(result[1].id).toBe('q1'); // sort_order 2
  });

  it('해당 clipSlug가 없으면 빈 배열', () => {
    expect(questionsForClip(qs, 'nonexistent')).toEqual([]);
  });

  it('다른 slug 문항은 포함하지 않음', () => {
    const result = questionsForClip(qs, 'meeting');
    expect(result.some((q) => q.clip_slug === 'announcement')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 4. pickListeningClips
// ────────────────────────────────────────────────────────────

describe('pickListeningClips', () => {
  const clips: ListeningClipLike[] = [
    clip({ id: 'c1', slug: 'alpha', sort_order: 1 }),
    clip({ id: 'c2', slug: 'beta', sort_order: 2 }),
    clip({ id: 'c3', slug: 'gamma', sort_order: 3 }),
    clip({ id: 'c4', slug: 'delta', sort_order: 4 }),
    clip({ id: 'c5', slug: 'epsilon', sort_order: 5 }),
  ];

  it('고정 rng로 결정적 결과를 반환', () => {
    const result1 = pickListeningClips(clips, 3, seq(0.1, 0.9, 0.3, 0.7, 0.5));
    const result2 = pickListeningClips(clips, 3, seq(0.1, 0.9, 0.3, 0.7, 0.5));
    expect(result1.map((c) => c.slug)).toEqual(result2.map((c) => c.slug));
  });

  it('count개 반환', () => {
    const result = pickListeningClips(clips, 3, seq(0.2, 0.4, 0.6, 0.8, 0.1));
    expect(result).toHaveLength(3);
  });

  it('count가 풀 크기를 초과하면 가능한 만큼만 반환', () => {
    const result = pickListeningClips(clips, 10, seq(0.5, 0.3, 0.7, 0.1, 0.9));
    expect(result.length).toBe(clips.length);
  });

  it('반환 클립에 slug 중복 없음', () => {
    const result = pickListeningClips(clips, 5, seq(0.5, 0.2, 0.8, 0.3, 0.6));
    const slugs = result.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('중복 slug를 가진 입력에서 dedupe 후 count개 선택', () => {
    const withDupe: ListeningClipLike[] = [
      clip({ id: 'c1', slug: 'alpha', sort_order: 1 }),
      clip({ id: 'c1b', slug: 'alpha', sort_order: 2 }), // 중복 slug
      clip({ id: 'c2', slug: 'beta', sort_order: 3 }),
      clip({ id: 'c3', slug: 'gamma', sort_order: 4 }),
    ];
    const result = pickListeningClips(withDupe, 3, seq(0.1, 0.5, 0.9, 0.3));
    const slugs = result.map((c) => c.slug);
    // slug 중복 없어야 함
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('빈 풀이면 빈 배열', () => {
    expect(pickListeningClips([], 3, seq(0.5))).toEqual([]);
  });

  it('count=0이면 빈 배열', () => {
    expect(pickListeningClips(clips, 0, seq(0.5))).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// 5. buildBoosterQueue
// ────────────────────────────────────────────────────────────

describe('buildBoosterQueue', () => {
  const NOW = new Date('2026-06-13T12:00:00.000Z');
  const DAY = 24 * 60 * 60 * 1000;

  const words = [
    { id: 'w1', lemma: 'acquire', meaning_ko: '습득하다', example_en: 'She acquired new skills.' },
    { id: 'w2', lemma: 'benefit', meaning_ko: '이익', example_en: 'The benefit is clear.' },
    { id: 'w3', lemma: 'confirm', meaning_ko: '확인하다', example_en: 'Please confirm your seat.' },
    { id: 'w4', lemma: 'delay', meaning_ko: '지연', example_en: null },
    { id: 'w5', lemma: 'extend', meaning_ko: '연장하다', example_en: '' },
  ];

  function attempt(wordId: string | undefined, daysAgo: number) {
    return {
      word_id: wordId,
      created_at: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    };
  }

  it('빈 입력 → 빈 배열', () => {
    expect(buildBoosterQueue([], words, NOW)).toEqual([]);
  });

  it('단어 없으면 빈 배열', () => {
    expect(buildBoosterQueue([attempt('w1', 1)], [], NOW)).toEqual([]);
  });

  it('정확히 7일 전 attempt는 포함', () => {
    const result = buildBoosterQueue([attempt('w1', 7)], words, NOW);
    expect(result.some((item) => item.wordId === 'w1')).toBe(true);
  });

  it('8일 전 attempt는 제외', () => {
    const result = buildBoosterQueue([attempt('w1', 8)], words, NOW);
    expect(result.some((item) => item.wordId === 'w1')).toBe(false);
  });

  it('word_id 없는 attempt(문법 등)는 무시', () => {
    const result = buildBoosterQueue([attempt(undefined, 1)], words, NOW);
    expect(result).toEqual([]);
  });

  it('example_en이 null인 단어는 제외', () => {
    const result = buildBoosterQueue([attempt('w4', 1)], words, NOW);
    expect(result.some((item) => item.wordId === 'w4')).toBe(false);
  });

  it('example_en이 빈 문자열인 단어는 제외', () => {
    const result = buildBoosterQueue([attempt('w5', 1)], words, NOW);
    expect(result.some((item) => item.wordId === 'w5')).toBe(false);
  });

  it('같은 word_id에 대한 여러 attempt는 dedupe — 단어 1개만 반환', () => {
    const attempts = [
      attempt('w1', 1),
      attempt('w1', 2), // 동일 word_id 중복
    ];
    const result = buildBoosterQueue(attempts, words, NOW);
    const w1Items = result.filter((item) => item.wordId === 'w1');
    expect(w1Items).toHaveLength(1);
  });

  it('dedupe 시 가장 최근 attempt 기준으로 처리', () => {
    // w1은 1일 전이 더 최신이어야 우선
    const attempts = [
      attempt('w1', 3), // 오래된 것
      attempt('w1', 1), // 최신
    ];
    const result = buildBoosterQueue(attempts, words, NOW);
    // 결과에 w1이 포함되어야 함 (7일 이내이므로)
    expect(result.some((item) => item.wordId === 'w1')).toBe(true);
  });

  it('반환 결과는 최신 학습순(최신 먼저) 정렬', () => {
    const attempts = [
      attempt('w1', 3),
      attempt('w2', 1), // 더 최근
      attempt('w3', 5),
    ];
    const result = buildBoosterQueue(attempts, words, NOW);
    expect(result[0].wordId).toBe('w2'); // 1일 전 = 가장 최근
    expect(result[1].wordId).toBe('w1'); // 3일 전
    expect(result[2].wordId).toBe('w3'); // 5일 전
  });

  it('limit 기본값 20 적용', () => {
    const manyWords = Array.from({ length: 25 }, (_, i) => ({
      id: `w${i}`,
      lemma: `word${i}`,
      meaning_ko: `뜻${i}`,
      example_en: `Example sentence ${i}.`,
    }));
    const manyAttempts = manyWords.map((w, i) => attempt(w.id, i % 6 + 1));
    const result = buildBoosterQueue(manyAttempts, manyWords, NOW);
    expect(result.length).toBeLessThanOrEqual(20);
  });

  it('opts.limit으로 커스텀 제한', () => {
    const attempts = [attempt('w1', 1), attempt('w2', 2), attempt('w3', 3)];
    const result = buildBoosterQueue(attempts, words, NOW, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('opts.days로 커스텀 기간', () => {
    const attempts = [attempt('w1', 3), attempt('w2', 5)];
    // days=4 → w2(5일 전)는 제외, w1(3일 전)은 포함
    const result = buildBoosterQueue(attempts, words, NOW, { days: 4 });
    expect(result.some((item) => item.wordId === 'w1')).toBe(true);
    expect(result.some((item) => item.wordId === 'w2')).toBe(false);
  });

  it('반환 BoosterItem 구조 검증', () => {
    const result = buildBoosterQueue([attempt('w1', 1)], words, NOW);
    expect(result[0]).toMatchObject({
      wordId: 'w1',
      lemma: 'acquire',
      meaningKo: '습득하다',
      exampleEn: 'She acquired new skills.',
    });
  });
});
