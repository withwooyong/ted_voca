import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { QuizOption, QuizOptionState } from '@/components/quiz/QuizOption';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import {
  completeSession,
  getDueWords,
  getRecentResults,
  getUserWordMap,
  getWords,
  recordAttempt,
} from '@/lib/data';
import type { Word } from '@/lib/data';
import {
  buildQuestion,
  difficultyFromRecent,
  isSpellingCorrect,
  wordsForDifficulty,
  xpForQuizSession,
  type VocabQuestion,
} from '@ted-voca/shared';

const SESSION_SIZE = 10;
const MAX_DUE = 5;

type Loaded = {
  questions: VocabQuestion[];
};

export default function VocabQuizScreen() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [index, setIndex] = useState(0);
  const [spellInput, setSpellInput] = useState('');
  const [answered, setAnswered] = useState(false);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  // 동기 더블탭 가드 (state 반영 지연 보완)
  const finishingRef = useRef(false);
  // 로드 완료 시점에 설정 (렌더 중 impure 호출 금지 — react-hooks/purity)
  const startedAt = useRef(0);
  const questionStart = useRef(0);
  // 상태 배칭과 무관하게 동기 추적 (세션 정산 정확성)
  const correctRef = useRef(0);
  // 마지막 recordAttempt가 끝나기 전 completeSession이 나가지 않도록 직렬화
  const attemptPending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const now = new Date();
        const [words, map, recent, due] = await Promise.all([
          getWords(),
          getUserWordMap(),
          getRecentResults(SESSION_SIZE),
          getDueWords(now),
        ]);
        const difficulty = difficultyFromRecent(recent);
        const poolIds = new Set(wordsForDifficulty(words, difficulty).map((w) => w.id));
        const pool: Word[] = words.filter((w) => poolIds.has(w.id));

        const chosen: Word[] = [];
        const usedIds = new Set<string>();

        // due 단어 우선 (풀 안에 든 것만), 최대 5개
        for (const card of due) {
          if (chosen.length >= MAX_DUE) break;
          if (poolIds.has(card.word.id) && !usedIds.has(card.word.id)) {
            chosen.push(card.word);
            usedIds.add(card.word.id);
          }
        }

        // 나머지는 미학습(신규) 단어, sort_order 낮은 순
        const newWords = pool
          .filter((w) => !(w.id in map) && !usedIds.has(w.id))
          .sort((a, b) => a.sort_order - b.sort_order);
        for (const w of newWords) {
          if (chosen.length >= SESSION_SIZE) break;
          chosen.push(w);
          usedIds.add(w.id);
        }

        // 부족하면 풀의 나머지 단어로 채움 (단어 부족 방어)
        if (chosen.length < SESSION_SIZE) {
          const rest = pool
            .filter((w) => !usedIds.has(w.id))
            .sort((a, b) => a.sort_order - b.sort_order);
          for (const w of rest) {
            if (chosen.length >= SESSION_SIZE) break;
            chosen.push(w);
            usedIds.add(w.id);
          }
        }

        // 보기(distractor) 풀은 난이도 필터와 무관하게 전체 단어 — 보기 4개 미달 방지
        const questions = chosen.map((w) =>
          buildQuestion(w, words, { isNewWord: !(w.id in map), rng: Math.random }),
        );

        if (alive) {
          startedAt.current = now.getTime();
          questionStart.current = now.getTime();
          setLoaded({ questions });
        }
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const total = loaded?.questions.length ?? 0;
  const question = loaded?.questions[index];

  const optionState = useMemo(() => {
    return (label: string): QuizOptionState => {
      if (!answered || !question) return 'default';
      if (label === question.answer) return lastCorrect ? 'correct' : 'revealed';
      if (label === picked) return 'wrong';
      return 'default';
    };
  }, [answered, lastCorrect, picked, question]);

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

  if (total === 0 || !question) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>지금은 출제할 단어가 없어. 나중에 다시 와줘!</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  const submit = async (answer: string) => {
    const now = new Date();
    if (answered) return;
    const correct =
      question.type === 'spelling'
        ? isSpellingCorrect(answer, question.answer)
        : answer === question.answer;
    setPicked(answer);
    setAnswered(true);
    setLastCorrect(correct);
    if (correct) {
      correctRef.current += 1;
    }

    attemptPending.current = recordAttempt({
      wordId: question.word.id,
      quizType: question.type,
      correct,
      now,
      responseMs: now.getTime() - questionStart.current,
      userAnswer: answer,
    }).catch((err) => console.warn('[quiz] recordAttempt failed', err));
    await attemptPending.current;
  };

  const next = async () => {
    if (finishing || finishingRef.current) return;
    const now = new Date();
    if (index + 1 >= total) {
      finishingRef.current = true;
      setFinishing(true);
      const finalCorrect = correctRef.current;
      const xp = xpForQuizSession(finalCorrect);
      try {
        await attemptPending.current; // 마지막 문항 기록 완료 보장
        await completeSession({
          module: 'vocab',
          itemsCompleted: total,
          itemsCorrect: finalCorrect,
          xpEarned: xp,
          now,
          durationSeconds: Math.round((now.getTime() - startedAt.current) / 1000),
        });
      } catch (err) {
        console.warn('[quiz] completeSession failed', err);
      }
      router.replace(`/quiz/complete?correct=${finalCorrect}&total=${total}&xp=${xp}`);
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(false);
    setPicked(null);
    setSpellInput('');
    questionStart.current = now.getTime();
  };

  const word = question.word as Word;

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>어휘 · TOEIC 800</Text>
        <Text style={styles.meta}>
          {index + 1}/{total}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {question.type === 'blank' && (
          <>
            <Text style={styles.prompt}>빈칸에 알맞은 단어는?</Text>
            <Text style={styles.sentence}>{question.prompt}</Text>
            <View style={styles.options}>
              {question.options.map((opt) => (
                <QuizOption
                  key={opt}
                  label={opt}
                  state={optionState(opt)}
                  disabled={answered}
                  onPress={() => submit(opt)}
                />
              ))}
            </View>
          </>
        )}

        {question.type === 'multiple_choice' && (
          <>
            <Text style={styles.prompt}>다음 단어의 뜻은?</Text>
            <Text style={styles.headword}>{question.prompt}</Text>
            <View style={styles.options}>
              {question.options.map((opt) => (
                <QuizOption
                  key={opt}
                  label={opt}
                  state={optionState(opt)}
                  disabled={answered}
                  onPress={() => submit(opt)}
                />
              ))}
            </View>
          </>
        )}

        {question.type === 'spelling' && (
          <>
            <Text style={styles.prompt}>철자를 입력하세요</Text>
            <Text style={styles.sentence}>{question.prompt}</Text>
            <TextInput
              style={styles.input}
              value={spellInput}
              onChangeText={setSpellInput}
              placeholder="영어로 입력"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!answered}
              onSubmitEditing={() => spellInput.trim() && submit(spellInput)}
            />
            {!answered && (
              <Button
                title="확인"
                onPress={() => submit(spellInput)}
                disabled={!spellInput.trim()}
              />
            )}
          </>
        )}
      </ScrollView>

      {answered && (
        <View style={[styles.sheet, lastCorrect ? styles.sheetGood : styles.sheetBad]}>
          <Text style={styles.verdict}>
            {lastCorrect ? '✅ Correct!' : '❌ 다시 볼 단어로 저장했어요'}
          </Text>
          <Text style={styles.sheetWord}>
            {word.lemma} — {word.meaning_ko}
          </Text>
          {word.example_en ? <Text style={styles.exampleEn}>{word.example_en}</Text> : null}
          {word.example_ko ? <Text style={styles.exampleKo}>{word.example_ko}</Text> : null}
          <Button title="계속 →" onPress={next} />
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
  headword: { fontSize: 32, fontWeight: '800', color: colors.text, marginVertical: spacing.sm },
  options: { gap: spacing.sm, marginTop: spacing.sm },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
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
  sheetWord: { fontSize: 16, fontWeight: '700', color: colors.text },
  exampleEn: { fontSize: 14, fontStyle: 'italic', color: colors.text },
  exampleKo: { fontSize: 13, color: colors.textMuted },
});
