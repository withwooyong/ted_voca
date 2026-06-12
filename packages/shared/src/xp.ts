// XP 정책 — plan: docs/plans/p1-p2-vocab-srs.md §6

import type { SrsGrade } from './srs';

export const XP_PER_QUIZ_CORRECT = 3;
export const XP_PER_REVIEW_CARD = 5; // again 제외
export const XP_SESSION_BONUS = 10;
export const XP_LEVEL_TEST = 20;

export function xpForQuizSession(correctCount: number): number {
  return correctCount * XP_PER_QUIZ_CORRECT + XP_SESSION_BONUS;
}

export function xpForReviewGrade(grade: SrsGrade): number {
  return grade === 'again' ? 0 : XP_PER_REVIEW_CARD;
}

export function xpForReviewSession(grades: SrsGrade[]): number {
  if (grades.length === 0) return 0;
  return grades.reduce((sum, g) => sum + xpForReviewGrade(g), 0) + XP_SESSION_BONUS;
}

/** level = floor(sqrt(xp/100)) + 1 */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}
