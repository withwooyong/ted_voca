import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { StyleSheet, Text, View } from 'react-native';

import { TedMascot } from '@/components/TedMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { getLocalProfileProgress } from '@/lib/data';

function num(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function QuizCompleteScreen() {
  const params = useLocalSearchParams();
  const correct = num(params.correct, 0);
  const total = num(params.total, 0);
  const xp = num(params.xp, 0);
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getLocalProfileProgress()
      .then((p) => alive && setStreak(p.streak))
      .catch(() => alive && setStreak(0));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <TedMascot size={92} />
        <Text style={styles.heading}>세션 완료!</Text>

        <View style={styles.cards}>
          <Card style={styles.statCard}>
            <Text style={[styles.statNum, { color: colors.primary }]}>+{xp}</Text>
            <Text style={styles.statLabel}>획득 XP</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statNum, { color: colors.success }]}>
              {correct}/{total}
            </Text>
            <Text style={styles.statLabel}>정답률</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statNum, { color: colors.accent }]}>
              🔥 {streak ?? '-'}
            </Text>
            <Text style={styles.statLabel}>Streak</Text>
          </Card>
        </View>

        <TedMascot
          size={44}
          message="틀린 단어는 복습 큐에 들어갔어. SRS가 알아서 챙겨줄게!"
        />
      </View>

      <View style={styles.dock}>
        <Button title="복습 이어하기" onPress={() => router.replace('/(tabs)/review')} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  heading: { fontSize: 24, fontWeight: '800', color: colors.text },
  cards: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  statCard: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  dock: { padding: spacing.lg, gap: spacing.sm },
  homeBtn: { marginTop: spacing.xs },
});
