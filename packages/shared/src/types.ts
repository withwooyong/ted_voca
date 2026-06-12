export type LearningGoal = 'exam' | 'conversation' | 'business';

export type UserProfile = {
  id: string;
  display_name: string | null;
  goal: LearningGoal;
  daily_goal_minutes: 5 | 10 | 20;
  onboarding_complete: boolean;
  xp: number;
  streak: number;
  level: number;
};

export type AuthSession = {
  user: { id: string; email: string };
};

export const GOAL_OPTIONS: { value: LearningGoal; label: string; emoji: string }[] = [
  { value: 'exam', label: '시험 (토익/수능)', emoji: '📚' },
  { value: 'conversation', label: '일상 회화', emoji: '💬' },
  { value: 'business', label: '비즈니스', emoji: '💼' },
];

export const DAILY_GOAL_OPTIONS: { value: 5 | 10 | 20; label: string }[] = [
  { value: 5, label: '5분' },
  { value: 10, label: '10분' },
  { value: 20, label: '20분' },
];

export const APP_NAME = 'Ted Voca';
