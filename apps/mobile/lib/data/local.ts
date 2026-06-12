// Local(mock) 모드 저장소 — Supabase 미설정 시 AsyncStorage 기반.
// auth-store의 Dev Mock 패턴과 동일한 철학: 단일 로컬 사용자.
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyGrade,
  initialSrsState,
  levelFromXp,
  nextStreak,
  toDateKey,
  XP_LEVEL_TEST,
  type GrammarQuestionLike,
  type GrammarTopicLike,
  type SrsGrade,
} from '@ted-voca/shared';

import { getBundledWords, type Word } from '@/lib/content/word-pack';
import type {
  AttemptInput,
  DueCard,
  LevelTestSave,
  ProfileProgress,
  SessionInput,
  StatsOverview,
  TodaySummary,
  UserWordRow,
} from './types';

const KEY_USER_WORDS = 'tv_user_words';
const KEY_ATTEMPTS = 'tv_attempts';
const KEY_SESSIONS = 'tv_sessions';
const KEY_PROGRESS = 'tv_progress';

const MAX_ATTEMPTS_KEPT = 1000;
const MAX_SESSIONS_KEPT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

type StoredAttempt = {
  /** 어휘 attempt — 문법 attempt는 word_id 없이 grammar_question_id 사용 */
  word_id?: string;
  grammar_question_id?: string;
  quiz_type: string;
  is_correct: boolean;
  created_at: string;
};

type StoredSession = {
  module: string;
  items_completed: number;
  items_correct: number;
  xp_earned: number;
  duration_seconds: number;
  started_at: string;
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function defaultProgress(): ProfileProgress {
  return {
    xp: 0,
    level: 1,
    streak: 0,
    last_study_date: null,
    user_level: 'A2',
    weak_tags: [],
    level_test_done: false,
  };
}

async function readProgress(): Promise<ProfileProgress> {
  const p = await readJson(KEY_PROGRESS, defaultProgress());
  return { ...p, level: levelFromXp(p.xp) };
}

export async function getWords(): Promise<Word[]> {
  return getBundledWords();
}

export async function getUserWordMap(): Promise<Record<string, UserWordRow>> {
  return readJson<Record<string, UserWordRow>>(KEY_USER_WORDS, {});
}

export async function getDueWords(now: Date): Promise<DueCard[]> {
  const [map, words] = await Promise.all([getUserWordMap(), getWords()]);
  const byId = new Map(words.map((w) => [w.id, w]));
  return Object.values(map)
    .filter((s) => new Date(s.next_review_at).getTime() <= now.getTime())
    .sort((a, b) => a.next_review_at.localeCompare(b.next_review_at))
    .flatMap((state) => {
      const word = byId.get(state.word_id);
      return word ? [{ word, state }] : [];
    });
}

export async function recordAttempt(input: AttemptInput): Promise<void> {
  const { wordId, quizType, correct, now } = input;

  const attempts = await readJson<StoredAttempt[]>(KEY_ATTEMPTS, []);
  attempts.push({
    word_id: wordId,
    quiz_type: quizType,
    is_correct: correct,
    created_at: now.toISOString(),
  });
  await writeJson(KEY_ATTEMPTS, attempts.slice(-MAX_ATTEMPTS_KEPT));

  const map = await getUserWordMap();
  const existing = map[wordId];
  if (existing) {
    if (!correct) {
      // 오답 → 즉시 복습 큐로 (기존 스케줄보다 당겨질 때만)
      const due = Math.min(new Date(existing.next_review_at).getTime(), now.getTime());
      map[wordId] = {
        ...existing,
        next_review_at: new Date(due).toISOString(),
        correct_streak: 0,
        status: existing.status === 'mastered' ? 'review' : existing.status,
      };
    }
    // 정답이면 기존 스케줄 유지 (퀴즈 정답은 SRS 평가가 아님)
  } else {
    const init = { ...initialSrsState(now), word_id: wordId };
    map[wordId] = correct
      ? { ...init, status: 'learning', next_review_at: new Date(now.getTime() + DAY_MS).toISOString() }
      : { ...init, status: 'learning', next_review_at: now.toISOString() };
  }
  await writeJson(KEY_USER_WORDS, map);
}

export async function saveReview(wordId: string, grade: SrsGrade, now: Date): Promise<UserWordRow> {
  const map = await getUserWordMap();
  const current = map[wordId] ?? { ...initialSrsState(now), word_id: wordId };
  const next = { ...applyGrade(current, grade, now), word_id: wordId };
  map[wordId] = next;
  await writeJson(KEY_USER_WORDS, map);
  return next;
}

export async function getRecentResults(limit: number): Promise<boolean[]> {
  const attempts = await readJson<StoredAttempt[]>(KEY_ATTEMPTS, []);
  return attempts
    .filter((a) => !!a.word_id) // 어휘 난이도 조절 입력 — 문법 attempt 제외
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit)
    .map((a) => a.is_correct);
}

export async function completeSession(input: SessionInput): Promise<ProfileProgress> {
  const sessions = await readJson<StoredSession[]>(KEY_SESSIONS, []);
  sessions.push({
    module: input.module,
    items_completed: input.itemsCompleted,
    items_correct: input.itemsCorrect,
    xp_earned: input.xpEarned,
    duration_seconds: input.durationSeconds ?? 0,
    started_at: input.now.toISOString(),
  });
  await writeJson(KEY_SESSIONS, sessions.slice(-MAX_SESSIONS_KEPT));

  const progress = await readProgress();
  const updated: ProfileProgress = {
    ...progress,
    xp: progress.xp + input.xpEarned,
    streak: nextStreak(progress.last_study_date, progress.streak, input.now),
    last_study_date: toDateKey(input.now),
  };
  updated.level = levelFromXp(updated.xp);
  await writeJson(KEY_PROGRESS, updated);
  return updated;
}

