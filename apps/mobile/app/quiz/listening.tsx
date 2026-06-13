/**
 * 리스닝 퀴즈 화면 — 3클립 세션 (재생 게이트 + comprehension).
 * plan: docs/plans/p4-listening.md §4. vocab/grammar 퀴즈 플로우를 미러.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ClipSession } from '@/components/listening/ClipSession';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import {
  completeSession,
  getListeningClips,
  getListeningQuestions,
  recordListeningAttempt,
} from '@/lib/data';
import { ensureAudioMode, stopSpeaking } from '@/lib/tts';
import {
  pickListeningClips,
  questionsForClip,
  xpForQuizSession,
  type ListeningClipLike,
  type ListeningQuestionLike,
} from '@ted-voca/shared';

const CLIP_COUNT = 3;

type SessionClip = {
  clip: ListeningClipLike;
  questions: ListeningQuestionLike[];
};

type Loaded = {
  clips: SessionClip[];
  totalQuestions: number;
};

export default function ListeningQuizScreen() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [clipIndex, setClipIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);

  // 렌더 중 impure 호출 금지 — 로드 시점에 설정 (react-hooks/purity)
  const startedAt = useRef(0);
  const correctRef = useRef(0);
  const completedQuestionsRef = useRef(0);
  // 마지막 attempt 기록이 끝나기 전 completeSession이 나가지 않도록 직렬화
  const attemptPending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void ensureAudioMode();
    let alive = true;
    (async () => {
      try {
        const now = new Date();
        const [clips, questions] = await Promise.all([
          getListeningClips(),
          getListeningQuestions(),
        ]);
        // 문항이 있는 클립만 후보로
        const withQuestions = clips.filter((c) => questionsForClip(questions, c.slug).length > 0);
        const chosen = pickListeningClips(withQuestions, CLIP_COUNT, Math.random);
        const session: SessionClip[] = chosen.map((clip) => ({
          clip,
          questions: questionsForClip(questions, clip.slug),
        }));
        const totalQuestions = session.reduce((sum, s) => sum + s.questions.length, 0);
        if (alive) {
          startedAt.current = now.getTime();
          setLoaded({ clips: session, totalQuestions });
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
      stopSpeaking(); // 화면 이탈/언마운트 시 재생 중단
    };
  }, []);

  const total = loaded?.clips.length ?? 0;
  const current = loaded?.clips[clipIndex];

  const onAnswer = (question: ListeningQuestionLike, correct: boolean) => {
    const now = new Date();
    completedQuestionsRef.current += 1;
    if (correct) correctRef.current += 1;
    attemptPending.current = recordListeningAttempt({
      questionId: question.id,
      correct,
      now,
    }).catch((err) => console.warn('[listening] recordListeningAttempt failed', err));
  };

  const onClipComplete = async () => {
    if (finishing || finishingRef.current) return;
    if (clipIndex + 1 < total) {
      stopSpeaking();
      setClipIndex((i) => i + 1);
      return;
    }
    // 마지막 클립 — 세션 정산
    finishingRef.current = true;
    setFinishing(true);
    stopSpeaking();
    const now = new Date();
    const finalCorrect = correctRef.current;
    const totalQuestions = loaded?.totalQuestions ?? completedQuestionsRef.current;
    const xp = xpForQuizSession(finalCorrect);
    try {
      await attemptPending.current; // 마지막 문항 기록 완료 보장
      await completeSession({
        module: 'listening',
        itemsCompleted: totalQuestions,
        itemsCorrect: finalCorrect,
        xpEarned: xp,
        now,
        durationSeconds: Math.round((now.getTime() - startedAt.current) / 1000),
      });
    } catch (err) {
      console.warn('[listening] completeSession failed', err);
    }
    router.replace(`/quiz/complete?correct=${finalCorrect}&total=${totalQuestions}&xp=${xp}`);
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>리스닝을 불러오지 못했어. 잠시 후 다시 시도해줘.</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (total === 0 || !current) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>지금은 들을 수 있는 클립이 없어. 나중에 다시 와줘!</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>리스닝</Text>
        <Text style={styles.meta}>
          {clipIndex + 1}/{total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((clipIndex + 1) / total) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <ClipSession
          key={current.clip.id}
          clip={current.clip}
          questions={current.questions}
          onAnswer={onAnswer}
          onComplete={onClipComplete}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: { fontSize: 28, color: colors.text, width: 24 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  body: { padding: spacing.md, paddingBottom: spacing.xl },
});
