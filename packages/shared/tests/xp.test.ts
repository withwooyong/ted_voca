import { describe, expect, it } from 'vitest';

import { levelFromXp, xpForQuizSession, xpForReviewGrade, xpForReviewSession } from '../src/xp';

describe('XP 정책 (plan §6)', () => {
  it('퀴즈 세션: 정답당 3 + 완료 보너스 10', () => {
    expect(xpForQuizSession(0)).toBe(10);
    expect(xpForQuizSession(7)).toBe(31);
    expect(xpForQuizSession(10)).toBe(40);
  });

  it('복습 카드: again 0, 나머지 5', () => {
    expect(xpForReviewGrade('again')).toBe(0);
    expect(xpForReviewGrade('hard')).toBe(5);
    expect(xpForReviewGrade('good')).toBe(5);
    expect(xpForReviewGrade('easy')).toBe(5);
  });

  it('복습 세션: 카드 합산 + 보너스 10', () => {
    expect(xpForReviewSession(['good', 'again', 'easy', 'hard'])).toBe(25); // 5+0+5+5+10
    expect(xpForReviewSession([])).toBe(0); // 빈 세션은 보너스 없음
  });
});

describe('levelFromXp — floor(sqrt(xp/100))+1', () => {
  it('경계값', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(399)).toBe(2);
    expect(levelFromXp(400)).toBe(3);
    expect(levelFromXp(10000)).toBe(11);
  });

  it('음수 방어 → 1', () => {
    expect(levelFromXp(-50)).toBe(1);
  });
});
