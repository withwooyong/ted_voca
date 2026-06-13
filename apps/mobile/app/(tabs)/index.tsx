import { useCallback, useMemo, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TedMascot } from '@/components/TedMascot';
import { Card } from '@/components/ui/Card';
import { APP_NAME, displayStreak, LEAGUE_PROMOTE_COUNT, type LeagueTier } from '@ted-voca/shared';
import { colors, spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth-store';
import {
  getLeagueSummary,
  getLocalProfileProgress,
  getTodaySummary,
  type LeagueSummary,
  type ProfileProgress,
  type TodaySummary,
} from '@/lib/data';
import { flushPendingQueue } from '@/lib/offline/sync';

const TIER_LABEL: Record<LeagueTier, string> = {
  bronze: '브론즈',
  silver: '실버',
  gold: '골드',
};

type ModuleCard = {
  emoji: string;
  label: string;
  ready: boolean;
  note: string;
};

const MODULES: ModuleCard[] = [
  { emoji: '📖', label: '어휘', ready: true, note: '빈칸·4지선다·철자' },
  { emoji: '📝', label: '문법', ready: false, note: 'P3 준비 중' },
  { emoji: '🎧', label: '리스닝', ready: false, note: 'P4 준비 중' },
  { emoji: '🗣️', label: '회화', ready: false, note: 'P5 준비 중' },
];

export default function HomeScreen() {
  const authProfile = useAuthStore((s) => s.profile);
  const name = authProfile?.display_name ?? 'Learner';

  const [progress, setProgress] = useState<ProfileProgress | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [league, setLeague] = useState<LeagueSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (isActive: () => boolean) => {
    // 오프라인 sync 큐 flush (best-effort) — 실패해도 홈 로딩 비차단.
    // (local 모드면 flushPendingQueue 내부에서 즉시 반환)
    void flushPendingQueue().catch(() => {
      // 오프라인/큐 비어있음 — 다음 기회 재시도. 무해하게 무시.
    });

    try {
      const now = new Date();
      const [p, s, l] = await Promise.all([
        getLocalProfileProgress(),
        getTodaySummary(now),
        getLeagueSummary(now).catch(() => null),
      ]);
      if (!isActive()) return; // 포커스 이탈 후 setState 방지
      setProgress(p);
      setSummary(s);
      setLeague(l);
    } catch (err) {
      console.error('[home] load failed', err);
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

  const streak = progress
    ? displayStreak(progress.last_study_date, progress.streak, new Date())
    : 0;
  const xp = progress?.xp ?? authProfile?.xp ?? 0;
  const dueCount = summary?.dueCount ?? 0;
  const attemptsToday = summary?.attemptsToday ?? 0;
  const goalMinutes = authProfile?.daily_goal_minutes ?? 10;

  // 리그 카드 데이터 — 승급까지 남은 XP. 서버가 부여한 rank 를 신뢰한다.
  // board 의 user_id 는 'me'/'other-N' 으로 마스킹돼 있어 buildLeagueView 로 재정렬하면
  // 동점 tie-break(user_id localeCompare)이 서버와 어긋나 xpToPromote 가 오계산되므로 직접 계산.
  const leagueTierLabel = league ? TIER_LABEL[league.tier] : '';
  const myRank = league?.myRank ?? null;
  const xpToPromote = useMemo(() => {
    if (!league || league.myRank === null) return 0;
    if (league.myRank <= LEAGUE_PROMOTE_COUNT) return 0; // 이미 승급권
    const line = league.board.find((e) => e.rank === LEAGUE_PROMOTE_COUNT);
    return line ? Math.max(0, line.xp - league.myXp) : 0;
  }, [league]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.appName}>{APP_NAME}</Text>
        <View style={styles.stats}>
          <Text style={styles.stat}>🔥 {streak}</Text>
          <Text style={styles.stat}>⭐ {xp}</Text>
        </View>
      </View>

      <Text style={styles.greeting}>안녕, {name}!</Text>
      <Text style={styles.sub}>오늘도 {goalMinutes}분만 하면 돼</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : null}

      <Pressable onPress={() => router.push('/(tabs)/review')}>
        <Card>
          <Text style={styles.cardTitle}>📋 오늘 할 일</Text>
          <Text style={styles.cardSub}>
            복습 {dueCount}개 · 오늘 푼 문항 {attemptsToday}개
          </Text>
          <Text style={styles.cardCta}>탭하면 복습 시작 ›</Text>
        </Card>
      </Pressable>

      {progress && !progress.level_test_done ? (
        <Pressable onPress={() => router.push('/level-test')}>
          <Card style={styles.levelTestCard}>
            <Text style={styles.levelTestEmoji}>🎯</Text>
            <View style={styles.levelTestBody}>
              <Text style={styles.cardTitle}>실력 진단 받기</Text>
              <Text style={styles.cardSub}>20문항 5분 — 딱 맞는 레벨로 시작하자</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Card>
        </Pressable>
      ) : null}

      <View style={styles.grid}>
        {MODULES.map((mod) => (
          <Pressable
            key={mod.label}
            style={styles.gridItem}
            disabled={!mod.ready}
            onPress={() => mod.ready && router.push('/quiz/vocab')}>
            <Card style={StyleSheet.flatten([styles.gridCard, !mod.ready && styles.gridDisabled])}>
              <Text style={styles.gridEmoji}>{mod.emoji}</Text>
              <Text style={styles.gridLabel}>{mod.label}</Text>
              <Text style={styles.gridNote}>{mod.note}</Text>
            </Card>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={() => router.push('/league')}>
        <Card style={styles.leagueCard}>
          <Text style={styles.cardTitle}>
            🏆 {league ? `${leagueTierLabel} 리그 · 이번 주 #${myRank ?? '-'}` : '이번 주 리그'}
          </Text>
          <Text style={styles.cardSub}>
            {league
              ? xpToPromote > 0
                ? `상위 10명 승급 — ${xpToPromote} XP 차이`
                : '상위 10명 승급 — 이미 승급권!'
              : '곧 친구들과 겨뤄보자'}
          </Text>
          <Text style={styles.cardCta}>탭하면 리그 보기 ›</Text>
        </Card>
      </Pressable>

      <TedMascot size={56} message="오늘 복습부터 시작해 볼까?" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { fontSize: 20, fontWeight: '800', color: colors.primary },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: { fontSize: 16, fontWeight: '600', color: colors.text },
  greeting: { fontSize: 24, fontWeight: '700', color: colors.text },
  sub: { color: colors.textMuted, marginBottom: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardSub: { color: colors.textMuted, marginTop: 4 },
  cardCta: { color: colors.primary, fontWeight: '600', marginTop: spacing.sm, fontSize: 13 },
  levelTestCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  levelTestEmoji: { fontSize: 26 },
  levelTestBody: { flex: 1 },
  chevron: { color: colors.textMuted, fontSize: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48%', flexGrow: 1, minWidth: '45%' },
  gridCard: {},
  gridDisabled: { opacity: 0.5 },
  gridEmoji: { fontSize: 28 },
  gridLabel: { fontWeight: '600', color: colors.text, marginTop: 4 },
  gridNote: { color: colors.textMuted, marginTop: 2, fontSize: 12 },
  leagueCard: {},
});
