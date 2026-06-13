/**
 * 알림 설정 화면 — plan p6 §6.
 * 복습 알림 on/off + 시각, streak/리그 토글(Switch).
 * 설정은 AsyncStorage `tv_notif_prefs`에 저장. 저장 시 데이터 조합으로 ReminderState 만들어
 * syncNotifications(state, createExpoScheduler()) 호출. 권한 거부 시 안내.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import {
  getLeagueSummary,
  getLocalProfileProgress,
  getTodaySummary,
} from '@/lib/data';
import {
  createExpoScheduler,
  syncNotifications,
  type ReminderState,
} from '@/lib/notifications';
import { toDateKey } from '@ted-voca/shared';

const PREFS_KEY = 'tv_notif_prefs';

type NotifPrefs = {
  reviewEnabled: boolean;
  reminderHour: number;
  streakEnabled: boolean;
  leagueEnabled: boolean;
};

const DEFAULT_PREFS: NotifPrefs = {
  reviewEnabled: true,
  reminderHour: 9,
  streakEnabled: true,
  leagueEnabled: true,
};

const HOUR_OPTIONS = [7, 9, 12, 18, 21];

export default function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [denied, setDenied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(PREFS_KEY)
        .then((raw) => {
          if (!active) return;
          if (raw) {
            try {
              setPrefs({ ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotifPrefs>) });
            } catch {
              setPrefs(DEFAULT_PREFS);
            }
          }
        })
        .catch(console.warn)
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const update = (patch: Partial<NotifPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  };

  const onSave = async () => {
    setSaving(true);
    setDenied(false);
    try {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));

      const now = new Date();
      const [summary, progress, league] = await Promise.all([
        getTodaySummary(now),
        getLocalProfileProgress(),
        getLeagueSummary(now).catch(() => null),
      ]);

      const lastStudy = progress.last_study_date;
      const todayK = toDateKey(now);
      const yesterdayK = toDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      const studiedToday = lastStudy === todayK || summary.attemptsToday > 0;
      const studiedYesterday = lastStudy === yesterdayK;

      const state: ReminderState = {
        studiedToday,
        studiedYesterday,
        // 토글 off면 해당 알림이 안 잡히도록 조건값을 무력화
        dueCount: prefs.reviewEnabled ? summary.dueCount : 0,
        streak: prefs.streakEnabled ? progress.streak : 0,
        inLeague: prefs.leagueEnabled && !!league && (league.myRank ?? 0) > 0,
        reminderHour: prefs.reminderHour,
      };

      const granted = await syncNotifications(state, createExpoScheduler());
      if (!granted) setDenied(true);
    } catch (err) {
      console.error('[notif-settings] save failed', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" style={styles.head}>
        <Text style={styles.back}>‹</Text>
        <Text style={styles.title}>알림 설정</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
      ) : (
        <>
          <Card style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>복습 리마인더</Text>
                <Text style={styles.rowSub}>오늘 복습할 단어가 있으면 알려줄게</Text>
              </View>
              <Switch
                value={prefs.reviewEnabled}
                onValueChange={(v) => update({ reviewEnabled: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            {prefs.reviewEnabled ? (
              <View style={styles.hourWrap}>
                <Text style={styles.rowSub}>알림 시각</Text>
                <View style={styles.hourRow}>
                  {HOUR_OPTIONS.map((h) => {
                    const selected = prefs.reminderHour === h;
                    return (
                      <Pressable
                        key={h}
                        onPress={() => update({ reminderHour: h })}
                        style={[styles.hourChip, selected && styles.hourChipOn]}>
                        <Text style={[styles.hourText, selected && styles.hourTextOn]}>
                          {String(h).padStart(2, '0')}:00
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Card>

          <Card style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>🔥 Streak 지키미</Text>
                <Text style={styles.rowSub}>오늘 학습 안 했으면 밤 9시에 알림</Text>
              </View>
              <Switch
                value={prefs.streakEnabled}
                onValueChange={(v) => update({ streakEnabled: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </Card>

          <Card style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle}>🏆 리그 마감 알림</Text>
                <Text style={styles.rowSub}>일요일 저녁, 순위 지킬 시간을 알려줄게</Text>
              </View>
              <Switch
                value={prefs.leagueEnabled}
                onValueChange={(v) => update({ leagueEnabled: v })}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
          </Card>

          {denied ? (
            <Text style={styles.denied}>
              알림 권한이 꺼져 있어 예약하지 못했어. 기기 설정 &gt; 알림에서 Ted 알림을 켜줘.
            </Text>
          ) : null}

          <Button title={saving ? '저장 중…' : '저장'} onPress={onSave} loading={saving} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  back: { fontSize: 28, color: colors.text, width: 24 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  hourWrap: { gap: spacing.xs, marginTop: spacing.xs },
  hourRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hourChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  hourChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  hourText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  hourTextOn: { color: '#fff' },
  denied: { color: colors.error, fontSize: 13, lineHeight: 19 },
});
