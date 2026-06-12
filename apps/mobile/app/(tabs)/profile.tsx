import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { displayStreak, GOAL_OPTIONS } from '@ted-voca/shared';
import { colors, spacing } from '@/constants/theme';
import { getAuthModeLabel, useAuthStore } from '@/lib/auth-store';
import { getLocalProfileProgress, type ProfileProgress } from '@/lib/data';

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const [progress, setProgress] = useState<ProfileProgress | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLocalProfileProgress()
        .then((p) => {
          if (active) setProgress(p);
        })
        .catch(console.warn);
      return () => {
        active = false;
      };
    }, []),
  );

  const onSignOut = () => {
    Alert.alert('로그아웃', '정말 로그아웃할까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  const goalLabel = GOAL_OPTIONS.find((g) => g.value === profile?.goal)?.label ?? '-';
  const streak = progress ? displayStreak(progress.last_study_date, progress.streak, new Date()) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.label}>이름</Text>
        <Text style={styles.value}>{profile?.display_name ?? '-'}</Text>
        <Text style={styles.label}>이메일</Text>
        <Text style={styles.value}>{user?.email ?? '-'}</Text>
        <Text style={styles.label}>목표</Text>
        <Text style={styles.value}>{goalLabel}</Text>
        <Text style={styles.label}>일일 목표</Text>
        <Text style={styles.value}>{profile?.daily_goal_minutes ?? 10}분</Text>
        <Text style={styles.label}>레벨 / XP / Streak</Text>
        <Text style={styles.value}>
          Lv.{progress?.level ?? 1} · {progress?.xp ?? 0} XP · 🔥 {streak}일
        </Text>
        <Text style={styles.label}>진단 레벨</Text>
        <Text style={styles.value}>
          {progress?.level_test_done ? `${progress.user_level} (CEFR)` : '미진단'}
        </Text>
        <Text style={styles.label}>Auth 모드</Text>
        <Text style={styles.value}>{getAuthModeLabel()}</Text>
      </Card>

      <Pressable onPress={() => router.push('/stats')}>
        <Card style={styles.linkCard}>
          <Text style={styles.linkEmoji}>📊</Text>
          <Text style={styles.linkTitle}>학습 통계</Text>
          <Text style={styles.linkSub}>정답률 · 주간 차트 · 약점 단어 · 복습 큐</Text>
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/level-test')}>
        <Card style={styles.linkCard}>
          <Text style={styles.linkEmoji}>🎯</Text>
          <Text style={styles.linkTitle}>실력 진단 {progress?.level_test_done ? '다시 받기' : '받기'}</Text>
          <Text style={styles.linkSub}>20문항 · 약 5분 · 복습 우선순위에 반영</Text>
        </Card>
      </Pressable>

      <Button title="로그아웃" variant="secondary" onPress={onSignOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  label: { color: colors.textMuted, marginTop: spacing.sm, fontSize: 12 },
  value: { color: colors.text, fontSize: 16, fontWeight: '600' },
  linkCard: { gap: 2 },
  linkEmoji: { fontSize: 22 },
  linkTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  linkSub: { fontSize: 12.5, color: colors.textMuted },
});
