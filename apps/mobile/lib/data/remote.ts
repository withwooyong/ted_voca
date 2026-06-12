// Supabase 모드 저장소 — RLS(own-row) 전제. local.ts와 동일 계약.
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  applyGrade,
  initialSrsState,
  levelFromXp,
  nextStreak,
  toDateKey,
  XP_LEVEL_TEST,
  type GrammarQuestionLike,
  type GrammarQuestionType,
  type GrammarTopicLike,
  type SrsGrade,
} from '@ted-voca/shared';

import { COURSE_SLUG, type Word } from '@/lib/content/word-pack';
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

const DAY_MS = 24 * 60 * 60 * 1000;

type WordRow = {
  id: string;
  lemma: string;
  pos: string;
  meaning_ko: string;
  example_en: string | null;
  example_ko: string | null;
  difficulty: number;
  tags: string[] | null;
  sort_order: number;
};

function toWord(r: WordRow): Word {
  return { ...r, tags: r.tags ?? [], example_en: r.example_en };
}

async function getUserId(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) throw new Error('로그인이 필요합니다');
  return data.user.id;
}

let courseIdCache: string | null = null;

async function getCourseId(sb: SupabaseClient): Promise<string> {
  if (courseIdCache) return courseIdCache;
  const { data, error } = await sb.from('courses').select('id').eq('slug', COURSE_SLUG).single();
  if (error || !data) throw new Error(`코스를 찾을 수 없습니다: ${COURSE_SLUG}`);
  courseIdCache = data.id as string;
  return courseIdCache;
}

let wordsCache: Word[] | null = null;

export async function getWords(sb: SupabaseClient): Promise<Word[]> {
  if (wordsCache) return wordsCache;
  const courseId = await getCourseId(sb);
  const { data, error } = await sb
    .from('words')
    .select('id, lemma, pos, meaning_ko, example_en, example_ko, difficulty, tags, sort_order')
    .eq('course_id', courseId)
    .order('sort_order');
  if (error) throw error;
  wordsCache = (data as WordRow[]).map(toWord);
  return wordsCache;
}

export async function getUserWordMap(sb: SupabaseClient): Promise<Record<string, UserWordRow>> {
  const userId = await getUserId(sb);
  const { data, error } = await sb.from('user_words').select('*').eq('user_id', userId);
  if (error) throw error;
  const map: Record<string, UserWordRow> = {};
  for (const row of data) map[row.word_id] = row as UserWordRow;
  return map;
}

export async function getDueWords(sb: SupabaseClient, now: Date): Promise<DueCard[]> {
  const userId = await getUserId(sb);
  const { data, error } = await sb
    .from('user_words')
    .select('*, words(*)')
    .eq('user_id', userId)
    .lte('next_review_at', now.toISOString())
    .order('next_review_at');
  if (error) throw error;
  return (data as (UserWordRow & { words: WordRow | null })[]).flatMap((row) => {
    if (!row.words) return [];
    const { words: w, ...state } = row;
    return [{ word: toWord(w), state }];
  });
}

async function upsertUserWord(sb: SupabaseClient, userId: string, state: UserWordRow): Promise<void> {
  const { error } = await sb
    .from('user_words')
    .upsert({ ...state, user_id: userId }, { onConflict: 'user_id,word_id' });
  if (error) throw error;
}

export async function recordAttempt(sb: SupabaseClient, input: AttemptInput): Promise<void> {
  const userId = await getUserId(sb);
  const { error } = await sb.from('quiz_attempts').insert({
    user_id: userId,
    word_id: input.wordId,
    quiz_type: input.quizType,
    is_correct: input.correct,
    response_ms: input.responseMs ?? null,
    user_answer: input.userAnswer ?? null,
  });
  if (error) throw error;

  const { data } = await sb
    .from('user_words')
    .select('*')
    .eq('user_id', userId)
    .eq('word_id', input.wordId)
    .maybeSingle();

  const now = input.now;
  if (data) {
    if (!input.correct) {
      const existing = data as UserWordRow;
      const due = Math.min(new Date(existing.next_review_at).getTime(), now.getTime());
      await upsertUserWord(sb, userId, {
        ...existing,
        next_review_at: new Date(due).toISOString(),
        correct_streak: 0,
        status: existing.status === 'mastered' ? 'review' : existing.status,
      });
    }
  } else {
    const init = { ...initialSrsState(now), word_id: input.wordId, status: 'learning' as const };
    await upsertUserWord(sb, userId, {
      ...init,
      next_review_at: input.correct ? new Date(now.getTime() + DAY_MS).toISOString() : now.toISOString(),
    });
  }
}

