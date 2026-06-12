import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from '@/constants/theme';

export type QuizOptionState = 'default' | 'correct' | 'wrong' | 'revealed';

type Props = {
  label: string;
  onPress: () => void;
  state?: QuizOptionState;
  disabled?: boolean;
};

const MARKERS: Partial<Record<QuizOptionState, string>> = {
  correct: '✓',
  wrong: '✗',
  revealed: '✓',
};

export function QuizOption({ label, onPress, state = 'default', disabled }: Props) {
  const marker = MARKERS[state];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        state === 'correct' && styles.correct,
        state === 'wrong' && styles.wrong,
        state === 'revealed' && styles.revealed,
        pressed && !disabled && styles.pressed,
      ]}>
      <Text style={[styles.label, state === 'correct' && styles.labelCorrect, state === 'wrong' && styles.labelWrong]}>
        {label}
      </Text>
      {marker ? (
        <Text style={[styles.marker, state === 'wrong' ? styles.labelWrong : styles.labelCorrect]}>{marker}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  pressed: { borderColor: colors.primary },
  correct: { borderColor: colors.success, backgroundColor: '#ECFDF5' },
  wrong: { borderColor: colors.error, backgroundColor: '#FEF2F2' },
  revealed: { borderColor: colors.success },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
  labelCorrect: { color: colors.success },
  labelWrong: { color: colors.error },
  marker: { fontSize: 16, fontWeight: '800', marginLeft: 8 },
});
