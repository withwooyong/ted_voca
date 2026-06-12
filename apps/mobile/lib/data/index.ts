/**
 * 데이터 레이어 공개 API — Supabase 설정 여부에 따라 remote/local로 분기.
 * 화면 코드는 반드시 이 모듈만 import한다 (auth-store 패턴 준용, plan §1.2.3).
 */
import type { SrsGrade } from '@ted-voca/shared';

import { getSupabase } from '@/lib/supabase';
import * as local from './local';
import * as remote from './remote';
import type {
  AttemptInput,
  DueCard,
  LevelTestSave,
  ProfileProgress,
  SessionInput,
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
