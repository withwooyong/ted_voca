/**
 * Memory Booster — 최근 7일 학습 단어의 lemma·예문을 연속 TTS 자동 재생.
 * plan: docs/plans/p4-listening.md §1.2.6, §4.
 *
 * - 항목당 큐: [{lemma, pause 1s}, {exampleEn, pause 1.5s}] 를 이어붙여 speakQueue.
 * - onItemStart 인덱스로 현재 단어 카드 동기 표시.
 * - AppState background → stopSpeaking + 항목 인덱스 보관, active 복귀 → 그 항목부터 재개
 *   (expo-speech pause는 Android 미지원 → stop/재개 방식).
 * - 전체 재생 완료 시에만 세션 기록 (XP 0 — 자동 재생이라 XP 파밍 방지).
 */
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TedMascot } from '@/components/TedMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { completeSession, getBoosterItems } from '@/lib/data';
import { ensureAudioMode, speakQueue, stopSpeaking, type QueueItem } from '@/lib/tts';
import type { BoosterItem } from '@ted-voca/shared';

const LEMMA_PAUSE_MS = 1000;
const EXAMPLE_PAUSE_MS = 1500;
// 항목당 lemma + example 2개 큐 아이템
const ITEMS_PER_BOOSTER = 2;

type Phase = 'loading' | 'empty' | 'ready' | 'error';

