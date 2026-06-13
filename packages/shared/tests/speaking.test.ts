// P5 Speaking — 공유 로직 계약 테스트 (vitest)
// 대상: packages/shared/src/speaking.ts (미구현) — 모두 red여야 함
import { describe, expect, it } from 'vitest';

import {
  compareUtterance,
  isScenarioLocked,
  localFeedback,
  normalizeUtterance,
  SPEAKING_DAILY_LIMIT,
  SPEAKING_MAX_UTTERANCE_CHARS,
  turnsForScenario,
  XP_PER_SPEAKING_TURN,
  xpForSpeakingSession,
  type DialogueTurnLike,
  type SpeakFeedback,
  type SpeakingScenarioLike,
} from '../src/speaking';

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function scenario(over: Partial<SpeakingScenarioLike> & { id: string; slug: string }): SpeakingScenarioLike {
  return {
    title: '테스트 시나리오',
    context: 'You are at a café.',
    difficulty: 2,
    emoji: '☕',
    min_level: 1,
    sort_order: 1,
    ...over,
  };
}

function turn(
  over: Partial<DialogueTurnLike> & { id: string; scenario_slug: string; turn_order: number; speaker: 'ted' | 'user'; text_en: string },
): DialogueTurnLike {
  return {
    hint_ko: null,
    ...over,
  };
}

// ────────────────────────────────────────────────────────────
// 1. 상수
// ────────────────────────────────────────────────────────────

describe('Speaking 상수', () => {
  it('SPEAKING_DAILY_LIMIT = 10', () => {
    expect(SPEAKING_DAILY_LIMIT).toBe(10);
  });

  it('SPEAKING_MAX_UTTERANCE_CHARS = 500', () => {
    expect(SPEAKING_MAX_UTTERANCE_CHARS).toBe(500);
  });

  it('XP_PER_SPEAKING_TURN = 5', () => {
    expect(XP_PER_SPEAKING_TURN).toBe(5);
  });
});

// ────────────────────────────────────────────────────────────
// 2. xpForSpeakingSession
// ────────────────────────────────────────────────────────────

describe('xpForSpeakingSession', () => {
  it('0턴이면 0 반환', () => {
    expect(xpForSpeakingSession(0)).toBe(0);
  });

  it('3턴이면 turn*5 + 세션 보너스(10) = 25', () => {
    expect(xpForSpeakingSession(3)).toBe(3 * 5 + 10);
  });

  it('1턴이면 5 + 10 = 15', () => {
    expect(xpForSpeakingSession(1)).toBe(15);
  });
});

// ────────────────────────────────────────────────────────────
// 3. isScenarioLocked
// ────────────────────────────────────────────────────────────