export async function getLocalProfileProgress(): Promise<ProfileProgress> {
  return readProgress();
}

export async function saveLevelTestResult(input: LevelTestSave): Promise<ProfileProgress> {
  const progress = await readProgress();
  const updated: ProfileProgress = {
    ...progress,
    user_level: input.cefr,
    weak_tags: input.weakTags,
    xp: progress.xp + (progress.level_test_done ? 0 : XP_LEVEL_TEST),
    level_test_done: true,
  };
  updated.level = levelFromXp(updated.xp);
  await writeJson(KEY_PROGRESS, updated);
  return updated;
}

// ── 문법 (P3) ──────────────────────────────────────────────

// grammar-pack은 lazy require — 어휘 전용 테스트/화면이 문법 번들 부재에 영향받지 않도록
export async function getGrammarTopics(): Promise<GrammarTopicLike[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 의도된 lazy 로드 (모듈 평가 시점 JSON 의존 제거)
  const { getBundledGrammarTopics } = require('@/lib/content/grammar-pack') as typeof import('@/lib/content/grammar-pack');
  return getBundledGrammarTopics();
}

export async function getGrammarQuestions(topicSlug?: string): Promise<GrammarQuestionLike[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 의도된 lazy 로드 (모듈 평가 시점 JSON 의존 제거)
  const { getBundledGrammarQuestions } = require('@/lib/content/grammar-pack') as typeof import('@/lib/content/grammar-pack');
  const all = getBundledGrammarQuestions();
  return topicSlug ? all.filter((q) => q.topic_slug === topicSlug) : all;
}

export async function recordGrammarAttempt(input: {
  questionId: string;
  correct: boolean;
  now: Date;
  userAnswer?: string;
}): Promise<void> {
  const attempts = await readJson<StoredAttempt[]>(KEY_ATTEMPTS, []);
  attempts.push({
    grammar_question_id: input.questionId,
    quiz_type: 'grammar',
    is_correct: input.correct,
    created_at: input.now.toISOString(),
  });
  await writeJson(KEY_ATTEMPTS, attempts.slice(-MAX_ATTEMPTS_KEPT));
}

export async function getTodaySummary(now: Date): Promise<TodaySummary> {
  const today = toDateKey(now);
  const [due, attempts, sessions] = await Promise.all([
    getDueWords(now),
    readJson<StoredAttempt[]>(KEY_ATTEMPTS, []),
    readJson<StoredSession[]>(KEY_SESSIONS, []),
  ]);
  const todayAttempts = attempts.filter((a) => toDateKey(new Date(a.created_at)) === today);
  return {
    dueCount: due.length,
    attemptsToday: todayAttempts.length,
    correctToday: todayAttempts.filter((a) => a.is_correct).length,
    xpToday: sessions
      .filter((s) => toDateKey(new Date(s.started_at)) === today)
      .reduce((sum, s) => sum + s.xp_earned, 0),
  };
}

export async function getStatsOverview(now: Date): Promise<StatsOverview> {
  const [map, words, attempts, sessions] = await Promise.all([
    getUserWordMap(),
    getWords(),
    readJson<StoredAttempt[]>(KEY_ATTEMPTS, []),
    readJson<StoredSession[]>(KEY_SESSIONS, []),
  ]);
  const byId = new Map(words.map((w) => [w.id, w]));
  const weekAgo = now.getTime() - 7 * DAY_MS;

  const recent = attempts.filter((a) => new Date(a.created_at).getTime() >= weekAgo);
  const accuracy7d = recent.length === 0 ? 0 : recent.filter((a) => a.is_correct).length / recent.length;

  const states = Object.values(map);
  const wrongCounts = new Map<string, number>();
  for (const a of attempts) {
    if (!a.is_correct && a.word_id) wrongCounts.set(a.word_id, (wrongCounts.get(a.word_id) ?? 0) + 1);
  }
  const topWrongWords = [...wrongCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .flatMap(([id, count]) => {
      const word = byId.get(id);
      return word ? [{ word, wrongCount: count }] : [];
    });

  const weeklyMinutes: number[] = [];
  const weeklyDayLabels: string[] = [];
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY_MS);
    const key = toDateKey(day);
    const secs = sessions
      .filter((s) => toDateKey(new Date(s.started_at)) === key)
      .reduce((sum, s) => sum + s.duration_seconds, 0);
    weeklyMinutes.push(Math.round(secs / 60));
    weeklyDayLabels.push(dayNames[day.getDay()]);
  }

  const dueBy = (until: number) =>
    states.filter((s) => new Date(s.next_review_at).getTime() <= until).length;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  return {
    accuracy7d,
    learnedCount: states.length,
    masteredCount: states.filter((s) => s.status === 'mastered').length,
    weeklyMinutes,
    weeklyDayLabels,
    topWrongWords,
    dueToday: dueBy(endOfToday.getTime()),
    dueTomorrow: dueBy(endOfToday.getTime() + DAY_MS) - dueBy(endOfToday.getTime()),
    dueWeek: dueBy(endOfToday.getTime() + 7 * DAY_MS),
  };
}
