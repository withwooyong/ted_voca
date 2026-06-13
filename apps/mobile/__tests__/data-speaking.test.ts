/**
 * 스피킹 데이터 레이어(local mock 모드) 계약 테스트 — plan p5
 * data-listening.test.ts 패턴 준용.
 * 대상: apps/mobile/lib/data (확장 미구현) — 모두 red여야 함
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// speaking-pack fixture: 시나리오 2개 / 턴 5개
// virtual: true — lib/content/speaking-pack 파일이 아직 없어도 mock 등록 가능
jest.mock('@/lib/content/speaking-pack', () => {
  const scenarios = [
    {
      id: 'sc-uuid-1',
      slug: 'cafe-order',
      title: '카페 주문',
      context: 'You are at a café.',
      difficulty: 1,
      emoji: '☕',
      min_level: 1,
      sort_order: 1,
    },
    {
      id: 'sc-uuid-2',
      slug: 'hotel-checkin',
      title: '호텔 체크인',
      context: 'You are checking into a hotel.',
      difficulty: 2,
      emoji: '🏨',
      min_level: 2,
      sort_order: 2,
    },
  ];
  const turns = [
    {
      id: 'turn-1',
      scenario_slug: 'cafe-order',
      turn_order: 1,
      speaker: 'ted',
      text_en: 'Hello, what can I get you?',
      hint_ko: null,
    },
    {
      id: 'turn-2',
      scenario_slug: 'cafe-order',
      turn_order: 2,
      speaker: 'user',
      text_en: 'I would like a coffee please.',
      hint_ko: '커피 한 잔 주세요.',
    },
    {
      id: 'turn-3',
      scenario_slug: 'cafe-order',
      turn_order: 3,
      speaker: 'ted',
      text_en: 'Sure! Anything else?',
      hint_ko: null,
    },
    {
      id: 'turn-4',
      scenario_slug: 'hotel-checkin',
      turn_order: 1,
      speaker: 'ted',
      text_en: 'Welcome! Do you have a reservation?',
      hint_ko: null,
    },
    {
      id: 'turn-5',
      scenario_slug: 'hotel-checkin',
      turn_order: 2,
      speaker: 'user',
      text_en: 'Yes, my name is Kim.',
      hint_ko: '네, 제 이름은 Kim입니다.',
    },
  ];
  return {
    getBundledSpeakingScenarios: () => scenarios,
    getBundledDialogueTurns: () => turns,
  };
});

// eslint-disable-next-line import/first -- jest.mock 호이스팅
import * as data from '@/lib/data';

const NOW = new Date('2026-06-13T12:00:00.000Z');
const TOMORROW = new Date('2026-06-14T12:00:00.000Z');

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ────────────────────────────────────────────────────────────
// 1. getSpeakingScenarios
// ────────────────────────────────────────────────────────────

describe('getSpeakingScenarios — fixture 반환', () => {
  it('getSpeakingScenarios 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).getSpeakingScenarios).toBe('function');
  });

  it('시나리오 배열 반환', async () => {
    const scenarios = await (data as any).getSpeakingScenarios();
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBe(2);
  });

  it('시나리오 구조 검증 (id, slug, title, difficulty, emoji, min_level, sort_order)', async () => {
    const scenarios = await (data as any).getSpeakingScenarios();
    expect(scenarios[0]).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      title: expect.any(String),
      difficulty: expect.any(Number),
      emoji: expect.any(String),
      min_level: expect.any(Number),
      sort_order: expect.any(Number),
    });
  });

  it('sort_order 오름차순으로 반환', async () => {
    const scenarios = await (data as any).getSpeakingScenarios();
    expect(scenarios[0].slug).toBe('cafe-order');
    expect(scenarios[1].slug).toBe('hotel-checkin');
  });
});

// ────────────────────────────────────────────────────────────
// 2. getDialogueTurns
// ────────────────────────────────────────────────────────────

describe('getDialogueTurns — slug 기반 반환', () => {
  it('getDialogueTurns 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).getDialogueTurns).toBe('function');
  });

  it('slug에 맞는 턴만 반환', async () => {
    const turns = await (data as any).getDialogueTurns('cafe-order');
    expect(turns.every((t: any) => t.scenario_slug === 'cafe-order')).toBe(true);
    expect(turns.length).toBe(3);
  });

  it('turn_order 오름차순 정렬', async () => {
    const turns = await (data as any).getDialogueTurns('cafe-order');
    const orders = turns.map((t: any) => t.turn_order);
    expect(orders).toEqual([1, 2, 3]);
  });

  it('존재하지 않는 slug → 빈 배열', async () => {
    const turns = await (data as any).getDialogueTurns('nonexistent');
    expect(turns).toEqual([]);
  });

  it('턴 구조 검증 (id, scenario_slug, turn_order, speaker, text_en, hint_ko)', async () => {
    const turns = await (data as any).getDialogueTurns('cafe-order');
    const userTurn = turns.find((t: any) => t.speaker === 'user');
    expect(userTurn).toMatchObject({
      id: expect.any(String),
      scenario_slug: 'cafe-order',
      turn_order: expect.any(Number),
      speaker: 'user',
      text_en: expect.any(String),
    });
    expect(userTurn.hint_ko).toBe('커피 한 잔 주세요.');
  });
});

// ────────────────────────────────────────────────────────────
// 3. getSpeakingRemaining
// ────────────────────────────────────────────────────────────

describe('getSpeakingRemaining — 일일 잔여 횟수', () => {
  it('getSpeakingRemaining 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).getSpeakingRemaining).toBe('function');
  });

  it('초기 상태: 잔여 10', async () => {
    const remaining = await (data as any).getSpeakingRemaining(NOW);
    expect(remaining).toBe(10);
  });

  it('requestSpeakFeedback 1회 후 잔여 9', async () => {
    await (data as any).requestSpeakFeedback({
      scenarioSlug: 'cafe-order',
      turnOrder: 2,
      userText: 'I would like a coffee please',
      expectedText: 'I would like a coffee please.',
      now: NOW,
    });
    const remaining = await (data as any).getSpeakingRemaining(NOW);
    expect(remaining).toBe(9);
  });
});

// ────────────────────────────────────────────────────────────
// 4. requestSpeakFeedback — 정상 흐름
// ────────────────────────────────────────────────────────────

describe('requestSpeakFeedback — 정상 흐름', () => {
  it('requestSpeakFeedback 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).requestSpeakFeedback).toBe('function');
  });

  it('정상 호출 → {feedback, remainingToday} 반환', async () => {
    const result = await (data as any).requestSpeakFeedback({
      scenarioSlug: 'cafe-order',
      turnOrder: 2,
      userText: 'I would like a coffee please',
      expectedText: 'I would like a coffee please.',
      now: NOW,
    });

    expect(result).toMatchObject({
      feedback: {
        verdict: expect.stringMatching(/^(natural|ok|awkward)$/),
        correction: expect.any(String),
        alternative: expect.any(String),
      },
      remainingToday: expect.any(Number),
    });
    expect(result.remainingToday).toBe(9);
  });

  it('attempts가 AsyncStorage tv_speaking_attempts에 누적', async () => {
    await (data as any).requestSpeakFeedback({
      scenarioSlug: 'cafe-order',
      turnOrder: 2,
      userText: 'I would like a coffee please',
      expectedText: 'I would like a coffee please.',
      now: NOW,
    });

    const raw = await AsyncStorage.getItem('tv_speaking_attempts');
    const attempts = JSON.parse(raw ?? '[]');
    expect(attempts.length).toBe(1);
    expect(attempts[0]).toMatchObject({
      scenario_slug: 'cafe-order',
      turn_order: 2,
      user_text: 'I would like a coffee please',
      feedback: expect.objectContaining({ verdict: expect.any(String) }),
      created_at: expect.any(String),
    });
  });
});

// ────────────────────────────────────────────────────────────
// 5. requestSpeakFeedback — 일일 한도
// ────────────────────────────────────────────────────────────

describe('requestSpeakFeedback — 일일 한도', () => {
  async function callFeedback(n: number, now = NOW) {
    for (let i = 0; i < n; i++) {
      await (data as any).requestSpeakFeedback({
        scenarioSlug: 'cafe-order',
        turnOrder: 2,
        userText: `utterance ${i}`,
        expectedText: 'I would like a coffee please.',
        now,
      });
    }
  }

  it('10회 소진 후 11번째 → {error:"daily_limit", remainingToday:0}', async () => {
    await callFeedback(10);

    const result = await (data as any).requestSpeakFeedback({
      scenarioSlug: 'cafe-order',
      turnOrder: 2,
      userText: 'one more try',
      expectedText: 'I would like a coffee please.',
      now: NOW,
    });

    expect(result).toEqual({ error: 'daily_limit', remainingToday: 0 });
  });

  it('날짜 바뀌면(다음날) 카운트 리셋 → 다시 정상 응답', async () => {
    await callFeedback(10, NOW); // 오늘 소진

    const result = await (data as any).requestSpeakFeedback({
      scenarioSlug: 'cafe-order',
      turnOrder: 2,
      userText: 'tomorrow utterance',
      expectedText: 'I would like a coffee please.',
      now: TOMORROW,
    });

    expect(result).not.toHaveProperty('error');
    expect(result).toMatchObject({ feedback: expect.any(Object), remainingToday: 9 });
  });
});

// ────────────────────────────────────────────────────────────
// 6. requestSpeakFeedback — 발화 길이 cap
// ────────────────────────────────────────────────────────────

describe('requestSpeakFeedback — 500자 cap', () => {
  it('userText 500자 초과 시 throw (utterance_too_long 포함)', async () => {
    const longText = 'a'.repeat(501);

    await expect(
      (data as any).requestSpeakFeedback({
        scenarioSlug: 'cafe-order',
        turnOrder: 2,
        userText: longText,
        expectedText: 'I would like a coffee please.',
        now: NOW,
      }),
    ).rejects.toThrow('utterance_too_long');
  });

  it('정확히 500자는 허용', async () => {
    const maxText = 'a'.repeat(500);

    await expect(
      (data as any).requestSpeakFeedback({
        scenarioSlug: 'cafe-order',
        turnOrder: 2,
        userText: maxText,
        expectedText: 'I would like a coffee please.',
        now: NOW,
      }),
    ).resolves.not.toHaveProperty('error');
  });
});
