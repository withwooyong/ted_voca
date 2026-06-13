/**
 * ClipSession — 한 리스닝 클립의 재생 게이트 + comprehension 퀴즈 단위.
 * 계약은 __tests__/clip-session.test.tsx (plan p4 §5).
 *
 * 흐름: (재생 전) ▶ 재생 + 속도 pill → speakOnce → onDone → 문항 노출
 *      → 보기 탭(onAnswer) → 해설 + 따라 말하기(disabled) + 계속
 *      → 다음 문항 or onComplete(correctCount)
 */
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { QuizOption, type QuizOptionState } from '@/components/quiz/QuizOption';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import { speakOnce } from '@/lib/tts';
import { isListeningCorrect, type ListeningClipLike, type ListeningQuestionLike, type ListeningRate } from '@ted-voca/shared';

type Props = {
  clip: ListeningClipLike;
  questions: ListeningQuestionLike[];
  onAnswer: (question: ListeningQuestionLike, correct: boolean) => void;
  onComplete: (correctCount: number) => void;
};

type SpeedOption = { label: string; rate: ListeningRate };

const SPEEDS: SpeedOption[] = [
  { label: '0.75x', rate: 'slow' },
  { label: '1.0x', rate: 'normal' },
  { label: '1.25x', rate: 'fast' },
];

/**
 * 재생 게이트 전용 상태. `speakOnce`의 onDone은 React 이벤트 밖(네이티브 TTS 콜백)에서
 * 호출되므로 일반 useState로는 즉시 리렌더가 보장되지 않는다(concurrent root). 외부 스토어
 * 구독으로 onDone 시점에 동기 flush한다 — 계약: __tests__/clip-session.test.tsx.
 */
function usePlayedGate(): [boolean, () => void] {
  const ref = useRef<{ value: boolean; listeners: Set<() => void> }>({
    value: false,
    listeners: new Set(),
  });
  const store = ref.current;

  const subscribe = useCallback((l: () => void) => {
    store.listeners.add(l);
    return () => store.listeners.delete(l);
  }, [store]);
  const get = useCallback(() => store.value, [store]);
  const value = useSyncExternalStore(subscribe, get, get);

  const markPlayed = useCallback(() => {
    if (store.value) return;
    store.value = true;
    store.listeners.forEach((l) => l());
  }, [store]);

  return [value, markPlayed];
}

export function ClipSession({ clip, questions, onAnswer, onComplete }: Props) {
  const [played, markPlayed] = usePlayedGate();
  const [ttsFailed, setTtsFailed] = useState(false);
  const [rate, setRate] = useState<ListeningRate>('normal');
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const question = questions[index];

  const play = () => {
    setTtsFailed(false);
    speakOnce(clip.transcript_en, {
      rate,
      onDone: markPlayed,
      // 엔진 오류 시 게이트가 안 열린 채 침묵하지 않게 실패 안내 (재생 버튼으로 재시도)
      onError: () => setTtsFailed(true),
    });
  };

  const optionState = useMemo(() => {
    return (label: string): QuizOptionState => {
      if (!answered || !question) return 'default';
      if (label === question.answer) return lastCorrect ? 'correct' : 'revealed';
      if (label === picked) return 'wrong';
      return 'default';
    };
  }, [answered, lastCorrect, picked, question]);

  const onSelect = (choice: string) => {
    if (answered || !question) return;
    const correct = isListeningCorrect(question, choice);
    setPicked(choice);
    setAnswered(true);
    setLastCorrect(correct);
    if (correct) setCorrectCount((c) => c + 1);
    onAnswer(question, correct);
  };

  const onContinue = () => {
    const finalCorrect = correctCount;
    if (index + 1 >= questions.length) {
      onComplete(finalCorrect);
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(false);
    setPicked(null);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.playerCard}>
        <Text style={styles.prompt}>잘 듣고 질문에 답하세요 ({clip.duration_seconds}초)</Text>

        {/* 재생 중/완료 표시 — reanimated 없이 정적 웨이브 */}
        <View style={styles.wave}>
          {WAVE_BARS.map((h, i) => (
            <View key={i} style={[styles.waveBar, { height: h }]} />
          ))}
        </View>

        <Button title={played ? '🔁 다시 듣기' : '▶ 재생'} onPress={play} style={styles.playBtn} />
        {ttsFailed ? (
          <Text style={styles.ttsError}>재생에 실패했어. 버튼을 눌러 다시 시도해 줘.</Text>
        ) : null}

        <View style={styles.pillRow}>
          {SPEEDS.map((s) => {
            const active = s.rate === rate;
            return (
              <Pressable
                key={s.label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setRate(s.rate)}
                style={[styles.pill, active && styles.pillActive]}>
                <Text style={[styles.pillText, active && styles.pillTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {played && question ? (
        <View style={styles.quiz}>
          <Text style={styles.qprompt}>{question.prompt}</Text>
          <View style={styles.options}>
            {question.choices.map((choice) => (
              <QuizOption
                key={choice}
                label={choice}
                state={optionState(choice)}
                disabled={answered}
                onPress={() => onSelect(choice)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {answered ? (
        <View style={[styles.sheet, lastCorrect ? styles.sheetGood : styles.sheetBad]}>
          <Text style={styles.verdict}>{lastCorrect ? '✅ 정답!' : '❌ 다시 들어볼까?'}</Text>
          {question?.explanation ? <Text style={styles.expl}>{question.explanation}</Text> : null}
          <View style={styles.sheetActions}>
            {/* TODO(P5): STT 인프라 연동 지점 — 녹음·발음 비교 활성화 */}
            <Button
              title="🎤 따라 말하기"
              variant="secondary"
              disabled
              onPress={NOOP}
              style={styles.actionGhost}
            />
            <Button title="계속 →" onPress={onContinue} style={styles.actionMain} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const NOOP = () => {};

const WAVE_BARS = [10, 18, 26, 16, 30, 22, 14, 28, 20, 12, 24, 18, 30, 16, 22, 14, 26, 12];

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  playerCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  prompt: { fontSize: 14, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    marginVertical: spacing.md,
  },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: colors.primary, opacity: 0.55 },
  playBtn: { alignSelf: 'center', paddingHorizontal: spacing.xl },
  ttsError: { fontSize: 12.5, color: colors.error, marginTop: spacing.sm, textAlign: 'center' },
  pillRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 99,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillActive: { borderColor: colors.primary, backgroundColor: '#EEF2FF' },
  pillText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  pillTextActive: { color: colors.primary },
  quiz: { gap: spacing.sm },
  qprompt: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 25 },
  options: { gap: spacing.sm, marginTop: spacing.xs },
  sheet: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetGood: { backgroundColor: '#ECFDF5' },
  sheetBad: { backgroundColor: '#FEF2F2' },
  verdict: { fontSize: 17, fontWeight: '800', color: colors.text },
  expl: { fontSize: 14, lineHeight: 21, color: colors.textMuted },
  sheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionGhost: { flex: 1 },
  actionMain: { flex: 2 },
});
