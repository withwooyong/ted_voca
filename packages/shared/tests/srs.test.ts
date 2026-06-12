import { describe, expect, it } from 'vitest';

import {
  applyGrade,
  initialSrsState,
  previewIntervals,
  SRS_MIN_EASE,
  type SrsState,
} from '../src/srs';

const NOW = new Date('2026-06-12T09:00:00.000Z');

function daysLater(n: number): string {
  return new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();
}

function makeState(over: Partial<SrsState> = {}): SrsState {
  return { ...initialSrsState(NOW), ...over };
}

describe('initialSrsState', () => {
  it('Anki 호환 기본값', () => {
    const s = initialSrsState(NOW);
    expect(s.ease_factor).toBe(2.5);
    expect(s.interval_days).toBe(0);
    expect(s.repetitions).toBe(0);
    expect(s.correct_streak).toBe(0);
    expect(s.total_reviews).toBe(0);
    expect(s.total_correct).toBe(0);
    expect(s.status).toBe('new');
    expect(s.next_review_at).toBe(NOW.toISOString());
  });
});

describe('applyGrade — again', () => {
  it('repetitions·interval 리셋, ease -0.2, 10분 뒤 재출제', () => {
    const s = applyGrade(makeState({ repetitions: 3, interval_days: 7, correct_streak: 3 }), 'again', NOW);
    expect(s.repetitions).toBe(0);
    expect(s.interval_days).toBe(0);
    expect(s.ease_factor).toBeCloseTo(2.3, 5);
    expect(s.correct_streak).toBe(0);
    expect(s.next_review_at).toBe(new Date(NOW.getTime() + 10 * 60 * 1000).toISOString());
    expect(s.status).toBe('learning');
  });

  it('ease는 1.3 밑으로 내려가지 않는다', () => {
    const s = applyGrade(makeState({ ease_factor: 1.35 }), 'again', NOW);
    expect(s.ease_factor).toBe(SRS_MIN_EASE);
  });

  it('total_correct는 증가하지 않고 total_reviews만 증가', () => {
    const s = applyGrade(makeState({ total_reviews: 5, total_correct: 4 }), 'again', NOW);
    expect(s.total_reviews).toBe(6);
    expect(s.total_correct).toBe(4);
  });
});

describe('applyGrade — hard', () => {
  it('interval ×1.2 (최소 1일), ease -0.15', () => {
    const s = applyGrade(makeState({ repetitions: 2, interval_days: 5, ease_factor: 2.5 }), 'hard', NOW);
    expect(s.interval_days).toBe(6); // round(5*1.2)
    expect(s.ease_factor).toBeCloseTo(2.35, 5);
    expect(s.repetitions).toBe(3);
    expect(s.next_review_at).toBe(daysLater(6));
  });

  it('첫 평가 hard → 1일', () => {
    const s = applyGrade(makeState(), 'hard', NOW);
    expect(s.interval_days).toBe(1);
    expect(s.next_review_at).toBe(daysLater(1));
  });
});

describe('applyGrade — good', () => {
  it('rep 1 → 1일', () => {
    const s = applyGrade(makeState(), 'good', NOW);
    expect(s.repetitions).toBe(1);
    expect(s.interval_days).toBe(1);
    expect(s.ease_factor).toBe(2.5); // good은 ease 불변
    expect(s.status).toBe('learning');
  });

  it('rep 2 → 3일 (프로토타입 표기 기준)', () => {
    const s1 = applyGrade(makeState(), 'good', NOW);
    const s2 = applyGrade(s1, 'good', NOW);
    expect(s2.repetitions).toBe(2);
    expect(s2.interval_days).toBe(3);
    expect(s2.status).toBe('review');
  });

  it('rep 3+ → round(interval × ease)', () => {
    const s = applyGrade(
      makeState({ repetitions: 2, interval_days: 3, ease_factor: 2.5, status: 'review' }),
      'good',
      NOW,
    );
    expect(s.interval_days).toBe(8); // round(3*2.5)=7.5→8
    expect(s.next_review_at).toBe(daysLater(8));
  });

  it('correct_streak 증가, total_correct 증가', () => {
    const s = applyGrade(makeState({ correct_streak: 2, total_reviews: 2, total_correct: 2 }), 'good', NOW);
    expect(s.correct_streak).toBe(3);
    expect(s.total_reviews).toBe(3);
    expect(s.total_correct).toBe(3);
  });
});

