/**
 * 문법 데이터 레이어(local mock 모드) 계약 테스트 — plan p3 §1.2.4.
 * 어휘(data-local.test.ts)와 같은 패턴: supabase mock으로 local 분기 강제.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// eslint-disable-next-line import/first -- jest.mock 호이스팅
import * as data from '@/lib/data';
// eslint-disable-next-line import/first -- jest.mock 호이스팅
import { normalizeAnswer } from '@ted-voca/shared';

const NOW = new Date('2026-06-12T09:00:00.000Z');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('문법 콘텐츠 (번들 grammar-pack)', () => {
  it('토픽 20개 이상, CEFR·tags 포함', async () => {
    const topics = await data.getGrammarTopics();
    expect(topics.length).toBeGreaterThanOrEqual(20);
    expect(topics[0]).toMatchObject({
      slug: expect.any(String),
      title: expect.any(String),
      cefr_level: expect.stringMatching(/^[ABC][12]$/),
      tags: expect.any(Array),
    });
  });

  it('문항 200개 이상, 모든 문항의 answer가 유효', async () => {
    const questions = await data.getGrammarQuestions();
    expect(questions.length).toBeGreaterThanOrEqual(200);
    for (const q of questions) {
      expect(['word_order', 'blank_choice', 'error_find']).toContain(q.question_type);
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      if (q.question_type === 'word_order') {
        // 칩을 모두 이으면 정답 문장이 돼야 함 — 채점기와 동일한 정규화 사용
        expect(normalizeAnswer(q.options.join(' '))).toBe(normalizeAnswer(q.answer));
      } else {
        expect(q.options).toContain(q.answer);
      }
      expect(q.explanation.length).toBeGreaterThan(5);
    }
  });

  it('topicSlug 필터', async () => {
    const topics = await data.getGrammarTopics();
    const qs = await data.getGrammarQuestions(topics[0].slug);
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.topic_slug === topics[0].slug)).toBe(true);
  });
});

describe('문법 attempt 기록', () => {
  it('recordGrammarAttempt가 저장되고, 어휘 난이도 입력(getRecentResults)을 오염시키지 않는다', async () => {
    const [w] = await data.getWords();
    const [gq] = await data.getGrammarQuestions();

    await data.recordAttempt({ wordId: w.id, quizType: 'blank', correct: true, now: NOW });
    await data.recordGrammarAttempt({ questionId: gq.id, correct: false, now: new Date(NOW.getTime() + 1000) });

    // 어휘 난이도 조절용 최근 기록에는 문법 attempt 제외
    const recent = await data.getRecentResults(10);
    expect(recent).toEqual([true]);
  });

  it('오늘 요약(attemptsToday)에는 문법 attempt 포함', async () => {
    const [gq] = await data.getGrammarQuestions();
    await data.recordGrammarAttempt({ questionId: gq.id, correct: true, now: NOW });
    const today = await data.getTodaySummary(NOW);
    expect(today.attemptsToday).toBe(1);
    expect(today.correctToday).toBe(1);
  });

  it('문법 세션 완료 → XP·streak 반영 (P2 인프라 재사용)', async () => {
    await data.completeSession({ module: 'grammar', itemsCompleted: 5, itemsCorrect: 4, xpEarned: 22, now: NOW });
    const p = await data.getLocalProfileProgress();
    expect(p.xp).toBe(22);
    expect(p.streak).toBe(1);
  });
});
