/**
 * 데이터 레이어(local mock 모드) 계약 테스트 — plan §1.2.3 repository 패턴.
 * Supabase 미설정 분기를 강제하기 위해 supabase 모듈을 mock.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// eslint-disable-next-line import/first -- jest.mock 호이스팅으로 mock이 import보다 먼저 적용됨
import * as data from '@/lib/data';

const NOW = new Date('2026-06-12T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getWords — 번들 단어팩 시드', () => {
  it('toeic-800 코스 510개 단어 로드', async () => {
    const words = await data.getWords();
    expect(words).toHaveLength(510);
    expect(words[0]).toMatchObject({
      id: expect.any(String),
      lemma: expect.any(String),
      meaning_ko: expect.any(String),
      difficulty: expect.any(Number),
    });
  });
});

describe('복습 큐 (user_words)', () => {
  it('학습 이력 없으면 due 없음', async () => {
    expect(await data.getDueWords(NOW)).toHaveLength(0);
  });

  it('오답 기록 → 즉시 due에 등장', async () => {
    const [w] = await data.getWords();
    await data.recordAttempt({ wordId: w.id, quizType: 'multiple_choice', correct: false, now: NOW });
    const due = await data.getDueWords(NOW);
    expect(due.map((d) => d.word.id)).toContain(w.id);
  });

  it('saveReview(good) → 1일 뒤로 밀려나고, 2일 뒤에는 due', async () => {
    const [w] = await data.getWords();
    await data.recordAttempt({ wordId: w.id, quizType: 'multiple_choice', correct: false, now: NOW });
    await data.saveReview(w.id, 'good', NOW);

    expect((await data.getDueWords(NOW)).map((d) => d.word.id)).not.toContain(w.id);
    const later = new Date(NOW.getTime() + 2 * DAY);
    expect((await data.getDueWords(later)).map((d) => d.word.id)).toContain(w.id);
  });

  it('정답 기록은 user_word를 만들되 즉시 due로 만들지 않는다', async () => {
    const [w] = await data.getWords();
    await data.recordAttempt({ wordId: w.id, quizType: 'blank', correct: true, now: NOW });
    const due = await data.getDueWords(new Date(NOW.getTime() + 1000));
    expect(due.map((d) => d.word.id)).not.toContain(w.id);
  });
});

describe('최근 정답률 (난이도 조절 입력)', () => {
  it('최신순 boolean 배열', async () => {
    const [a, b, c] = await data.getWords();
    await data.recordAttempt({ wordId: a.id, quizType: 'blank', correct: true, now: NOW });
    await data.recordAttempt({ wordId: b.id, quizType: 'blank', correct: false, now: new Date(NOW.getTime() + 1000) });
    await data.recordAttempt({ wordId: c.id, quizType: 'blank', correct: true, now: new Date(NOW.getTime() + 2000) });

    const recent = await data.getRecentResults(10);
    expect(recent).toEqual([true, false, true]);
  });
});

describe('세션 완료 — XP·streak 반영', () => {
  it('completeSession: xp 적립 + last_study_date + streak 갱신', async () => {
    await data.completeSession({ module: 'vocab', itemsCompleted: 3, itemsCorrect: 2, xpEarned: 16, now: NOW });
    const p = await data.getLocalProfileProgress();
    expect(p.xp).toBe(16);
    expect(p.streak).toBe(1);
    expect(p.last_study_date).toBe('2026-06-12');

    // 다음날 한 번 더 → streak 2
    const tomorrow = new Date(NOW.getTime() + DAY);
    await data.completeSession({ module: 'review', itemsCompleted: 4, itemsCorrect: 4, xpEarned: 30, now: tomorrow });
    const p2 = await data.getLocalProfileProgress();
    expect(p2.xp).toBe(46);
    expect(p2.streak).toBe(2);
  });
});

describe('오늘 할 일 요약 (홈)', () => {
  it('due 수·오늘 완료 문항 수 집계', async () => {
    const [w] = await data.getWords();
    await data.recordAttempt({ wordId: w.id, quizType: 'blank', correct: false, now: NOW });
    const today = await data.getTodaySummary(NOW);
    expect(today.dueCount).toBeGreaterThanOrEqual(1);
    expect(today.attemptsToday).toBe(1);
  });
});
