import { describe, expect, it } from 'vitest';

import { displayStreak, nextStreak, toDateKey } from '../src/streak';

const TODAY = new Date(2026, 5, 12, 9, 0, 0); // 2026-06-12 로컬

describe('toDateKey', () => {
  it('로컬 YYYY-MM-DD', () => {
    expect(toDateKey(TODAY)).toBe('2026-06-12');
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('nextStreak — 세션 완료 시', () => {
  it('첫 학습 → 1', () => {
    expect(nextStreak(null, 0, TODAY)).toBe(1);
  });

  it('오늘 이미 학습 → 유지', () => {
    expect(nextStreak('2026-06-12', 5, TODAY)).toBe(5);
  });

  it('어제 학습 → +1', () => {
    expect(nextStreak('2026-06-11', 5, TODAY)).toBe(6);
  });

  it('이틀 이상 공백 → 1로 리셋', () => {
    expect(nextStreak('2026-06-10', 9, TODAY)).toBe(1);
    expect(nextStreak('2025-12-31', 30, TODAY)).toBe(1);
  });

  it('월 경계: 5/31 → 6/1은 연속', () => {
    expect(nextStreak('2026-05-31', 3, new Date(2026, 5, 1))).toBe(4);
  });
});

describe('displayStreak — 홈 표시용', () => {
  it('오늘/어제 학습이면 그대로', () => {
    expect(displayStreak('2026-06-12', 5, TODAY)).toBe(5);
    expect(displayStreak('2026-06-11', 5, TODAY)).toBe(5);
  });

  it('이틀 이상 공백이면 0 (끊김)', () => {
    expect(displayStreak('2026-06-09', 5, TODAY)).toBe(0);
    expect(displayStreak(null, 0, TODAY)).toBe(0);
  });
});
