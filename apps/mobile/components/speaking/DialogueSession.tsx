/**
 * DialogueSession — 한 회화 시나리오의 턴제 대화 단위.
 * 계약은 __tests__/dialogue-session.test.tsx (plan p5 §3).
 *
 * 흐름: ted 턴(버블 + speakOnce 자동재생) → onDone 시 다음 턴으로
 *      → 연속 ted 턴은 순차 진행, user 턴 만나면 멈춤
 *      → user 턴: hint_ko + 🎤 마이크 → getUtterance → 발화 버블 + requestFeedback
 *      → 피드백 카드(verdict·correction·alternative·다음) → "다음" 탭 → 다음 ted 턴
 *      → 모든 턴 소진 → onComplete({userTurns, feedbacks})
 *      → daily_limit 응답이면 한도 안내 + 마이크 비활성
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import { speakOnce } from '@/lib/tts';
import type { DialogueTurnLike, SpeakFeedback, SpeakingScenarioLike } from '@ted-voca/shared';

type RequestFeedbackResult =
  | { feedback: SpeakFeedback; remainingToday: number }
  | { error: 'daily_limit'; remainingToday: number };

type DialogueSessionProps = {
  scenario: SpeakingScenarioLike;
  turns: DialogueTurnLike[];
  requestFeedback: (input: {
    turnOrder: number;
    userText: string;
    expectedText: string;
  }) => Promise<RequestFeedbackResult>;
  getUtterance: () => Promise<string>;
  onComplete: (stats: { userTurns: number; feedbacks: SpeakFeedback[] }) => void;
};

/**
 * 턴 포인터 전용 외부 스토어. ted 턴의 `speakOnce` onDone은 React 이벤트 밖(네이티브 TTS
 * 콜백)에서 호출되므로 일반 useState로는 concurrent root에서 즉시 flush가 보장되지 않는다.
 * onDone → 다음 턴 자동진행을 동기 flush하기 위해 useSyncExternalStore 구독한다
 * (ClipSession.usePlayedGate 패턴, 계약: __tests__/dialogue-session.test.tsx).
 */
function useTurnPointer(): [number, (next: number) => void] {
  const ref = useRef<{ value: number; listeners: Set<() => void> }>({
    value: 0,
    listeners: new Set(),
  });
  const store = ref.current;

  const subscribe = useCallback(
    (l: () => void) => {
      store.listeners.add(l);
      return () => store.listeners.delete(l);
    },
    [store],
  );
  const get = useCallback(() => store.value, [store]);
  const value = useSyncExternalStore(subscribe, get, get);

  const set = useCallback(
    (next: number) => {
      if (store.value === next) return;
      store.value = next;
      store.listeners.forEach((l) => l());
    },
    [store],
  );

  return [value, set];
}

const VERDICT_LABEL: Record<SpeakFeedback['verdict'], string> = {
  natural: '자연스러워요',
  ok: '좋아요 (ok)',
  awkward: '다소 어색해요',
};

type Bubble =
  | { kind: 'ted'; key: string; text: string }
  | { kind: 'user'; key: string; text: string };

