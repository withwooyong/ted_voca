// Local(mock) 모드 저장소 — Supabase 미설정 시 AsyncStorage 기반.
// auth-store의 Dev Mock 패턴과 동일한 철학: 단일 로컬 사용자.
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  applyGrade,
  buildBoosterQueue,
  daysUntilWeekEnd,
  initialSrsState,
  LEAGUE_MAX_XP_PER_SESSION,
  levelFromXp,
  localFeedback,
  nextStreak,
  SPEAKING_DAILY_LIMIT,
  SPEAKING_MAX_UTTERANCE_CHARS,
  toDateKey,
  turnsForScenario,
  weekStartKey,
  XP_LEVEL_TEST,
  type BoosterItem,
  type DialogueTurnLike,
  type GrammarQuestionLike,
  type GrammarTopicLike,
  type LeagueTier,
  type ListeningClipLike,
  type ListeningQuestionLike,
  type SpeakingScenarioLike,
  type SrsGrade,
} from '@ted-voca/shared';

import { getBundledWords, type Word } from '@/lib/content/word-pack';
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
} from './types';

const KEY_USER_WORDS = 'tv_user_words';
const KEY_ATTEMPTS = 'tv_attempts';
const KEY_SESSIONS = 'tv_sessions';
const KEY_PROGRESS = 'tv_progress';
const KEY_SPEAKING_USAGE = 'tv_speaking_usage';
const KEY_SPEAKING_ATTEMPTS = 'tv_speaking_attempts';
const KEY_LEAGUE = 'tv_league';
const KEY_PUSH_TOKEN = 'tv_push_token';

const MAX_ATTEMPTS_KEPT = 1000;
const MAX_SESSIONS_KEPT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