export default function MemoryBoosterScreen() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<BoosterItem[]>([]);
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // 재생 제어용 동기 ref (콜백/AppState 핸들러는 최신값 필요)
  const itemsRef = useRef<BoosterItem[]>([]);
  const cursorRef = useRef(0); // 현재 재생 중/재개할 항목 인덱스
  const playingRef = useRef(false);
  const startedAtRef = useRef(0);
  const completedRef = useRef(false); // 전체 완료 시 세션 1회만 기록
  // 백그라운드 진입 시점에 재생 중이었는지 (active 복귀 시 자동 재개 판단)
  const resumeOnActiveRef = useRef(false);
  // 언마운트 후 비동기 콜백(playFrom await, onItemStart)의 setState 차단
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    void ensureAudioMode();
    let alive = true;
    (async () => {
      try {
        const now = new Date();
        const result = await getBoosterItems(now);
        if (!alive) return;
        if (result.length === 0) {
          setPhase('empty');
          return;
        }
        itemsRef.current = result;
        startedAtRef.current = now.getTime();
        setItems(result);
        setPhase('ready');
      } catch (err) {
        console.warn('[booster] getBoosterItems failed', err);
        if (alive) setPhase('error');
      }
    })();
    return () => {
      alive = false;
      aliveRef.current = false;
      stopSpeaking();
    };
  }, []);

  const markComplete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    const now = new Date();
    const count = itemsRef.current.length;
    try {
      await completeSession({
        module: 'listening',
        itemsCompleted: count,
        itemsCorrect: count,
        xpEarned: 0, // 자동 재생 — XP 0, 세션 기록만
        now,
        durationSeconds: Math.round((now.getTime() - startedAtRef.current) / 1000),
      });
    } catch (err) {
      console.warn('[booster] completeSession failed', err);
    }
  }, []);

  /** fromIndex 항목부터 끝까지 큐를 만들어 재생. 큐 인덱스 → 항목 인덱스 매핑으로 카드 동기화. */
  const playFrom = useCallback(async (fromIndex: number) => {
    const list = itemsRef.current;
    if (fromIndex >= list.length || !aliveRef.current) return;

    const queue: QueueItem[] = [];
    for (let i = fromIndex; i < list.length; i++) {
      queue.push({ text: list[i].lemma, pauseAfterMs: LEMMA_PAUSE_MS });
      queue.push({ text: list[i].exampleEn, pauseAfterMs: EXAMPLE_PAUSE_MS });
    }

    playingRef.current = true;
    setPlaying(true);
    cursorRef.current = fromIndex;
    setActiveIndex(fromIndex);

    const result = await speakQueue(queue, {
      onItemStart: (queueIdx) => {
        const itemIdx = fromIndex + Math.floor(queueIdx / ITEMS_PER_BOOSTER);
        cursorRef.current = itemIdx;
        if (aliveRef.current) setActiveIndex(itemIdx);
      },
    });

    // 'stopped'는 일시정지/이탈 — 상태 유지. 'done'만 완료 처리.
    if (result === 'done') {
      playingRef.current = false;
      if (aliveRef.current) setPlaying(false);
      await markComplete();
    }
  }, [markComplete]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    stopSpeaking();
  }, []);

  const toggle = useCallback(() => {
    if (playingRef.current) {
      pause();
    } else {
      void playFrom(cursorRef.current);
    }
  }, [pause, playFrom]);

  // AppState: background 진입 시 정지(인덱스 보관), active 복귀 시 그 항목부터 재개
  useEffect(() => {
    const prev = { current: AppState.currentState as AppStateStatus };
    const sub = AppState.addEventListener('change', (next) => {
      const wasPlaying = playingRef.current;
      if (next.match(/inactive|background/)) {
        if (wasPlaying) {
          // 정지하되 사용자 의도(재생 중)는 ref로 보존하지 않고, 복귀 시 자동 재개 위해 표시
          stopSpeaking();
          playingRef.current = false;
          setPlaying(false);
          resumeOnActiveRef.current = true;
        }
      } else if (next === 'active' && prev.current.match(/inactive|background/)) {
        if (resumeOnActiveRef.current) {
          resumeOnActiveRef.current = false;
          void playFrom(cursorRef.current);
        }
      }
      prev.current = next;
    });
    return () => sub.remove();
  }, [playFrom]);

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <TedMascot size={64} message="부스터를 불러오지 못했어. 다시 시도해 줘." />
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} style={styles.btn} />
      </View>
    );
  }

  if (phase === 'empty') {
    return (
      <View style={styles.center}>
        <TedMascot
          size={80}
          message="최근 7일 학습한 단어가 아직 없어. 어휘 퀴즈로 단어를 모아볼까?"
        />
        <Button
          title="어휘 퀴즈 풀러 가기"
          onPress={() => router.replace('/quiz/vocab')}
          style={styles.btn}
        />
        <Button title="뒤로" variant="ghost" onPress={() => router.back()} style={styles.btn} />
      </View>
    );
  }

  const active = items[activeIndex];

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>🔊 Memory Booster</Text>
        <Text style={styles.meta}>
          {activeIndex + 1}/{items.length}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${((activeIndex + 1) / items.length) * 100}%` }]}
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.subtitle}>최근 7일 학습 문장 자동 재생</Text>

        {active ? (
          <Card style={styles.wordCard}>
            <Text style={styles.lemma}>{active.lemma}</Text>
            <Text style={styles.meaning}>{active.meaningKo}</Text>
            <Text style={styles.example}>{active.exampleEn}</Text>
          </Card>
        ) : null}

        <Button
          title={playing ? '⏸ 정지' : '▶ 재생'}
          onPress={toggle}
          style={styles.toggle}
        />
        <Text style={styles.hint}>
          {playing ? '단어 → 예문 순서로 들려줄게.' : '재생을 눌러 자동 학습을 시작해.'}
        </Text>
      </View>
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
  btn: { alignSelf: 'stretch' },
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
  body: { flex: 1, padding: spacing.md, gap: spacing.md, justifyContent: 'center' },
  subtitle: { fontSize: 13, color: colors.textMuted, textAlign: 'center', fontWeight: '600' },
  wordCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  lemma: { fontSize: 32, fontWeight: '800', color: colors.text },
  meaning: { fontSize: 16, color: colors.textMuted, fontWeight: '600' },
  example: {
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.xs,
  },
  toggle: { alignSelf: 'stretch', marginTop: spacing.md },
  hint: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center' },
});