export function DialogueSession({
  scenario,
  turns,
  requestFeedback,
  getUtterance,
  onComplete,
}: DialogueSessionProps) {
  const [index, setIndex] = useTurnPointer();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<SpeakFeedback | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  // 어떤 ted 턴을 이미 말했는지 추적 — 중복 speakOnce 방지
  const spokenRef = useRef<Set<number>>(new Set());
  // 누적 사용자 발화 피드백 — onComplete 정산용
  const feedbacksRef = useRef<SpeakFeedback[]>([]);
  // onComplete 1회 보장
  const completedRef = useRef(false);

  const total = turns.length;
  const current = turns[index];
  const userTurns = turns.filter((t) => t.speaker === 'user').length;

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete({ userTurns, feedbacks: feedbacksRef.current.slice() });
  }, [onComplete, userTurns]);

  // ted 턴 자동 진행: 현재 턴이 ted면 버블 추가 + speakOnce → onDone에서 다음 턴으로.
  useEffect(() => {
    if (!current) {
      finish();
      return;
    }
    if (current.speaker !== 'ted') return;
    if (spokenRef.current.has(current.turn_order)) return;
    spokenRef.current.add(current.turn_order);

    setBubbles((prev) => [
      ...prev,
      { kind: 'ted', key: `ted-${current.turn_order}`, text: current.text_en },
    ]);

    speakOnce(current.text_en, {
      onDone: () => setIndex(index + 1),
      onError: () => setIndex(index + 1),
    });
  }, [current, index, setIndex, finish]);

  const onMicPress = async () => {
    if (!current || current.speaker !== 'user' || listening || pending || limitReached) return;
    setListening(true);
    let userText = '';
    try {
      userText = await getUtterance();
    } catch {
      setListening(false);
      return;
    }
    setListening(false);
    setBubbles((prev) => [
      ...prev,
      { kind: 'user', key: `user-${current.turn_order}`, text: userText },
    ]);

    setPending(true);
    let result: RequestFeedbackResult;
    try {
      result = await requestFeedback({
        turnOrder: current.turn_order,
        userText,
        expectedText: current.text_en,
      });
    } catch {
      setPending(false);
      return;
    }
    setPending(false);

    if ('error' in result) {
      setLimitReached(true);
      return;
    }
    feedbacksRef.current.push(result.feedback);
    setFeedback(result.feedback);
  };

  const onNext = () => {
    setFeedback(null);
    setIndex(index + 1);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.scenarioTitle}>
          {scenario.emoji} {scenario.title}
        </Text>
        <Text style={styles.progress}>
          {Math.min(index + 1, total)} / {total}
        </Text>
      </View>

      <View style={styles.thread}>
        {bubbles.map((b) =>
          b.kind === 'ted' ? (
            <View key={b.key} style={[styles.bubble, styles.bubbleTed]}>
              <Text style={styles.bubbleTedText}>{b.text}</Text>
            </View>
          ) : (
            <View key={b.key} style={[styles.bubble, styles.bubbleUser]}>
              <Text style={styles.bubbleUserText}>{b.text}</Text>
            </View>
          ),
        )}
      </View>

      {/* user 턴 — 힌트 + 마이크 (피드백 카드가 떠 있지 않을 때만) */}
      {current?.speaker === 'user' && !feedback ? (
        <View style={styles.userPrompt}>
          {current.hint_ko ? <Text style={styles.hint}>{current.hint_ko}</Text> : null}

          {limitReached ? (
            <Text style={styles.limitText}>
              오늘 무료 피드백 한도(10회)를 모두 사용했어. 내일 다시 도전해줘!
            </Text>
          ) : null}

          <Pressable
            testID="mic-button"
            accessibilityRole="button"
            accessibilityLabel="마이크로 말하기"
            accessibilityState={{ disabled: limitReached }}
            disabled={limitReached || listening || pending}
            onPress={onMicPress}
            style={[styles.mic, limitReached && styles.micDisabled]}>
            {listening || pending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.micIcon}>🎤</Text>
            )}
          </Pressable>
          <Text style={styles.micLabel}>
            {listening ? '듣고 있어요…' : pending ? 'Ted가 보고 있어요…' : '눌러서 말해보세요'}
          </Text>
        </View>
      ) : null}

      {/* 피드백 카드 */}
      {feedback ? (
        <View style={[styles.feedbackCard, verdictStyle(feedback.verdict)]}>
          <Text style={styles.verdict}>{VERDICT_LABEL[feedback.verdict]}</Text>
          <Text style={styles.correction}>{feedback.correction}</Text>
          {feedback.alternative ? (
            <Text style={styles.alternative}>💡 {feedback.alternative}</Text>
          ) : null}
          <Button title="다음 →" onPress={onNext} style={styles.nextBtn} />
        </View>
      ) : null}
    </View>
  );
}

function verdictStyle(verdict: SpeakFeedback['verdict']) {
  if (verdict === 'natural') return styles.cardNatural;
  if (verdict === 'ok') return styles.cardOk;
  return styles.cardAwkward;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scenarioTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  progress: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  thread: { gap: spacing.sm },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '85%' },
  bubbleTed: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleTedText: { fontSize: 15, lineHeight: 22, color: colors.text },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleUserText: { fontSize: 15, lineHeight: 22, color: '#fff' },
  userPrompt: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  hint: { fontSize: 14, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
  limitText: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    lineHeight: 19,
  },
  mic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micDisabled: { backgroundColor: colors.border },
  micIcon: { fontSize: 30 },
  micLabel: { fontSize: 12.5, color: colors.textMuted },
  feedbackCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardNatural: { backgroundColor: '#ECFDF5', borderColor: colors.success },
  cardOk: { backgroundColor: '#EEF2FF', borderColor: colors.primary },
  cardAwkward: { backgroundColor: '#FEF2F2', borderColor: colors.error },
  verdict: { fontSize: 16, fontWeight: '800', color: colors.text },
  correction: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  alternative: { fontSize: 13.5, lineHeight: 20, color: colors.textMuted },
  nextBtn: { marginTop: spacing.xs },
});
