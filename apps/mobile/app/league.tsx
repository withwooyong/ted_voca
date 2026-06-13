/**
 * 주간 리그 화면 — plan p6 §6.
 * getLeagueSummary 로딩 후 LeagueBoard 렌더.
 * 헤더(뒤로 ‹ + "주간 리그" + "N일 남음"), 티어 배지 카드, 보드(승급/강등선).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { LeagueBoard } from '@/components/league/LeagueBoard';
import { colors, spacing } from '@/constants/theme';
import { getLeagueSummary, type LeagueSummary } from '@/lib/data';

export default function LeagueScreen() {
  const [summary, setSummary] = useState<LeagueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (isActive: () => boolean) => {
    try {
      const result = await getLeagueSummary(new Date());
      if (!isActive()) return;
      setSummary(result);
    } catch (err) {
      console.error('[league] load failed', err);
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

  // local·remote 양쪽에서 본인 행 user_id는 'me'로 마스킹됨 (data 레이어 계약)
  const myUserId = 'me';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" style={styles.head}>
        <Text style={styles.back}>‹</Text>
        <Text style={styles.title}>주간 리그</Text>
        {summary ? <Text style={styles.meta}>{summary.daysLeft}일 남음</Text> : null}
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : null}

      {error ? (
        <Text style={styles.errorText}>리그 정보를 불러오지 못했어. 잠시 후 다시 시도해줘.</Text>
      ) : null}

      {summary && !loading ? (
        <LeagueBoard board={summary.board} myUserId={myUserId} tier={summary.tier} />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { fontSize: 28, color: colors.text, width: 24 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
  meta: { fontSize: 13, fontWeight: '600', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  errorText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: spacing.md },
});
