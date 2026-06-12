import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/constants/theme';

type Props = {
  front: string;
  meaning: string;
  pos: string;
  example?: string | null;
  flipped: boolean;
  onFlip: () => void;
};

/** SRS 플래시카드 (controlled) — 부모가 flipped 상태를 소유 */
export function Flashcard({ front, meaning, pos, example, flipped, onFlip }: Props) {
  return (
    <Pressable accessibilityRole="button" onPress={onFlip} style={styles.card}>
      {flipped ? (
        <>
          <Text style={styles.meaning}>{meaning}</Text>
          <Text style={styles.pos}>{pos} · TOEIC</Text>
          {example ? <Text style={styles.example}>{example}</Text> : null}
        </>
      ) : (
        <>
          <Text style={styles.front}>{front}</Text>
          <Text style={styles.hint}>탭하여 뒤집기</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  front: { fontSize: 34, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12.5, color: colors.textMuted },
  meaning: { fontSize: 22, fontWeight: '800', color: colors.text },
  pos: { fontSize: 13, color: colors.textMuted },
  example: { fontSize: 14, color: colors.textMuted, fontStyle: 'italic', textAlign: 'center' },
});