describe('isScenarioLocked', () => {
  it('min_level > userLevel → 잠금', () => {
    const s = scenario({ id: 's1', slug: 'cafe', min_level: 5 });
    expect(isScenarioLocked(s, 3)).toBe(true);
  });

  it('min_level == userLevel → 잠금 아님 (경계: 같으면 해제)', () => {
    const s = scenario({ id: 's1', slug: 'cafe', min_level: 3 });
    expect(isScenarioLocked(s, 3)).toBe(false);
  });

  it('min_level < userLevel → 잠금 아님', () => {
    const s = scenario({ id: 's1', slug: 'cafe', min_level: 1 });
    expect(isScenarioLocked(s, 5)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────
// 4. turnsForScenario
// ────────────────────────────────────────────────────────────

describe('turnsForScenario', () => {
  const turns: DialogueTurnLike[] = [
    turn({ id: 't1', scenario_slug: 'cafe', turn_order: 2, speaker: 'user', text_en: 'I want coffee.' }),
    turn({ id: 't2', scenario_slug: 'cafe', turn_order: 1, speaker: 'ted', text_en: 'Hello, what can I get you?' }),
    turn({ id: 't3', scenario_slug: 'hotel', turn_order: 1, speaker: 'ted', text_en: 'Welcome to the hotel.' }),
  ];

  it('해당 slug 턴만 반환', () => {
    const result = turnsForScenario(turns, 'cafe');
    expect(result.map((t) => t.id)).toEqual(expect.arrayContaining(['t1', 't2']));
    expect(result.every((t) => t.scenario_slug === 'cafe')).toBe(true);
  });

  it('turn_order 오름차순으로 정렬', () => {
    const result = turnsForScenario(turns, 'cafe');
    expect(result[0].id).toBe('t2'); // turn_order 1
    expect(result[1].id).toBe('t1'); // turn_order 2
  });

  it('다른 slug 턴 포함하지 않음', () => {
    const result = turnsForScenario(turns, 'cafe');
    expect(result.some((t) => t.scenario_slug === 'hotel')).toBe(false);
  });

  it('없는 slug면 빈 배열', () => {
    expect(turnsForScenario(turns, 'nonexistent')).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// 5. normalizeUtterance
// ────────────────────────────────────────────────────────────

describe('normalizeUtterance', () => {
  it('앞뒤 공백 trim', () => {
    expect(normalizeUtterance('  hello  ')).toBe('hello');
  });

  it('대문자 → 소문자', () => {
    expect(normalizeUtterance('Hello World')).toBe('hello world');
  });

  it('연속 공백 → 단일 공백', () => {
    expect(normalizeUtterance('hello   world')).toBe('hello world');
  });

  it('구두점 제거 (. , ! ? ; : \' ")', () => {
    expect(normalizeUtterance("Hello, world! How's it going?")).toBe('hello world hows it going');
  });

  it('빈 문자열은 빈 문자열 반환', () => {
    expect(normalizeUtterance('')).toBe('');
  });

  it('구두점만 있으면 빈 문자열 반환', () => {
    expect(normalizeUtterance('...')).toBe('');
  });

  it('복합: 대소문자 + 공백 + 구두점', () => {
    expect(normalizeUtterance('  I want a COFFEE, please!  ')).toBe('i want a coffee please');
  });
});

// ────────────────────────────────────────────────────────────
// 6. compareUtterance
// ────────────────────────────────────────────────────────────

describe('compareUtterance', () => {
  it('동일한 문장 → 1', () => {
    const s = 'I would like a coffee please';
    expect(compareUtterance(s, s)).toBe(1);
  });

  it('완전히 다른 문장 → 0', () => {
    expect(compareUtterance('I want coffee', 'the sky is blue')).toBe(0);
  });

  it('부분 일치는 0~1 사이 값', () => {
    const score = compareUtterance('I want a coffee please', 'I want coffee');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('어순 무관 토큰 기반 — 단어가 같으면 높은 점수', () => {
    const s1 = 'coffee want I';
    const s2 = 'I want coffee';
    const score = compareUtterance(s1, s2);
    // Dice 계수는 집합 기반 → 어순 상관 없이 동일 토큰이면 1
    expect(score).toBeGreaterThanOrEqual(0.8);
  });

  it('expected가 빈 문자열 → 0', () => {
    expect(compareUtterance('', 'I want coffee')).toBe(0);
  });

  it('actual이 빈 문자열 → 0', () => {
    expect(compareUtterance('I want coffee', '')).toBe(0);
  });

  it('대소문자 무시 (정규화 후 비교)', () => {
    const score = compareUtterance('I WANT COFFEE', 'i want coffee');
    expect(score).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// 7. localFeedback
// ────────────────────────────────────────────────────────────

describe('localFeedback', () => {
  const EXPECTED = 'I would like a coffee please.';
  const SIMILAR = 'I would like a coffee please'; // 거의 동일 (구두점 차이)
  const PARTIAL = 'I want coffee'; // 일부 겹침
  const UNRELATED = 'the elephant dances tonight'; // 무관

  it('동일 문장 → verdict natural', () => {
    const fb: SpeakFeedback = localFeedback(EXPECTED, SIMILAR);
    expect(fb.verdict).toBe('natural');
  });

  it('natural일 때 correction은 비어있지 않음 (칭찬 문구)', () => {
    const fb = localFeedback(EXPECTED, SIMILAR);
    expect(fb.correction.length).toBeGreaterThan(0);
  });

  it('부분 일치 → verdict ok', () => {
    const fb = localFeedback(EXPECTED, PARTIAL);
    expect(fb.verdict).toBe('ok');
  });

  it('ok일 때 correction에 expectedText 포함', () => {
    const fb = localFeedback(EXPECTED, PARTIAL);
    expect(fb.correction).toContain(EXPECTED);
  });

  it('무관 문장 → verdict awkward', () => {
    const fb = localFeedback(EXPECTED, UNRELATED);
    expect(fb.verdict).toBe('awkward');
  });

  it('awkward일 때 correction에 expectedText 포함', () => {
    const fb = localFeedback(EXPECTED, UNRELATED);
    expect(fb.correction).toContain(EXPECTED);
  });

  it('모든 케이스에서 alternative는 비어있지 않은 문자열', () => {
    expect(localFeedback(EXPECTED, SIMILAR).alternative.length).toBeGreaterThan(0);
    expect(localFeedback(EXPECTED, PARTIAL).alternative.length).toBeGreaterThan(0);
    expect(localFeedback(EXPECTED, UNRELATED).alternative.length).toBeGreaterThan(0);
  });
});