export async function saveReview(
  sb: SupabaseClient,
  wordId: string,
  grade: SrsGrade,
  now: Date,
): Promise<UserWordRow> {
  const userId = await getUserId(sb);
  const { data } = await sb
    .from('user_words')
    .select('*')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .maybeSingle();
  const current = (data as UserWordRow | null) ?? { ...initialSrsState(now), word_id: wordId };
  const next = { ...applyGrade(current, grade, now), word_id: wordId };
  await upsertUserWord(sb, userId, next);
  return next;
}

export async function getRecentResults(sb: SupabaseClient, limit: number): Promise<boolean[]> {
  const userId = await getUserId(sb);
  const { data, error } = await sb
    .from('quiz_attempts')
    .select('is_correct, created_at')
    .eq('user_id', userId)
    .not('word_id', 'is', null) // 어휘 난이도 조절 입력 — 문법 attempt 제외
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((r) => r.is_correct as boolean).reverse();
}

async function fetchProfile(sb: SupabaseClient, userId: string) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error || !data) throw error ?? new Error('프로필 없음');
  return data;
}

export async function completeSession(sb: SupabaseClient, input: SessionInput): Promise<ProfileProgress> {
  const userId = await getUserId(sb);
  const { error } = await sb.from('study_sessions').insert({
    user_id: userId,
    module: input.module, // migration 003: enum에 review/level_test 추가됨
    xp_earned: input.xpEarned,
    items_completed: input.itemsCompleted,
    items_correct: input.itemsCorrect,
    duration_seconds: input.durationSeconds ?? 0,
    started_at: input.now.toISOString(),
    ended_at: input.now.toISOString(),
  });
  if (error) throw error;

  const profile = await fetchProfile(sb, userId);
  const xp = (profile.xp ?? 0) + input.xpEarned;
  const streak = nextStreak(profile.last_study_date ?? null, profile.streak ?? 0, input.now);
  const updates = {
    xp,
    streak,
    level: levelFromXp(xp),
    last_study_date: toDateKey(input.now),
  };
  const { error: upErr } = await sb.from('profiles').update(updates).eq('id', userId);
  if (upErr) throw upErr;

  return {
    ...updates,
    user_level: profile.user_level ?? 'A2',
    weak_tags: profile.weak_tags ?? [],
    level_test_done: !!profile.level_test_done,
  };
}

export async function getLocalProfileProgress(sb: SupabaseClient): Promise<ProfileProgress> {
  const userId = await getUserId(sb);
  const p = await fetchProfile(sb, userId);
  return {
    xp: p.xp ?? 0,
    level: levelFromXp(p.xp ?? 0),
    streak: p.streak ?? 0,
    last_study_date: p.last_study_date ?? null,
    user_level: p.user_level ?? 'A2',
    weak_tags: p.weak_tags ?? [],
    level_test_done: !!p.level_test_done,
  };
}

export async function saveLevelTestResult(sb: SupabaseClient, input: LevelTestSave): Promise<ProfileProgress> {
  const userId = await getUserId(sb);
  const profile = await fetchProfile(sb, userId);
  // XP +20은 최초 1회만 (local.ts와 동일 계약)
  const xp = (profile.xp ?? 0) + (profile.level_test_done ? 0 : XP_LEVEL_TEST);
  const { error } = await sb
    .from('profiles')
    .update({
      user_level: input.cefr,
      weak_tags: input.weakTags,
      xp,
      level: levelFromXp(xp),
      level_test_done: true,
    })
    .eq('id', userId);
  if (error) throw error;
  return {
    xp,
    level: levelFromXp(xp),
    streak: profile.streak ?? 0,
    last_study_date: profile.last_study_date ?? null,
    user_level: input.cefr,
    weak_tags: input.weakTags,
    level_test_done: true,
  };
}

// ── 문법 (P3) ──────────────────────────────────────────────

type GrammarTopicRow = {
  id: string;
  slug: string;
  title: string;
  cefr_level: string | null;
  explanation: string | null;
  tags: string[] | null;
  sort_order: number;
};

