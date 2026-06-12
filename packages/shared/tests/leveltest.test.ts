import { describe, expect, it } from 'vitest';

import {
  cefrFromScore,
  nextDifficulty,
  scoreLevelTest,
  type LevelTestAnswer,
  type LevelTestQuestion,
} from '../src/leveltest';

function q(over: Partial<LevelTestQuestion> & { id: string }): LevelTestQuestion {
  return {
    module: 'vocab',
    difficulty: 3,
    tags: [],
    prompt: 'p',
    sentence: null,
    options: ['a', 'b'],
    answer: 'a',
    explanation: '',
    ...over,
  };
}

describe('nextDifficulty — adaptive', () => {
  it('정답 → +1, 오답 → -1', () => {
    expect(nextDifficulty(3, true)).toBe(4);
    expect(nextDifficulty(3, false)).toBe(2);
  });

  it('1~5 클램프', () => {
    expect(nextDifficulty(5, true)).toBe(5);
    expect(nextDifficulty(1, false)).toBe(1);
  });
});

describe('cefrFromScore — 경계', () => {
  it.each([
    [0, 'A1'],
    [0.19, 'A1'],
    [0.2, 'A2'],
    [0.39, 'A2'],
    [0.4, 'B1'],
    [0.59, 'B1'],
    [0.6, 'B2'],
    [0.79, 'B2'],
    [0.8, 'C1'],
    [1, 'C1'],
  ] as const)('score %f → %s', (score, cefr) => {
    expect(cefrFromScore(score)).toBe(cefr);
  });
});

describe('scoreLevelTest', () => {
  it('가중 점수 = Σ(정답 difficulty)/Σ(전체 difficulty)', () => {
    const answers: LevelTestAnswer[] = [
      { question: q({ id: '1', difficulty: 2 }), correct: true },
      { question: q({ id: '2', difficulty: 3 }), correct: false },
      { question: q({ id: '3', difficulty: 5 }), correct: true },
    ];
    const r = scoreLevelTest(answers);
    expect(r.score).toBeCloseTo(7 / 10, 5);
    expect(r.cefr).toBe('B2'); // 0.7
  });

  it('weak tag: 해당 tag 2문항 이상 && 정답률 < 0.6', () => {
    const answers: LevelTestAnswer[] = [
      { question: q({ id: '1', tags: ['tense'] }), correct: false },
      { question: q({ id: '2', tags: ['tense'] }), correct: false },
      { question: q({ id: '3', tags: ['tense'] }), correct: true }, // tense 1/3 = 0.33 → weak
      { question: q({ id: '4', tags: ['business'] }), correct: false }, // 1문항뿐 → 제외
      { question: q({ id: '5', tags: ['listening-liaison'] }), correct: true },
      { question: q({ id: '6', tags: ['listening-liaison'] }), correct: true }, // 1.0 → 정상
    ];
    const r = scoreLevelTest(answers);
    expect(r.weakTags).toContain('tense');
    expect(r.weakTags).not.toContain('business');
    expect(r.weakTags).not.toContain('listening-liaison');
  });

  it('빈 답안 → score 0, A1, weakTags 없음', () => {
    const r = scoreLevelTest([]);
    expect(r.score).toBe(0);
    expect(r.cefr).toBe('A1');
    expect(r.weakTags).toEqual([]);
  });
});
