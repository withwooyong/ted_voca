/**
 * 회화 시나리오 목록 — plan p5 §1.2.1.
 * 난이도·턴수·레벨 잠금·일일 잔여 횟수 표시. 탭 → /speaking/[slug].
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TedMascot } from '@/components/TedMascot';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import {
  getDialogueTurns,
  getLocalProfileProgress,
  getSpeakingRemaining,
  getSpeakingScenarios,
} from '@/lib/data';
import { isScenarioLocked, type SpeakingScenarioLike } from '@ted-voca/shared';

type ScenarioRow = {
  scenario: SpeakingScenarioLike;
  turnCount: number;
  locked: boolean;
};

export default function SpeakingListScreen() {
  const [rows, setRows] = useState<ScenarioRow[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (isActive: () => boolean) => {
    try {
      const now = new Date();
      const [scenarios, remainingToday, progress] = await Promise.all([
        getSpeakingScenarios(),
        getSpeakingRemaining(now),
        getLocalProfileProgress(),
      ]);
      const userLevel = progress.level;
      const built = await Promise.all(
        scenarios.map(async (scenario) => {
          const turns = await getDialogueTurns(scenario.slug);
          return {
            scenario,
            turnCount: turns.length,
            locked: isScenarioLocked(scenario, userLevel),
          };
        }),
      );
      if (!isActive()) return;
      setRows(built);
      setRemaining(remainingToday);
    } catch (err) {
      console.error('[speaking] load failed', err);
      if (isActive()) setError(true);
    } finally {
      if (isActive()) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const openScenario = (slug: string) => {
    router.push({ pathname: '/speaking/[slug]', params: { slug } });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>회화 (AI)</Text>
        <Text style={styles.remaining}>오늘 {remaining}회 남음</Text>
      </View>

      <TedMascot
        size={56}
        message="내가 상대역을 해줄게. 상황을 골라 영어로 말해보자!"
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : null}

      {error ? (
        <Text style={styles.errorText}>시나리오를 불러오지 못했어. 잠시 후 다시 시도해줘.</Text>
      ) : null}

      {rows.map(({ scenario, turnCount, locked }) =>
        locked ? (
          <Card key={scenario.id} style={StyleSheet.flatten([styles.row, styles.rowLocked])}>
            <Text style={styles.rowEmoji}>{scenario.emoji}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{scenario.title}</Text>
              <Text style={styles.rowDesc}>🔒 레벨 {scenario.min_level}에 해제</Text>
            </View>
          </Card>
        ) : (
          <Pressable key={scenario.id} onPress={() => openScenario(scenario.slug)}>
            <Card style={styles.row}>
              <Text style={styles.rowEmoji}>{scenario.emoji}</Text>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>{scenario.title}</Text>
                <Text style={styles.rowDesc}>
                  난이도 {scenario.difficulty} · {turnCount}턴
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Card>
          </Pressable>
        ),
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  back: { fontSize: 28, color: colors.text, width: 24 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
  remaining: { fontSize: 13, fontWeight: '700', color: colors.primary },
  errorText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLocked: { opacity: 0.5 },
  rowEmoji: { fontSize: 26 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 20 },
});
