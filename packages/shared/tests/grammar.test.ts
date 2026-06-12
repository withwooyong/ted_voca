import { describe, expect, it } from 'vitest';

import {
  checkWordOrder,
  isGrammarCorrect,
  normalizeAnswer,
  pickGrammarSession,
  recommendTopics,
  shuffleChips,
  type GrammarQuestionLike,
  type GrammarTopicLike,
} from '../src/grammar';
import type { Rng } from '../src/quiz';

const seq = (...vals: number[]): Rng => {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
};

function q(over: Partial<GrammarQuestionLike> & { id: string }): GrammarQuestionLike {
  return {
    topic_slug: 'present-perfect',
    question_type: 'blank_choice',
    prompt: 'She ___ finished the work.',
    options: ['has', 'have', 'had'],
    answer: 'has',
    explanation: '3인칭 단수 → has',
    ...over,
  };
}

function topic(over: Partial<GrammarTopicLike> & { slug: string }): GrammarTopicLike {
  return {
    title: '현재완료',
    cefr_level: 'A2',
    explanation: '...',
    tags: ['tense'],
    sort_order: 1,
    ...over,
  };
}

describe('normalizeAnswer', () => {
  it('trim + 연속 공백 축소 + 소문자', () => {
    expect(normalizeAnswer('  He has  worked here ')).toBe('he has worked here');
    expect(normalizeAnswer('HE HAS WORKED')).toBe('he has worked');
  });

  it('문장 끝 구두점 제거 (. ! ?)', () => {
    expect(normalizeAnswer('He has worked here.')).toBe('he has worked here');
    expect(normalizeAnswer('Has he worked here?')).toBe('has he worked here');
    expect(normalizeAnswer('Stop!')).toBe('stop');
  });

  it("문장 중간 구두점·아포스트로피는 유지", () => {
    expect(normalizeAnswer("He doesn't work, sadly.")).toBe("he doesn't work, sadly");
  });
});

describe('checkWordOrder', () => {
  const answer = 'He has worked here for five years.';
  const chips = ['He', 'has', 'worked', 'here', 'for', 'five', 'years'];

  it('정확한 어순 → true (구두점·대소문자 무시)', () => {
    expect(checkWordOrder(chips, answer)).toBe(true);
    expect(checkWordOrder(chips.map((c) => c.toUpperCase()), answer)).toBe(true);
  });

  it('잘못된 어순 → false', () => {
    expect(checkWordOrder(['He', 'worked', 'has', 'here', 'for', 'five', 'years'], answer)).toBe(false);
  });

  it('칩 누락 → false', () => {
    expect(checkWordOrder(['He', 'has', 'worked'], answer)).toBe(false);
  });
});

describe('shuffleChips', () => {
  it('칩 구성은 유지하고 순서만 변경', () => {
    const chips = ['a', 'b', 'c', 'd'];
    const out = shuffleChips(chips, seq(0.9, 0.1, 0.5, 0.3));
    expect([...out].sort()).toEqual([...chips].sort());
  });

  it('정답 순서 그대로 반환하지 않는다 (rng가 항등 셔플을 만들어도 재셔플)', () => {
    const chips = ['He', 'has', 'worked'];
    // rng 0 연속 → Fisher-Yates 항등 가능 입력에서도 정답 순서 금지
    for (let i = 0; i < 10; i++) {
      const out = shuffleChips(chips, seq(i / 10, 0.01, 0.02, 0.03, 0.5, 0.7));
      expect(out.join(' ')).not.toBe(chips.join(' '));
    }
  });

  it('칩 1개면 그대로', () => {
    expect(shuffleChips(['only'], seq(0.5))).toEqual(['only']);
  });

  it('칩 2개 + 항등 셔플 rng → 회전으로 정답 순서 회피', () => {
    // Fisher-Yates에서 rng 0.9는 j=i(항등) → 회전 발동
    expect(shuffleChips(['A', 'B'], seq(0.9))).toEqual(['B', 'A']);
  });
});

describe('isGrammarCorrect', () => {
  it('word_order: picked 배열 채점', () => {
    const wo = q({
      id: 'w1',
      question_type: 'word_order',
      prompt: '그는 여기서 5년째 일하고 있다.',
      options: ['He', 'has', 'worked', 'here', 'for', 'five', 'years'],
      answer: 'He has worked here for five years.',
    });
    expect(isGrammarCorrect(wo, ['He', 'has', 'worked', 'here', 'for', 'five', 'years'])).toBe(true);
    expect(isGrammarCorrect(wo, ['has', 'He', 'worked', 'here', 'for', 'five', 'years'])).toBe(false);
  });

  it('blank_choice: 보기 텍스트 일치', () => {
    const bc = q({ id: 'b1' });
    expect(isGrammarCorrect(bc, 'has')).toBe(true);
    expect(isGrammarCorrect(bc, 'have')).toBe(false);
  });

  it('error_find: 조각 텍스트 일치', () => {
    const ef = q({
      id: 'e1',
      question_type: 'error_find',
      prompt: '틀린 부분을 고르세요: She have finished the work.',
      options: ['She', 'have', 'finished', 'the work'],
      answer: 'have',
    });
    expect(isGrammarCorrect(ef, 'have')).toBe(true);
    expect(isGrammarCorrect(ef, 'finished')).toBe(false);
  });
});

describe('pickGrammarSession', () => {
  const topics = [
    topic({ slug: 'present-perfect', tags: ['tense'] }),
    topic({ slug: 'articles', tags: ['articles'], sort_order: 2 }),
  ];
  const pool: GrammarQuestionLike[] = [
    q({ id: '1', topic_slug: 'present-perfect' }),
    q({ id: '2', topic_slug: 'present-perfect', question_type: 'word_order', options: ['a', 'b'], answer: 'a b' }),
    q({ id: '3', topic_slug: 'articles' }),
    q({ id: '4', topic_slug: 'articles' }),
    q({ id: '5', topic_slug: 'articles' }),
    q({ id: '6', topic_slug: 'present-perfect' }),
  ];

  it('count개 선택, 중복 없음', () => {
    const s = pickGrammarSession(pool, topics, 5, seq(0.1, 0.3, 0.5, 0.7, 0.9, 0.2));
    expect(s).toHaveLength(5);
    expect(new Set(s.map((x) => x.id)).size).toBe(5);
  });

  it('풀이 부족하면 가능한 만큼', () => {
    expect(pickGrammarSession(pool.slice(0, 2), topics, 5, seq(0.5))).toHaveLength(2);
  });

  it('weakTags 매칭 토픽 문항이 앞쪽에 우선', () => {
    const s = pickGrammarSession(pool, topics, 4, seq(0.1, 0.9, 0.4, 0.6, 0.2), ['tense']);
    // 첫 문항은 tense 토픽(present-perfect) 문항이어야 함
    expect(s[0].topic_slug).toBe('present-perfect');
  });
});

describe('recommendTopics', () => {
  const topics = [
    topic({ slug: 'articles', tags: ['articles'], sort_order: 2 }),
    topic({ slug: 'present-perfect', tags: ['tense'], sort_order: 1 }),
    topic({ slug: 'business-email', tags: ['business-vocab'], sort_order: 3 }),
  ];

  it('weak_tags와 교집합 있는 토픽만, sort_order 순', () => {
    const r = recommendTopics(topics, ['tense', 'business-vocab']);
    expect(r.map((t) => t.slug)).toEqual(['present-perfect', 'business-email']);
  });

  it('weak_tags 비면 빈 배열', () => {
    expect(recommendTopics(topics, [])).toEqual([]);
  });
});