describe('applyGrade — easy', () => {
  it('rep 1 → 7일, ease +0.15', () => {
    const s = applyGrade(makeState(), 'easy', NOW);
    expect(s.interval_days).toBe(7);
    expect(s.ease_factor).toBeCloseTo(2.65, 5);
    expect(s.next_review_at).toBe(daysLater(7));
  });

  it('rep 2+ → round(interval × ease × 1.3)', () => {
    const s = applyGrade(
      makeState({ repetitions: 2, interval_days: 3, ease_factor: 2.5, status: 'review' }),
      'easy',
      NOW,
    );
    expect(s.interval_days).toBe(10); // round(3*2.5*1.3)=9.75→10
  });
});

describe('status 전이', () => {
  it('new → learning (첫 평가)', () => {
    expect(applyGrade(makeState(), 'good', NOW).status).toBe('learning');
  });

  it('reps ≥ 2 → review', () => {
    const s = applyGrade(makeState({ repetitions: 1, interval_days: 1, status: 'learning' }), 'good', NOW);
    expect(s.status).toBe('review');
  });

  it('reps≥4 && ease≥2.5 && streak≥4 → mastered', () => {
    const s = applyGrade(
      makeState({ repetitions: 3, interval_days: 8, ease_factor: 2.5, correct_streak: 3, status: 'review' }),
      'good',
      NOW,
    );
    expect(s.status).toBe('mastered');
  });

  it('ease 미달이면 mastered 안 됨', () => {
    const s = applyGrade(
      makeState({ repetitions: 3, interval_days: 8, ease_factor: 2.2, correct_streak: 3, status: 'review' }),
      'good',
      NOW,
    );
    expect(s.status).toBe('review');
  });

  it('easy 경로로도 mastered 도달 (ease 상승 경유)', () => {
    // ease 2.4에서 easy → 2.55 ≥ 2.5, reps 4, streak 4 충족
    const s = applyGrade(
      makeState({ repetitions: 3, interval_days: 8, ease_factor: 2.4, correct_streak: 3, status: 'review' }),
      'easy',
      NOW,
    );
    expect(s.ease_factor).toBeCloseTo(2.55, 5);
    expect(s.status).toBe('mastered');
  });

  it('mastered 후 again → learning으로 강등', () => {
    const s = applyGrade(
      makeState({ repetitions: 5, interval_days: 30, ease_factor: 2.6, correct_streak: 5, status: 'mastered' }),
      'again',
      NOW,
    );
    expect(s.status).toBe('learning');
  });
});

describe('previewIntervals — 평가 버튼 표시용', () => {
  it('신규 카드: again <10분 / hard 1일 / good 1일 / easy 7일', () => {
    const p = previewIntervals(makeState());
    expect(p.again).toBe('<10분');
    expect(p.hard).toBe('1일');
    expect(p.good).toBe('1일');
    expect(p.easy).toBe('7일');
  });

  it('review 카드(interval 3, ease 2.5): good 8일', () => {
    const p = previewIntervals(makeState({ repetitions: 2, interval_days: 3, ease_factor: 2.5, status: 'review' }));
    expect(p.good).toBe('8일');
    expect(p.easy).toBe('10일');
    expect(p.hard).toBe('4일'); // round(3*1.2)=3.6→4
  });

  it('preview는 상태를 변경하지 않는다 (순수)', () => {
    const before = makeState({ repetitions: 2, interval_days: 3 });
    const snapshot = JSON.stringify(before);
    previewIntervals(before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
