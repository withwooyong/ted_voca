import { describe, expect, it } from 'vitest';

import {
  buildQuestion,
  difficultyFromRecent,
  isSpellingCorrect,
  pickDistractors,
  wordsForDifficulty,
  type Rng,
  type WordLike,
} from '../src/quiz';

function word(over: Partial<WordLike> & { id: string }): WordLike {
  return {
    lemma: over.id,
    pos: 'verb',
    meaning_ko: `뜻-${over.id}`,
    example_en: `Example with ${over.id}.`,
    difficulty: 1,
    ...over,
  };
}

const seq = (...vals: number[]): Rng => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

describe('difficultyFromRecent', () => {
  it('표본 4개 미만 → normal', () => {
    expect(difficultyFromRecent([])).toBe('normal');
    expect(difficultyFromRecent([true, true, true])).toBe('normal');
  });

  it('정답률 ≥ 80% → hard', () => {
    expect(difficultyFromRecent([true, true, true, true, false])).toBe('hard');
    expect(difficultyFromRecent(Array(10).fill(true))).toBe('hard');
  });

  it('정답률 ≤ 50% → easy', () => {
    expect(difficultyFromRecent([true, true, false, false])).toBe('easy');
    expect(difficultyFromRecent([false, false, false, true])).toBe('easy');
  });

  it('그 외 → normal', () => {
    expect(difficultyFromRecent([true, true, false, true])).toBe('normal'); // 75%
  });
});

describe('wordsForDifficulty', () => {
  const pool = [
    word({ id: 'a', difficulty: 1 }),
    word({ id: 'b', difficulty: 2 }),
    word({ id: 'c', difficulty: 3 }),
    word({ id: 'd', difficulty: 5 }),
  ];

  it('easy → difficulty ≤ 2', () => {
    expect(wordsForDifficulty(pool, 'easy').map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('normal → difficulty ≤ 4', () => {
    expect(wordsForDifficulty(pool, 'normal').map((w) => w.id)).toEqual(['a', 'b', 'c']);
  });

  it('hard → 전체', () => {
    expect(wordsForDifficulty(pool, 'hard')).toHaveLength(4);
  });

  it('필터 결과가 비면 전체 fallback', () => {
    const hardOnly = [word({ id: 'x', difficulty: 5 })];
    expect(wordsForDifficulty(hardOnly, 'easy')).toHaveLength(1);
  });
});

describe('pickDistractors', () => {
  const target = word({ id: 'implement', pos: 'verb', meaning_ko: '시행하다' });
  const pool = [
    target,
    word({ id: 'imply', pos: 'verb', meaning_ko: '암시하다' }),
    word({ id: 'import', pos: 'verb', meaning_ko: '수입하다' }),
    word({ id: 'improve', pos: 'verb', meaning_ko: '개선하다' }),
    word({ id: 'invoice', pos: 'noun', meaning_ko: '송장' }),
  ];

  it('자기 자신 제외, 같은 pos 우선으로 count개', () => {
    const d = pickDistractors(target, pool, 3, seq(0, 0, 0));
    expect(d).toHaveLength(3);
    expect(d.map((w) => w.id)).not.toContain('implement');
    expect(d.every((w) => w.pos === 'verb')).toBe(true);
  });

  it('같은 pos 부족 시 다른 pos로 채움', () => {
    const small = [target, word({ id: 'imply', pos: 'verb' }), word({ id: 'invoice', pos: 'noun' })];
    const d = pickDistractors(target, small, 3, seq(0, 0, 0));
    expect(d).toHaveLength(2); // 풀 자체가 부족하면 가능한 만큼
    expect(d.map((w) => w.id).sort()).toEqual(['imply', 'invoice']);
  });

  it('meaning_ko 중복 단어 제외', () => {
    const dupPool = [
      target,
      word({ id: 'execute', pos: 'verb', meaning_ko: '시행하다' }), // 정답과 같은 뜻
      word({ id: 'imply', pos: 'verb', meaning_ko: '암시하다' }),
      word({ id: 'import', pos: 'verb', meaning_ko: '수입하다' }),
      word({ id: 'improve', pos: 'verb', meaning_ko: '개선하다' }),
    ];
    const d = pickDistractors(target, dupPool, 3, seq(0, 0, 0));
    expect(d.map((w) => w.id)).not.toContain('execute');
  });
});

describe('buildQuestion', () => {
  const target = word({ id: 'implement', pos: 'verb', meaning_ko: '시행하다', example_en: 'They implement the policy.' });
  const pool = [
    target,
    word({ id: 'imply', pos: 'verb', meaning_ko: '암시하다' }),
    word({ id: 'import', pos: 'verb', meaning_ko: '수입하다' }),
    word({ id: 'improve', pos: 'verb', meaning_ko: '개선하다' }),
  ];

  it('신규 단어는 spelling이 나오지 않는다', () => {
    for (let i = 0; i < 20; i++) {
      const q = buildQuestion(target, pool, { isNewWord: true, rng: seq(i / 20, 0.1, 0.2, 0.3) });
      expect(q.type).not.toBe('spelling');
    }
  });

  it('blank: 예문의 lemma가 _____ 로 치환, 보기는 lemma 4개 + 정답 포함', () => {
    const q = buildQuestion(target, pool, { isNewWord: true, rng: seq(0, 0, 0, 0) }); // rng 0 → 첫 허용 유형(blank)
    expect(q.type).toBe('blank');
    expect(q.prompt).toContain('_____');
    expect(q.prompt).not.toContain('implement');
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain('implement');
    expect(q.answer).toBe('implement');
  });

  it('multiple_choice: 보기는 meaning_ko 4개 + 정답 뜻 포함', () => {
    const q = buildQuestion(target, pool, { isNewWord: true, rng: seq(0.9, 0, 0, 0) }); // rng 0.9 → 마지막 허용 유형(mcq)
    expect(q.type).toBe('multiple_choice');
    expect(q.prompt).toBe('implement');
    expect(q.options).toHaveLength(4);
    expect(q.options).toContain('시행하다');
    expect(q.answer).toBe('시행하다');
  });

  it('example_en 없으면 blank 미출제', () => {
    const noEx = word({ id: 'comply', pos: 'verb', meaning_ko: '준수하다', example_en: null });
    for (let i = 0; i < 20; i++) {
      const q = buildQuestion(noEx, pool, { isNewWord: true, rng: seq(i / 20, 0.5) });
      expect(q.type).toBe('multiple_choice'); // 신규 + 예문 없음 → mcq만 가능
    }
  });

  it('복습 단어(isNewWord=false)는 spelling 출제 가능, options는 빈 배열', () => {
    const q = buildQuestion(target, pool, { isNewWord: false, rng: seq(0.99, 0) }); // 마지막 허용 유형 = spelling
    expect(q.type).toBe('spelling');
    expect(q.options).toEqual([]);
    expect(q.prompt).toBe('시행하다');
    expect(q.answer).toBe('implement');
  });
});

describe('isSpellingCorrect', () => {
  it('trim + 대소문자 무시', () => {
    expect(isSpellingCorrect('  Implement ', 'implement')).toBe(true);
    expect(isSpellingCorrect('IMPLEMENT', 'implement')).toBe(true);
  });

  it('오타는 오답', () => {
    expect(isSpellingCorrect('implment', 'implement')).toBe(false);
    expect(isSpellingCorrect('', 'implement')).toBe(false);
  });
});
