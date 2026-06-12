import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { getStatsOverview } from '@/lib/data';
import type { StatsOverview } from '@/lib/data';

export default function StatsScreen() {
  const [data, setData] = useState<StatsOverview | null>(null);
  const [error, setError] = useState(false);

  // 재방문 시 최신 통계 (퀴즈/복습 직후 진입 반영)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getStatsOverview(new Date())
        .then((d) => alive && setData(d))
        .catch(() => alive && setError(true));
      return () => {
        alive = false;
      };
    }, []),
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>통계를 불러오지 못했어.</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const maxMinutes = Math.max(1, ...data.weeklyMinutes);

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>학습 통계</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.row}>
          <Card style={styles.statCard}>
            <Text style={styles.statNum}>{Math.round(data.accuracy7d * 100)}%</Text>
            <Text style={styles.statLabel}>7일 정답률</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statNum}>{data.learnedCount}</Text>
            <Text style={styles.statLabel}>학습 단어</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statNum}>{data.masteredCount}</Text>
            <Text style={styles.statLabel}>마스터</Text>
          </Card>
        </View>

        <Card>
          <Text style={styles.cardTitle}>
            주간 학습 시간 <Text style={styles.cardTitleSub}>(분)</Text>
          </Text>
          <View style={styles.chart}>
            {data.weeklyMinutes.map((minutes, i) => {
              const isToday = i === data.weeklyMinutes.length - 1;
              const heightPct = (minutes / maxMinutes) * 100;
              return (
                <View key={i} style={styles.chartCol}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        { height: `${Math.max(heightPct, minutes > 0 ? 6 : 2)}%` },
                        isToday && styles.barToday,
                      ]}
                    />
                  </View>
                  <Text style={styles.dayLabel}>{data.weeklyDayLabels[i]}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>자주 틀리는 단어</Text>
          {data.topWrongWords.length === 0 ? (
            <Text style={styles.muted}>아직 틀린 단어가 없어. 좋은 출발이야!</Text>
          ) : (
            data.topWrongWords.slice(0, 5).map(({ word, wrongCount }) => (
              <View key={word.id} style={styles.wrongRow}>
                <Text style={styles.wrongWord}>{word.lemma}</Text>
                <Text style={styles.wrongCount}>{wrongCount}회 오답</Text>
                <Text style={styles.wrongMeaning}>{word.meaning_ko}</Text>
              </View>
            ))
          )}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>다가오는 복습</Text>
          <Text style={styles.dueText}>
            오늘 {data.dueToday}개 · 내일 {data.dueTomorrow}개 · 이번 주 {data.dueWeek}개
          </Text>
        </Card>
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
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: { fontSize: 28, color: colors.text, width: 24 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  cardTitleSub: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    marginTop: spacing.md,
  },
  chartCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { height: 96, justifyContent: 'flex-end', width: '60%' },
  bar: { width: '100%', backgroundColor: colors.primary, borderRadius: 4, minHeight: 2 },
  barToday: { backgroundColor: colors.accent },
  dayLabel: { fontSize: 11, color: colors.textMuted },
  wrongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: spacing.sm,
  },
  wrongWord: { fontSize: 15, fontWeight: '700', color: colors.text },
  wrongCount: { fontSize: 12, color: colors.error },
  wrongMeaning: { fontSize: 13, color: colors.textMuted },
  dueText: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 22 },
  muted: { fontSize: 14, color: colors.textMuted, marginTop: spacing.sm },
});
