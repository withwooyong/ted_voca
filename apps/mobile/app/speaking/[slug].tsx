/**
 * 회화 대화 컨테이너 — plan p5 §1.2.2.
 * 로드 → DialogueSession → completeSession → 결과 화면.
 * Dev Mock(supabase 미설정): STT 대신 현재 user 턴 기대답안 자동 입력 (plan §5).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DialogueSession } from '@/components/speaking/DialogueSession';
import { TedMascot } from '@/components/TedMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import {
  completeSession,
  getDialogueTurns,
  getSpeakingScenarios,
  requestSpeakFeedback,
} from '@/lib/data';
import { getSttAdapter, type SttAdapter } from '@/lib/stt';
import { isSupabaseConfigured } from '@/lib/supabase';
import { ensureAudioMode, stopSpeaking } from '@/lib/tts';
import {
  xpForSpeakingSession,
  type DialogueTurnLike,
  type SpeakFeedback,
  type SpeakingScenarioLike,
} from '@ted-voca/shared';

type Loaded = {
  scenario: SpeakingScenarioLike;
  turns: DialogueTurnLike[];
};

type Result = {
  userTurns: number;
  feedbacks: SpeakFeedback[];
  xp: number;
};

export default function SpeakingDialogueScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const startedAt = useRef(0);
  const adapterRef = useRef<SttAdapter | null>(null);
  // Dev Mock: getUtterance 호출마다 다음 user 턴의 기대답안을 STT 없이 자동 입력한다 (plan §5).
  // user 턴 순서대로 커서를 진행 — 첫 턴부터 올바른 기대답안을 쓴다 (off-by-one 방지).
  const userTurnsRef = useRef<DialogueTurnLike[]>([]);
  const userTurnCursor = useRef(0);
  const expectedTextRef = useRef('');

  useEffect(() => {
    void ensureAudioMode();
    let alive = true;
    (async () => {
      try {
        if (!slug) {
          if (alive) setError(true);
          return;
        }
        const now = new Date();
        const [scenarios, turns] = await Promise.all([
          getSpeakingScenarios(),
          getDialogueTurns(slug),
        ]);
        const scenario = scenarios.find((s) => s.slug === slug);
        if (!scenario || turns.length === 0) {
          if (alive) setError(true);
          return;
        }
        userTurnsRef.current = turns
          .filter((t) => t.speaker === 'user')
          .sort((a, b) => a.turn_order - b.turn_order);
        adapterRef.current = await getSttAdapter({
          preferMock: !isSupabaseConfigured,
          mockTextProvider: () => expectedTextRef.current,
        });
        if (alive) {
          startedAt.current = now.getTime();
          setLoaded({ scenario, turns });
        }
      } catch (err) {
        console.error('[speaking] load failed', err);
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
      adapterRef.current?.stop();
      stopSpeaking();
    };
  }, [slug]);

  // STT 어댑터를 Promise로 감싸 1회 발화 텍스트로 resolve.
  // 호출 시점에 현재 user 턴의 기대답안을 mock provider가 읽도록 먼저 세팅(커서 진행).
  const getUtterance = (): Promise<string> => {
    const idx = userTurnCursor.current;
    userTurnCursor.current += 1;
    expectedTextRef.current = userTurnsRef.current[idx]?.text_en ?? '';
    return new Promise<string>((resolve, reject) => {
      const adapter = adapterRef.current;
      if (!adapter) {
        reject(new Error('stt_unavailable'));
        return;
      }
      void Promise.resolve(
        adapter.start({
          lang: 'en-US',
          onResult: (transcript) => resolve(transcript),
          onError: (code) => reject(new Error(code)),
        }),
      ).catch(reject);
    });
  };

  const requestFeedback = (input: {
    turnOrder: number;
    userText: string;
    expectedText: string;
  }) => requestSpeakFeedback({ scenarioSlug: slug as string, ...input, now: new Date() });

  const onComplete = async (stats: { userTurns: number; feedbacks: SpeakFeedback[] }) => {
    stopSpeaking();
    const now = new Date();
    const itemsCorrect = stats.feedbacks.filter(
      (f) => f.verdict === 'natural' || f.verdict === 'ok',
    ).length;
    const xp = xpForSpeakingSession(stats.userTurns);
    try {
      await completeSession({
        module: 'speaking',
        itemsCompleted: stats.userTurns,
        itemsCorrect,
        xpEarned: xp,
        now,
        durationSeconds: Math.round((now.getTime() - startedAt.current) / 1000),
      });
    } catch (err) {
      console.warn('[speaking] completeSession failed', err);
    }
    setResult({ userTurns: stats.userTurns, feedbacks: stats.feedbacks, xp });
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>대화를 불러오지 못했어. 잠시 후 다시 시도해줘.</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  if (result) {
    const natural = result.feedbacks.filter((f) => f.verdict === 'natural').length;
    const ok = result.feedbacks.filter((f) => f.verdict === 'ok').length;
    return (
      <View style={styles.container}>
        <View style={styles.resultBody}>
          <TedMascot size={88} message="회화 한 판 잘했어! 자연스러운 표현이 늘고 있어." />
          <Text style={styles.resultHeading}>대화 완료!</Text>
          <View style={styles.cards}>
            <Card style={styles.statCard}>
              <Text style={[styles.statNum, { color: colors.primary }]}>+{result.xp}</Text>
              <Text style={styles.statLabel}>획득 XP</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statNum, { color: colors.success }]}>
                {natural + ok}/{result.userTurns}
              </Text>
              <Text style={styles.statLabel}>좋은 발화</Text>
            </Card>
          </View>
        </View>
        <View style={styles.dock}>
          <Button title="다른 시나리오" onPress={() => router.replace('/speaking')} />
          <Button
            title="홈으로"
            variant="ghost"
            onPress={() => router.replace('/(tabs)')}
            style={styles.homeBtn}
          />
        </View>
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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.body}>
        <DialogueSession
          scenario={loaded.scenario}
          turns={loaded.turns}
          requestFeedback={requestFeedback}
          getUtterance={getUtterance}
          onComplete={onComplete}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  body: { padding: spacing.md, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  resultBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  resultHeading: { fontSize: 24, fontWeight: '800', color: colors.text },
  cards: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  statCard: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  dock: { padding: spacing.lg, gap: spacing.sm },
  homeBtn: { marginTop: spacing.xs },
});