type GrammarQuestionRow = {
  id: string;
  question_type: string;
  prompt: string;
  options: { chips?: string[]; choices?: string[]; segments?: string[] } | null;
  correct_answer: string;
  explanation: string | null;
  sort_order: number;
  grammar_topics: { slug: string } | null;
};

let grammarTopicsCache: GrammarTopicLike[] | null = null;

export async function getGrammarTopics(sb: SupabaseClient): Promise<GrammarTopicLike[]> {
  if (grammarTopicsCache) return grammarTopicsCache;
  const { data, error } = await sb.from('grammar_topics').select('*').order('sort_order');
  if (error) throw error;
  grammarTopicsCache = (data as GrammarTopicRow[]).map((t) => ({
    slug: t.slug,
    title: t.title,
    cefr_level: t.cefr_level ?? 'A2',
    explanation: t.explanation ?? '',
    tags: t.tags ?? [],
    sort_order: t.sort_order,
  }));
  return grammarTopicsCache;
}

export async function getGrammarQuestions(
  sb: SupabaseClient,
  topicSlug?: string,
): Promise<GrammarQuestionLike[]> {
  let query = sb
    .from('grammar_questions')
    .select('id, question_type, prompt, options, correct_answer, explanation, sort_order, grammar_topics!inner(slug)')
    .order('sort_order');
  if (topicSlug) query = query.eq('grammar_topics.slug', topicSlug);
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as GrammarQuestionRow[]).map((q) => ({
    id: q.id,
    topic_slug: q.grammar_topics?.slug ?? '',
    question_type: q.question_type as GrammarQuestionType,
    prompt: q.prompt,
    options: q.options?.chips ?? q.options?.choices ?? q.options?.segments ?? [],
    answer: q.correct_answer,
    explanation: q.explanation ?? '',
  }));
}

export async function recordGrammarAttempt(
  sb: SupabaseClient,
  input: { questionId: string; correct: boolean; now: Date; userAnswer?: string },
): Promise<void> {
  const userId = await getUserId(sb);
  // quiz_type enum에 문법 유형 추가됨 (migration 004) — 통합 'grammar' 값 사용
  const { error } = await sb.from('quiz_attempts').insert({
    user_id: userId,
    grammar_question_id: input.questionId,
    quiz_type: 'grammar',
    is_correct: input.correct,
    user_answer: input.userAnswer ?? null,
  });
  if (error) throw error;
}

export async function getTodaySummary(sb: SupabaseClient, now: Date): Promise<TodaySummary> {
  const userId = await getUserId(sb);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [due, attemptsRes, sessionsRes] = await Promise.all([
    getDueWords(sb, now),
    sb
      .from('quiz_attempts')
      .select('is_correct')
      .eq('user_id', userId)
      .gte('created_at', startOfDay.toISOString()),
    sb
      .from('study_sessions')
      .select('xp_earned')
      .eq('user_id', userId)
      .gte('started_at', startOfDay.toISOString()),
  ]);
  const attempts = attemptsRes.data ?? [];
  return {
    dueCount: due.length,
    attemptsToday: attempts.length,
    correctToday: attempts.filter((a) => a.is_correct).length,
    xpToday: (sessionsRes.data ?? []).reduce((sum, s) => sum + (s.xp_earned ?? 0), 0),
  };
}

export async function getStatsOverview(sb: SupabaseClient, now: Date): Promise<StatsOverview> {
  const userId = await getUserId(sb);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [words, userWordsRes, attemptsRes, sessionsRes] = await Promise.all([
    getWords(sb),
    sb.from('user_words').select('word_id, status, next_review_at').eq('user_id', userId),
    sb
      .from('quiz_attempts')
      .select('word_id, is_correct, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500),
    sb
      .from('study_sessions')
      .select('duration_seconds, started_at')
      .eq('user_id', userId)
      .gte('started_at', weekAgo.toISOString()),
  ]);
  const byId = new Map(words.map((w) => [w.id, w]));
  const states = userWordsRes.data ?? [];
  const attempts = attemptsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  const recent = attempts.filter((a) => new Date(a.created_at).getTime() >= weekAgo.getTime());
  const accuracy7d = recent.length === 0 ? 0 : recent.filter((a) => a.is_correct).length / recent.length;

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
      .reduce((sum, s) => sum + (s.duration_seconds ?? 0), 0);
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
