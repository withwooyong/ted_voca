import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

type Props = {
  chips: string[];
  /** 선택된 칩의 index 배열 (선택 순서대로) — controlled */
  picked: number[];
  onPick: (index: number) => void;
  onReset: () => void;
  disabled?: boolean;
};

/** 어순 배열 빌더 — 칩 탭으로 문장 완성 (프로토타입 #grammar UX, 드래그 아님) */
export function WordOrderBuilder({ chips, picked, onPick, onReset, disabled }: Props) {
  const pickedSet = new Set(picked);
  return (
    <View style={styles.wrap}>
      <View style={styles.answerLine}>
        {picked.length === 0 ? (
          <Text style={styles.placeholder}>카드를 눌러 문장을 완성하세요</Text>
        ) : (
          picked.map((i, order) => (
            <View key={`${i}-${order}`} style={styles.answerChip}>
              <Text style={styles.answerChipText}>{chips[i]}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.chipArea}>
        {chips.map((chip, i) => {
          const used = pickedSet.has(i);
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityState={{ disabled: used || !!disabled }}
              disabled={used || disabled}
              onPress={() => onPick(i)}
              style={({ pressed }) => [styles.chip, used && styles.chipUsed, pressed && styles.chipPressed]}>
              <Text style={[styles.chipText, used && styles.chipTextUsed]}>{chip}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onReset}
        disabled={disabled}
        style={styles.reset}>
        <Text style={styles.resetText}>↺ 다시 놓기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  answerLine: {
    minHeight: 64,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  placeholder: { color: colors.textMuted, fontSize: 13.5, paddingHorizontal: 6 },
  answerChip: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  answerChipText: { fontSize: 16, fontWeight: '600', color: colors.primaryDark },
  chipArea: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 11,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  chipPressed: { borderColor: colors.primary },
  chipUsed: { opacity: 0.25 },
  chipText: { fontSize: 16, fontWeight: '600', color: colors.text },
  chipTextUsed: { color: colors.textMuted },
  reset: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 4 },
  resetText: { color: colors.primary, fontSize: 13.5, fontWeight: '700' },
});
