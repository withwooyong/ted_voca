/**
 * 데이터 레이어 공개 API — Supabase 설정 여부에 따라 remote/local로 분기.
 * 화면 코드는 반드시 이 모듈만 import한다 (auth-store 패턴 준용, plan §1.2.3).
 */
import type {
  BoosterItem,
  DialogueTurnLike,
  GrammarQuestionLike,
  GrammarTopicLike,
  ListeningClipLike,
  ListeningQuestionLike,
  SpeakingScenarioLike,
  SrsGrade,
} from '@ted-voca/shared';

import { getSupabase } from '@/lib/supabase';
import * as local from './local';
import * as remote from './remote';
import type {
  AttemptInput,
  DueCard,
  LeagueSummary,
  LevelTestSave,
  ListeningAttemptInput,
  ProfileProgress,
  PushTokenInput,
  SessionInput,
  SpeakFeedbackInput,
  SpeakFeedbackResult,
  StatsOverview,
  TodaySummary,
  UserWordRow,
  Word,
} from './types';

export type * from './types';

export function getWords(): Promise<Word[]> {
  const sb = getSupabase();
  return sb ? remote.getWords(sb) : local.getWords();
}

export function getUserWordMap(): Promise<Record<string, UserWordRow>> {
  const sb = getSupabase();
  return sb ? remote.getUserWordMap(sb) : local.getUserWordMap();
}

export function getDueWords(now: Date): Promise<DueCard[]> {
  const sb = getSupabase();
  return sb ? remote.getDueWords(sb, now) : local.getDueWords(now);
}

export function recordAttempt(input: AttemptInput): Promise<void> {
  const sb = getSupabase();
  return sb ? remote.recordAttempt(sb, input) : local.recordAttempt(input);
}

export function saveReview(wordId: string, grade: SrsGrade, now: Date): Promise<UserWordRow> {
  const sb = getSupabase();
  return sb ? remote.saveReview(sb, wordId, grade, now) : local.saveReview(wordId, grade, now);
}

export function getRecentResults(limit: number): Promise<boolean[]> {
  const sb = getSupabase();
  return sb ? remote.getRecentResults(sb, limit) : local.getRecentResults(limit);
}

export function completeSession(input: SessionInput): Promise<ProfileProgress> {
  const sb = getSupabase();
  return sb ? remote.completeSession(sb, input) : local.completeSession(input);
}

export function getLocalProfileProgress(): Promise<ProfileProgress> {
  const sb = getSupabase();
  return sb ? remote.getLocalProfileProgress(sb) : local.getLocalProfileProgress();
}

export function saveLevelTestResult(input: LevelTestSave): Promise<ProfileProgress> {
  const sb = getSupabase();
  return sb ? remote.saveLevelTestResult(sb, input) : local.saveLevelTestResult(input);
}

export function getTodaySummary(now: Date): Promise<TodaySummary> {
  const sb = getSupabase();
  return sb ? remote.getTodaySummary(sb, now) : local.getTodaySummary(now);
}

export function getStatsOverview(now: Date): Promise<StatsOverview> {
  const sb = getSupabase();
  return sb ? remote.getStatsOverview(sb, now) : local.getStatsOverview(now);
}

// ── 문법 (P3) ──────────────────────────────────────────────

export function getGrammarTopics(): Promise<GrammarTopicLike[]> {
  const sb = getSupabase();
  return sb ? remote.getGrammarTopics(sb) : local.getGrammarTopics();
}

export function getGrammarQuestions(topicSlug?: string): Promise<GrammarQuestionLike[]> {
  const sb = getSupabase();
  return sb ? remote.getGrammarQuestions(sb, topicSlug) : local.getGrammarQuestions(topicSlug);
}

export function recordGrammarAttempt(input: {
  questionId: string;
  correct: boolean;
  now: Date;
  userAnswer?: string;
}): Promise<void> {
  const sb = getSupabase();
  return sb ? remote.recordGrammarAttempt(sb, input) : local.recordGrammarAttempt(input);
}

// ── 리스닝 (P4) ────────────────────────────────────────────

export function getListeningClips(): Promise<ListeningClipLike[]> {
  const sb = getSupabase();
  return sb ? remote.getListeningClips(sb) : local.getListeningClips();
}

export function getListeningQuestions(clipSlug?: string): Promise<ListeningQuestionLike[]> {
  const sb = getSupabase();
  return sb ? remote.getListeningQuestions(sb, clipSlug) : local.getListeningQuestions(clipSlug);
}

export function recordListeningAttempt(input: ListeningAttemptInput): Promise<void> {
  const sb = getSupabase();
  return sb ? remote.recordListeningAttempt(sb, input) : local.recordListeningAttempt(input);
}

export function getBoosterItems(now: Date): Promise<BoosterItem[]> {
  const sb = getSupabase();
  return sb ? remote.getBoosterItems(sb, now) : local.getBoosterItems(now);
}

// ── 스피킹 (P5) ────────────────────────────────────────────

export function getSpeakingScenarios(): Promise<SpeakingScenarioLike[]> {
  const sb = getSupabase();
  return sb ? remote.getSpeakingScenarios(sb) : local.getSpeakingScenarios();
}

export function getDialogueTurns(scenarioSlug: string): Promise<DialogueTurnLike[]> {
  const sb = getSupabase();
  return sb ? remote.getDialogueTurns(sb, scenarioSlug) : local.getDialogueTurns(scenarioSlug);
}

export function getSpeakingRemaining(now: Date): Promise<number> {
  const sb = getSupabase();
  return sb ? remote.getSpeakingRemaining(sb, now) : local.getSpeakingRemaining(now);
}

export function requestSpeakFeedback(input: SpeakFeedbackInput): Promise<SpeakFeedbackResult> {
  const sb = getSupabase();
  return sb ? remote.requestSpeakFeedback(sb, input) : local.requestSpeakFeedback(input);
}

// ── 리그 (P6) ──────────────────────────────────────────────

export function getLeagueSummary(now: Date): Promise<LeagueSummary> {
  const sb = getSupabase();
  return sb ? remote.getLeagueSummary(sb, now) : local.getLeagueSummary(now);
}

export function addLeagueXp(xpDelta: number, now: Date): Promise<void> {
  const sb = getSupabase();
  return sb ? remote.addLeagueXp(sb, xpDelta, now) : local.addLeagueXp(xpDelta, now);
}

export function savePushToken(input: PushTokenInput): Promise<void> {
  const sb = getSupabase();
  return sb ? remote.savePushToken(sb, input) : local.savePushToken(input);
}