type StoredAttempt = {
  /** 어휘 attempt — 문법/리스닝 attempt는 word_id 없이 *_question_id 사용 */
  word_id?: string;
  grammar_question_id?: string;
  listening_question_id?: string;
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

  // ── 리그 XP 연동 (best-effort) ──
  if (input.xpEarned > 0) {
    try {
      await addLeagueXp(input.xpEarned, input.now);
    } catch {
      // 리그 적립 실패는 세션 결과에 영향 없음 (best-effort)
    }
  }

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

// ── 리스닝 (P4) ────────────────────────────────────────────

// listening-pack은 lazy require — JSON 부재가 모듈 평가 시점에 영향 주지 않도록 (grammar 패턴 동일)
export async function getListeningClips(): Promise<ListeningClipLike[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 의도된 lazy 로드 (모듈 평가 시점 JSON 의존 제거)
  const { getBundledListeningClips } = require('@/lib/content/listening-pack') as typeof import('@/lib/content/listening-pack');
  return getBundledListeningClips();
}

export async function getListeningQuestions(clipSlug?: string): Promise<ListeningQuestionLike[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 의도된 lazy 로드 (모듈 평가 시점 JSON 의존 제거)
  const { getBundledListeningQuestions } = require('@/lib/content/listening-pack') as typeof import('@/lib/content/listening-pack');
  const all = getBundledListeningQuestions();
  return clipSlug ? all.filter((q) => q.clip_slug === clipSlug) : all;
}

export async function recordListeningAttempt(input: ListeningAttemptInput): Promise<void> {
  const attempts = await readJson<StoredAttempt[]>(KEY_ATTEMPTS, []);
  attempts.push({
    listening_question_id: input.questionId,
    quiz_type: 'listening',
    is_correct: input.correct,
    created_at: input.now.toISOString(),
  });
  await writeJson(KEY_ATTEMPTS, attempts.slice(-MAX_ATTEMPTS_KEPT));
}

export async function getBoosterItems(now: Date): Promise<BoosterItem[]> {
  const [attempts, words] = await Promise.all([
    readJson<StoredAttempt[]>(KEY_ATTEMPTS, []),
    getWords(),
  ]);
  return buildBoosterQueue(attempts, words, now);
}

// ── 스피킹 (P5) ────────────────────────────────────────────

const MAX_SPEAKING_ATTEMPTS_KEPT = 500;

type SpeakingUsage = { date: string; count: number };

type StoredSpeakingAttempt = {
  scenario_slug: string;
  turn_order: number;
  user_text: string;
  feedback: ReturnType<typeof localFeedback>;
  created_at: string;
};

// speaking-pack은 lazy require — JSON 부재가 모듈 평가 시점에 영향 주지 않도록 (listening 패턴 동일)
export async function getSpeakingScenarios(): Promise<SpeakingScenarioLike[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 의도된 lazy 로드 (모듈 평가 시점 JSON 의존 제거)
  const { getBundledSpeakingScenarios } = require('@/lib/content/speaking-pack') as typeof import('@/lib/content/speaking-pack');
  return getBundledSpeakingScenarios()
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function getDialogueTurns(scenarioSlug: string): Promise<DialogueTurnLike[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- 의도된 lazy 로드 (모듈 평가 시점 JSON 의존 제거)
  const { getBundledDialogueTurns } = require('@/lib/content/speaking-pack') as typeof import('@/lib/content/speaking-pack');
  return turnsForScenario(getBundledDialogueTurns(), scenarioSlug);
}

async function readSpeakingUsage(now: Date): Promise<SpeakingUsage> {
  const today = toDateKey(now);
  const usage = await readJson<SpeakingUsage>(KEY_SPEAKING_USAGE, { date: today, count: 0 });
  // 날짜가 바뀌었으면 리셋
  return usage.date === today ? usage : { date: today, count: 0 };
}

export async function getSpeakingRemaining(now: Date): Promise<number> {
  const usage = await readSpeakingUsage(now);
  return Math.max(0, SPEAKING_DAILY_LIMIT - usage.count);
}

export async function requestSpeakFeedback(input: SpeakFeedbackInput): Promise<SpeakFeedbackResult> {
  // 길이 검사 먼저
  if (input.userText.length > SPEAKING_MAX_UTTERANCE_CHARS) {
    throw new Error('utterance_too_long');
  }

  const usage = await readSpeakingUsage(input.now);
  if (usage.count >= SPEAKING_DAILY_LIMIT) {
    return { error: 'daily_limit', remainingToday: 0 };
  }

  // 사용량 증가
  const nextUsage: SpeakingUsage = { date: usage.date, count: usage.count + 1 };
  await writeJson(KEY_SPEAKING_USAGE, nextUsage);

  const feedback = localFeedback(input.expectedText, input.userText);

  const attempts = await readJson<StoredSpeakingAttempt[]>(KEY_SPEAKING_ATTEMPTS, []);
  attempts.push({
    scenario_slug: input.scenarioSlug,
    turn_order: input.turnOrder,
    user_text: input.userText,
    feedback,
    created_at: input.now.toISOString(),
  });
  await writeJson(KEY_SPEAKING_ATTEMPTS, attempts.slice(-MAX_SPEAKING_ATTEMPTS_KEPT));

  return { feedback, remainingToday: SPEAKING_DAILY_LIMIT - nextUsage.count };
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

// ── 리그 (P6) ──────────────────────────────────────────────

type StoredLeague = { weekStart: string; xp: number; tier: LeagueTier };

function defaultLeague(now: Date): StoredLeague {
  return { weekStart: weekStartKey(now), xp: 0, tier: 'bronze' };
}

async function readLeague(now: Date): Promise<StoredLeague> {
  return readJson<StoredLeague>(KEY_LEAGUE, defaultLeague(now));
}

export async function addLeagueXp(delta: number, now: Date): Promise<void> {
  const week = weekStartKey(now);
  const stored = await readLeague(now);
  // 주가 바뀌었으면 새 주 시작(xp 리셋, tier 유지)
  const base: StoredLeague =
    stored.weekStart === week ? stored : { weekStart: week, xp: 0, tier: stored.tier };
  const clamped = Math.max(0, Math.min(delta, LEAGUE_MAX_XP_PER_SESSION));
  await writeJson(KEY_LEAGUE, { ...base, xp: base.xp + clamped });
}

export async function getLeagueSummary(now: Date): Promise<LeagueSummary> {
  const week = weekStartKey(now);
  const stored = await readLeague(now);
  // weekStart 불일치면 이번 주 xp는 0 취급
  const xp = stored.weekStart === week ? stored.xp : 0;
  const tier = stored.tier;
  return {
    weekStart: week,
    tier,
    groupNo: 0, // Dev Mock 단일 유저 → 항상 그룹 0
    myRank: 1,
    myXp: xp,
    daysLeft: daysUntilWeekEnd(now),
    board: [{ user_id: 'me', display_name: '나', xp, tier, rank: 1 }],
  };
}

export async function savePushToken(input: PushTokenInput): Promise<void> {
  await writeJson(KEY_PUSH_TOKEN, input);
}
