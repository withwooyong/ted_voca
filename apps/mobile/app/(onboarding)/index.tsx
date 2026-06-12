import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TedMascot } from '@/components/TedMascot';
import { Button } from '@/components/ui/Button';
import { DAILY_GOAL_OPTIONS, GOAL_OPTIONS, LearningGoal } from '@ted-voca/shared';
import { colors, spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth-store';

export default function OnboardingScreen() {
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<LearningGoal>('exam');
  const [dailyMinutes, setDailyMinutes] = useState<5 | 10 | 20>(10);

  const finish = async () => {
    await completeOnboarding(goal, dailyMinutes);
    router.replace('/(tabs)');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.dots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
        ))}
      </View>

      {step === 0 && (
        <>
          <TedMascot message="안녕! 나는 Ted야. 영어 목표가 뭐야?" />
          <View style={styles.options}>
            {GOAL_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setGoal(opt.value)}
                style={[styles.option, goal === opt.value && styles.optionSelected]}>
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                <Text style={[styles.optionLabel, goal === opt.value && styles.optionLabelSelected]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button title="다음 →" onPress={() => setStep(1)} />
        </>
      )}

      {step === 1 && (
        <>
          <TedMascot message="하루에 몇 분 공부할래?" />
          <View style={styles.pills}>
            {DAILY_GOAL_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setDailyMinutes(opt.value)}
                style={[styles.pill, dailyMinutes === opt.value && styles.pillSelected]}>
                <Text style={[styles.pillText, dailyMinutes === opt.value && styles.pillTextSelected]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button title="다음 →" onPress={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <TedMascot message="좋아! 준비됐어 🎉" />
          <View style={styles.summary}>
            <Text style={styles.summaryRow}>
              목표: {GOAL_OPTIONS.find((g) => g.value === goal)?.label}
            </Text>
            <Text style={styles.summaryRow}>일일: {dailyMinutes}분</Text>
          </View>
          <Button title="학습 시작하기" onPress={finish} loading={isLoading} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.lg,
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: '#EEF2FF' },
  optionEmoji: { fontSize: 24 },
  optionLabel: { fontSize: 16, color: colors.text },
  optionLabelSelected: { fontWeight: '700', color: colors.primary },
  pills: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  pill: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pillSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.text, fontWeight: '600' },
  pillTextSelected: { color: '#fff' },
  summary: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: { fontSize: 16, color: colors.text },
});
