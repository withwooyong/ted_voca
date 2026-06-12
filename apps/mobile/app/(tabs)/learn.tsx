import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { getTodaySummary, getUserWordMap } from '@/lib/data';

const COURSE_TITLE = 'TOEIC 800 — 핵심 어휘 510';
const COURSE_TOTAL = 510;

type LockedRow = {
  emoji: string;
  title: string;
  desc: string;
};

const LOCKED: LockedRow[] = [
  { emoji: '📝', title: '문법', desc: '🔒 P3에서 해제 — 카드 배열로 문장 만들기' },
  { emoji: '🎧', title: '리스닝', desc: '🔒 P4에서 해제 — 안내 방송 듣기' },
  { emoji: '🗣️', title: '회화 (AI)', desc: '🔒 P5에서 해제 — 상황극 + Ted 피드백' },
];

export default function LearnScreen() {
  const [learned, setLearned] = useState(0);
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (isActive: () => boolean) => {
    try {
      const [map, summary] = await Promise.all([
        getUserWordMap(),
        getTodaySummary(new Date()),
      ]);
      if (!isActive()) return; // 포커스 이탈 후 setState 방지
      setLearned(Object.keys(map).length);
      setDueCount(summary.dueCount);
    } catch (err) {
      console.error('[learn] load failed', err);
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

  const pct = Math.min(100, Math.round((learned / COURSE_TOTAL) * 100));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>학습</Text>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : null}

      <Card style={styles.courseCard}>
        <Text style={styles.courseLabel}>진행 중인 코스</Text>
        <Text style={styles.courseTitle}>{COURSE_TITLE}</Text>
        <View style={styles.courseTrack}>
          <View style={[styles.courseFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.courseMeta}>
          {learned} / {COURSE_TOTAL} 단어 학습 · {pct}%
        </Text>
      </Card>

      <Pressable onPress={() => router.push('/quiz/vocab')}>
        <Card style={styles.row}>
          <Text style={styles.rowEmoji}>📖</Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>어휘 퀴즈</Text>
            <Text style={styles.rowDesc}>빈칸 · 4지선다 · 철자 입력</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/(tabs)/review')}>
        <Card style={styles.row}>
          <Text style={styles.rowEmoji}>🔄</Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>복습</Text>
            <Text style={styles.rowDesc}>
              SM-2 복습 큐 — 오늘 {dueCount}개 남음
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/level-test')}>
        <Card style={styles.row}>
          <Text style={styles.rowEmoji}>🎯</Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>레벨 테스트</Text>
            <Text style={styles.rowDesc}>20문항 5분 — CEFR 추정 + 약점 태그</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Card>
      </Pressable>

      {LOCKED.map((row) => (
        <Card key={row.title} style={StyleSheet.flatten([styles.row, styles.rowLocked])}>
          <Text style={styles.rowEmoji}>{row.emoji}</Text>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Text style={styles.rowDesc}>{row.desc}</Text>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  screenTitle: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: spacing.xs },
  courseCard: { backgroundColor: colors.primary, borderColor: colors.primary },
  courseLabel: { fontSize: 12, fontWeight: '700', color: '#fff', opacity: 0.8 },
  courseTitle: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: 4, marginBottom: spacing.sm },
  courseTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  courseFill: { height: '100%', backgroundColor: '#fff', borderRadius: 99 },
  courseMeta: { fontSize: 12, color: '#fff', opacity: 0.85, marginTop: 7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLocked: { opacity: 0.5 },
  rowEmoji: { fontSize: 26 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 20 },
});
