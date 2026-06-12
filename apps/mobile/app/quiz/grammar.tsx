import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { QuizOption, QuizOptionState } from '@/components/quiz/QuizOption';
import { WordOrderBuilder } from '@/components/quiz/WordOrderBuilder';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import {
  completeSession,
  getGrammarQuestions,
  getGrammarTopics,
  getLocalProfileProgress,
  recordGrammarAttempt,
} from '@/lib/data';
import {
  isGrammarCorrect,
  pickGrammarSession,
  shuffleChips,
  xpForQuizSession,
  type GrammarQuestionLike,
} from '@ted-voca/shared';

const SESSION_SIZE = 5;

type SessionItem = {
  question: GrammarQuestionLike;
  /** word_order 전용: 세션 시작 시 1회 셔플한 칩 (문항당 고정) */
  chips: string[];
};

type Loaded = {
  items: SessionItem[];
};

export default function GrammarQuizScreen() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const topicParam = Array.isArray(params.topic) ? params.topic[0] : params.topic;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number[]>([]); // word_order: 선택한 칩 index
  const [pickedOption, setPickedOption] = useState<string | null>(null); // choice 유형
  const [answered, setAnswered] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // 동기 더블탭 가드 (state 반영 지연 보완 — 리뷰 2a M1/M2)
  const finishingRef = useRef(false);
  const gradedRef = useRef(false);

  // 로드 완료 시점에 설정 (렌더 중 impure 호출 금지 — react-hooks/purity)
  const startedAt = useRef(0);
  // 상태 배칭과 무관하게 동기 추적 (세션 정산 정확성)
  const correctRef = useRef(0);
  // 마지막 recordGrammarAttempt가 끝나기 전 completeSession이 나가지 않도록 직렬화
  const attemptPending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const now = new Date();
        const [topics, questions, progress] = await Promise.all([
          getGrammarTopics(),
          getGrammarQuestions(topicParam),
          getLocalProfileProgress(),
        ]);
        const chosen = pickGrammarSession(
          questions,
          topics,
          SESSION_SIZE,
          Math.random,
          progress.weak_tags,
        );
        const items: SessionItem[] = chosen.map((question) => ({
          question,
          chips:
            question.question_type === 'word_order'
              ? shuffleChips(question.options, Math.random)
              : question.options,
        }));
        if (alive) {
          startedAt.current = now.getTime();
          setLoaded({ items });
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [topicParam]);

  const total = loaded?.items.length ?? 0;
  const item = loaded?.items[index];
  const question = item?.question;

  const optionState = useMemo(() => {
    return (label: string): QuizOptionState => {
      if (!answered || !question) return 'default';
      if (label === question.answer) return lastCorrect ? 'correct' : 'revealed';
      if (label === pickedOption) return 'wrong';
      return 'default';
    };
  }, [answered, lastCorrect, pickedOption, question]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>문항을 불러오지 못했어. 잠시 후 다시 시도해줘.</Text>
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

  if (total === 0 || !item || !question) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>지금은 출제할 문법 문항이 없어. 나중에 다시 와줘!</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const grade = async (correct: boolean, userAnswer: string) => {
    // state(answered) 반영 전 재탭 방어 — 동기 가드
    if (gradedRef.current) return;
    gradedRef.current = true;
    const now = new Date();
    setAnswered(true);
    setLastCorrect(correct);
    if (correct) {
      correctRef.current += 1;
    }
    attemptPending.current = recordGrammarAttempt({
      questionId: question.id,
      correct,
      now,
      userAnswer,
    }).catch((err) => console.warn('[grammar] recordGrammarAttempt failed', err));
    await attemptPending.current;
  };

  // word_order: 칩 선택 — 모두 채우면 자동 채점
  const onPick = (chipIndex: number) => {
    if (answered) return;
    const nextPicked = [...picked, chipIndex];
    setPicked(nextPicked);
    if (nextPicked.length === item.chips.length) {
      const pickedTexts = nextPicked.map((i) => item.chips[i]);
      const correct = isGrammarCorrect(question, pickedTexts);
      void grade(correct, pickedTexts.join(' '));
    }
  };

  const onReset = () => {
    if (answered) return;
    setPicked([]);
  };

  // blank_choice / error_find: 보기 탭 → 채점
  const onSelectOption = (label: string) => {
    if (answered) return;
    setPickedOption(label);
    const correct = isGrammarCorrect(question, label);
    void grade(correct, label);
  };

  const next = async () => {
    if (finishing || finishingRef.current) return;
    const now = new Date();
    if (index + 1 >= total) {
      finishingRef.current = true; // state 반영 전 더블탭 방어 — 동기 가드
      setFinishing(true);
      const finalCorrect = correctRef.current;
      const xp = xpForQuizSession(finalCorrect);
      try {
        await attemptPending.current; // 마지막 문항 기록 완료 보장
        await completeSession({
          module: 'grammar',
          itemsCompleted: total,
          itemsCorrect: finalCorrect,
          xpEarned: xp,
          now,
          durationSeconds: Math.round((now.getTime() - startedAt.current) / 1000),
        });
      } catch (err) {
        console.warn('[grammar] completeSession failed', err);
      }
      router.replace(`/quiz/complete?correct=${finalCorrect}&total=${total}&xp=${xp}`);
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(false);
    setPicked([]);
    setPickedOption(null);
    gradedRef.current = false;
  };

  const isWordOrder = question.question_type === 'word_order';

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>문법</Text>
        <Text style={styles.meta}>
          {index + 1}/{total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {isWordOrder ? (
          <>
            <Text style={styles.prompt}>카드를 순서대로 눌러 문장을 완성하세요</Text>
            <Text style={styles.sentence}>{question.prompt}</Text>
            <WordOrderBuilder
              chips={item.chips}
              picked={picked}
              onPick={onPick}
              onReset={onReset}
              disabled={answered}
            />
          </>
        ) : (
          <>
            <Text style={styles.prompt}>
              {question.question_type === 'error_find' ? '틀린 부분을 고르세요' : '빈칸에 알맞은 것은?'}
            </Text>
            <Text style={styles.sentence}>{question.prompt}</Text>
            <View style={styles.options}>
              {item.chips.map((opt) => (
                <QuizOption
                  key={opt}
                  label={opt}
                  state={optionState(opt)}
                  disabled={answered}
                  onPress={() => onSelectOption(opt)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {answered && (
        <View style={[styles.sheet, lastCorrect ? styles.sheetGood : styles.sheetBad]}>
          <Text style={styles.verdict}>
            {lastCorrect ? '✅ 완벽해!' : isWordOrder ? '❌ 어순을 다시 볼까?' : '❌ 다시 살펴볼까?'}
          </Text>
          {!lastCorrect && (
            <Text style={styles.answerText}>정답: {question.answer}</Text>
          )}
          {question.explanation ? (
            <Text style={styles.expl}>{question.explanation}</Text>
          ) : null}
          <View style={styles.sheetActions}>
            <Button
              title="📚 규칙 보기"
              variant="secondary"
              style={styles.actionGhost}
              onPress={() => router.push(`/grammar-dict/${question.topic_slug}`)}
            />
            <Button title="계속 →" style={styles.actionMain} onPress={next} />
          </View>
        </View>
      )}
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
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  prompt: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  sentence: { fontSize: 19, lineHeight: 28, color: colors.text, fontWeight: '600' },
  options: { gap: spacing.sm, marginTop: spacing.sm },
  sheet: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  sheetGood: { backgroundColor: '#ECFDF5' },
  sheetBad: { backgroundColor: '#FEF2F2' },
  verdict: { fontSize: 17, fontWeight: '800', color: colors.text },
  answerText: { fontSize: 16, fontWeight: '700', color: colors.text },
  expl: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionGhost: { flex: 1 },
  actionMain: { flex: 2 },
});
