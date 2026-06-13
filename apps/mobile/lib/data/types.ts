import type { SpeakFeedback, SrsGrade, SrsState } from '@ted-voca/shared';

import type { Word } from '@/lib/content/word-pack';

export type { Word };

export type UserWordRow = SrsState & {
  word_id: string;
};

export type DueCard = {
  word: Word;
  state: UserWordRow;
};

export type AttemptInput = {
  wordId: string;
  quizType: 'blank' | 'multiple_choice' | 'spelling' | 'translation_en_ko' | 'translation_ko_en';
  correct: boolean;
  now: Date;
  responseMs?: number;
  userAnswer?: string;
};

export type SessionInput = {
  module: 'vocab' | 'grammar' | 'listening' | 'speaking' | 'review' | 'level_test';
  itemsCompleted: number;
  itemsCorrect: number;
  xpEarned: number;
  now: Date;
  durationSeconds?: number;
};

export type ProfileProgress = {
  xp: number;
  level: number;
  streak: number;
  last_study_date: string | null;
  user_level: string;
  weak_tags: string[];
  level_test_done: boolean;
};

export type TodaySummary = {
  dueCount: number;
  attemptsToday: number;
  correctToday: number;
  xpToday: number;
};

export type StatsOverview = {
  accuracy7d: number; // 0~1, 표본 없으면 0
  learnedCount: number;
  masteredCount: number;
  /** 최근 7일(과거→오늘) 학습 분 */
  weeklyMinutes: number[];
  weeklyDayLabels: string[];
  topWrongWords: { word: Word; wrongCount: number }[];
  dueToday: number;
  dueTomorrow: number;
  dueWeek: number;
};

export type LevelTestSave = {
  cefr: string;
  weakTags: string[];
  now: Date;
};

export type ListeningAttemptInput = {
  questionId: string;
  correct: boolean;
  now: Date;
  userAnswer?: string;
};

export type ReviewGrade = SrsGrade;

// ── 스피킹 (P5) ────────────────────────────────────────────

export type SpeakFeedbackInput = {
  scenarioSlug: string;
  turnOrder: number;
  userText: string;
  expectedText: string;
  now: Date;
};

export type SpeakFeedbackResult =
  | { feedback: SpeakFeedback; remainingToday: number }
  | { error: 'daily_limit'; remainingToday: 0 };
