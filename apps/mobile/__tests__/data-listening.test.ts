/**
 * 리스닝 데이터 레이어(local mock 모드) 계약 테스트 — plan p4
 * data-grammar.test.ts 패턴 준용.
 * 대상: apps/mobile/lib/data (확장 미구현) — 모두 red여야 함
 *
 * 주의: jest-expo 커스텀 resolver는 virtual mock을 지원하지 않으므로
 * lib/data의 listening 함수들을 직접 계약 테스트.
 * getListeningClips/getListeningQuestions는 lib/data에서 export되지 않아
 * 첫 import 시점에 "export not found" 에러로 red가 됨.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// content/listening-pack.json은 다른 에이전트가 생성 중이므로 fixture mock으로 대체.
// (jest 테스트가 실제 JSON 파일에 의존하지 않게 — plan §임무범위)
jest.mock('@/lib/content/listening-pack', () => {
  const clips = [
    {
      id: 'clip-1',
      slug: 'office-meeting',
      title: 'Office Meeting',
      transcript_en: 'The meeting starts at nine.',
      transcript_ko: '회의는 9시에 시작합니다.',
      duration_seconds: 6,
      difficulty: 2,
      tags: ['office'],
      sort_order: 1,
    },
    {
      id: 'clip-2',
      slug: 'airport-announcement',
      title: 'Airport Announcement',
      transcript_en: 'Flight 204 is now boarding at gate 7.',
      transcript_ko: '204편이 7번 게이트에서 탑승을 시작합니다.',
      duration_seconds: 8,
      difficulty: 3,
      tags: ['travel'],
      sort_order: 2,
    },
  ];
  const questions = [
    {
      id: 'lq-1',
      clip_slug: 'office-meeting',
      prompt: 'When does the meeting start?',
      choices: ['At 8', 'At 9', 'At 10', 'At 11'],
      answer: 'At 9',
      explanation: '9시에 시작한다고 했습니다.',
      sort_order: 1,
    },
    {
      id: 'lq-2',
      clip_slug: 'airport-announcement',
      prompt: 'Which gate is boarding?',
      choices: ['Gate 5', 'Gate 6', 'Gate 7', 'Gate 8'],
      answer: 'Gate 7',
      explanation: '7번 게이트에서 탑승합니다.',
      sort_order: 1,
    },
  ];
  return {
    getBundledListeningClips: () => clips,
    getBundledListeningQuestions: () => questions,
  };
});

// eslint-disable-next-line import/first -- jest.mock 호이스팅
import * as data from '@/lib/data';

const NOW = new Date('2026-06-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ────────────────────────────────────────────────────────────
// 1. getListeningClips
// ────────────────────────────────────────────────────────────

describe('getListeningClips — 번들 클립 반환', () => {
  it('getListeningClips 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).getListeningClips).toBe('function');
  });

  it('클립 배열 반환', async () => {
    const clips = await (data as any).getListeningClips();
    expect(Array.isArray(clips)).toBe(true);
  });

  it('클립 구조 검증 (id, slug, title, transcript_en, difficulty, tags, sort_order)', async () => {
    const clips = await (data as any).getListeningClips();
    expect(clips.length).toBeGreaterThan(0);
    expect(clips[0]).toMatchObject({
      id: expect.any(String),
      slug: expect.any(String),
      title: expect.any(String),
      transcript_en: expect.any(String),
      difficulty: expect.any(Number),
      tags: expect.any(Array),
      sort_order: expect.any(Number),
    });
  });
});

// ────────────────────────────────────────────────────────────
// 2. getListeningQuestions
// ────────────────────────────────────────────────────────────

describe('getListeningQuestions — 필터·전체 반환', () => {
  it('getListeningQuestions 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).getListeningQuestions).toBe('function');
  });

  it('인자 없으면 전체 문항 반환', async () => {
    const qs = await (data as any).getListeningQuestions();
    expect(Array.isArray(qs)).toBe(true);
  });

  it('slug 지정 시 해당 클립 문항만 반환', async () => {
    const clips = await (data as any).getListeningClips();
    if (clips.length === 0) return;

    const targetSlug = clips[0].slug;
    const qs = await (data as any).getListeningQuestions(targetSlug);
    expect(Array.isArray(qs)).toBe(true);
    expect(qs.every((q: any) => q.clip_slug === targetSlug)).toBe(true);
  });

  it('존재하지 않는 slug는 빈 배열', async () => {
    const qs = await (data as any).getListeningQuestions('__nonexistent__slug__');
    expect(qs).toEqual([]);
  });

  it('문항 구조 검증 (id, clip_slug, prompt, choices, answer, explanation, sort_order)', async () => {
    const qs = await (data as any).getListeningQuestions();
    if (qs.length === 0) return;
    expect(qs[0]).toMatchObject({
      id: expect.any(String),
      clip_slug: expect.any(String),
      prompt: expect.any(String),
      choices: expect.any(Array),
      answer: expect.any(String),
      explanation: expect.any(String),
      sort_order: expect.any(Number),
    });
  });
});

// ────────────────────────────────────────────────────────────
// 3. recordListeningAttempt
// ────────────────────────────────────────────────────────────

describe('recordListeningAttempt — AsyncStorage 저장', () => {
  it('recordListeningAttempt 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).recordListeningAttempt).toBe('function');
  });

  it('저장 후 오늘 요약 attemptsToday에 포함', async () => {
    await (data as any).recordListeningAttempt({
      questionId: 'q-uuid-1',
      correct: true,
      now: NOW,
    });
    const today = await data.getTodaySummary(NOW);
    expect(today.attemptsToday).toBe(1);
    expect(today.correctToday).toBe(1);
  });

  it('오답 기록도 attemptsToday에 포함, correctToday에는 미포함', async () => {
    await (data as any).recordListeningAttempt({ questionId: 'q-1', correct: false, now: NOW });
    await (data as any).recordListeningAttempt({ questionId: 'q-2', correct: true, now: NOW });
    const today = await data.getTodaySummary(NOW);
    expect(today.attemptsToday).toBe(2);
    expect(today.correctToday).toBe(1);
  });

  it('userAnswer 선택 인자 포함 — 에러 없이 저장', async () => {
    await expect(
      (data as any).recordListeningAttempt({
        questionId: 'q-uuid-1',
        correct: true,
        now: NOW,
        userAnswer: 'At 9 AM',
      }),
    ).resolves.toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 4. 리스닝 attempt는 어휘 난이도 조절(getRecentResults)에 섞이지 않음
// ────────────────────────────────────────────────────────────

describe('리스닝 attempt 격리 — getRecentResults 오염 없음', () => {
  it('recordListeningAttempt 후 getRecentResults에는 미포함', async () => {
    // 어휘 attempt 1개
    const [w] = await data.getWords();
    await data.recordAttempt({ wordId: w.id, quizType: 'blank', correct: true, now: NOW });

    // 리스닝 attempt 1개 (오답)
    await (data as any).recordListeningAttempt({
      questionId: 'q-uuid-1',
      correct: false,
      now: new Date(NOW.getTime() + 1000),
    });

    // 어휘 난이도 입력에는 어휘 attempt만
    const recent = await data.getRecentResults(10);
    expect(recent).toEqual([true]); // 리스닝 false는 제외
  });
});

// ────────────────────────────────────────────────────────────
// 5. getBoosterItems
// ────────────────────────────────────────────────────────────

describe('getBoosterItems — BoosterItem 생성', () => {
  it('getBoosterItems 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof (data as any).getBoosterItems).toBe('function');
  });

  it('attempt 없으면 빈 배열', async () => {
    const items = await (data as any).getBoosterItems(NOW);
    expect(items).toEqual([]);
  });

  it('어휘 attempt + 번들 단어(example_en 보유)에서 BoosterItem 생성', async () => {
    const words = await data.getWords();
    const wordWithExample = words.find((w) => w.example_en);
    if (!wordWithExample) return;

    await data.recordAttempt({
      wordId: wordWithExample.id,
      quizType: 'blank',
      correct: true,
      now: NOW,
    });

    const items = await (data as any).getBoosterItems(NOW);
    expect(items.length).toBeGreaterThan(0);
    const found = items.find((item: any) => item.wordId === wordWithExample.id);
    expect(found).toBeDefined();
    expect(found).toMatchObject({
      wordId: wordWithExample.id,
      lemma: wordWithExample.lemma,
      meaningKo: wordWithExample.meaning_ko,
      exampleEn: wordWithExample.example_en,
    });
  });

  it('7일 밖 attempt는 제외', async () => {
    const [w] = await data.getWords();
    const eightDaysAgo = new Date(NOW.getTime() - 8 * DAY);
    await data.recordAttempt({ wordId: w.id, quizType: 'blank', correct: true, now: eightDaysAgo });

    const items = await (data as any).getBoosterItems(NOW);
    expect(items.some((item: any) => item.wordId === w.id)).toBe(false);
  });

  it('BoosterItem 구조 검증 (wordId, lemma, meaningKo, exampleEn)', async () => {
    const words = await data.getWords();
    const wordWithExample = words.find((w) => w.example_en);
    if (!wordWithExample) return;

    await data.recordAttempt({
      wordId: wordWithExample.id,
      quizType: 'blank',
      correct: true,
      now: NOW,
    });

    const items = await (data as any).getBoosterItems(NOW);
    if (items.length === 0) return;
    expect(items[0]).toMatchObject({
      wordId: expect.any(String),
      lemma: expect.any(String),
      meaningKo: expect.any(String),
      exampleEn: expect.any(String),
    });
    expect(items[0].exampleEn.length).toBeGreaterThan(0);
  });
});
