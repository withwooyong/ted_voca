// SM-2 spaced repetition — plan: docs/plans/p1-p2-vocab-srs.md §5
// Anki-compatible fields: ease_factor / interval_days / repetitions

export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

export type SrsStatus = 'new' | 'learning' | 'review' | 'mastered';

export type SrsState = {
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review_at: string; // ISO
  correct_streak: number;
  total_reviews: number;
  total_correct: number;
  status: SrsStatus;
};

export const SRS_MIN_EASE = 1.3;
export const SRS_AGAIN_DELAY_MINUTES = 10;

export function initialSrsState(now: Date): SrsState {
  return {
    ease_factor: 2.5,
    interval_days: 0,
    repetitions: 0,
    next_review_at: now.toISOString(),
    correct_streak: 0,
    total_reviews: 0,
    total_correct: 0,
    status: 'new',
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatInterval(grade: SrsGrade, state: SrsState): string {
  if (grade === 'again') return '<10분';
  const next = applyGrade(state, grade, new Date(0));
  return `${next.interval_days}일`;
}

/** 평가 버튼에 표시할 다음 복습 간격 미리보기 (프로토타입: 투명성 차별점) */
export function previewIntervals(state: SrsState): Record<SrsGrade, string> {
  return {
    again: formatInterval('again', state),
    hard: formatInterval('hard', state),
    good: formatInterval('good', state),
    easy: formatInterval('easy', state),
  };
}

export function applyGrade(state: SrsState, grade: SrsGrade, now: Date): SrsState {
  const next: SrsState = { ...state };
  next.total_reviews = state.total_reviews + 1;

  if (grade === 'again') {
    next.repetitions = 0;
    next.interval_days = 0;
    next.correct_streak = 0;
    next.ease_factor = Math.max(SRS_MIN_EASE, state.ease_factor - 0.2);
    next.next_review_at = new Date(now.getTime() + SRS_AGAIN_DELAY_MINUTES * 60 * 1000).toISOString();
    next.status = 'learning';
    return next;
  }

  // pass 취급 (hard/good/easy)
  next.total_correct = state.total_correct + 1;
  next.correct_streak = state.correct_streak + 1;
  next.repetitions = state.repetitions + 1;

  let interval: number;
  let ease = state.ease_factor;

  if (grade === 'hard') {
    interval = state.interval_days > 0 ? Math.max(1, Math.round(state.interval_days * 1.2)) : 1;
    ease = Math.max(SRS_MIN_EASE, state.ease_factor - 0.15);
  } else if (grade === 'good') {
    if (next.repetitions === 1) interval = 1;
    else if (next.repetitions === 2) interval = 3;
    else interval = Math.round(state.interval_days * state.ease_factor);
    // good은 ease 불변
  } else {
    // easy
    if (next.repetitions === 1) interval = 7;
    else interval = Math.round(state.interval_days * state.ease_factor * 1.3);
    ease = state.ease_factor + 0.15;
  }

  next.interval_days = interval;
  next.ease_factor = ease;
  next.next_review_at = new Date(now.getTime() + interval * MS_PER_DAY).toISOString();

  // status 전이
  if (next.repetitions >= 4 && next.ease_factor >= 2.5 && next.correct_streak >= 4) {
    next.status = 'mastered';
  } else if (next.repetitions >= 2) {
    next.status = 'review';
  } else {
    next.status = 'learning';
  }

  return next;
}
