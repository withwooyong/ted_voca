import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

type Props = {
  size?: number;
  message?: string;
};

export function TedMascot({ size = 80, message }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.face, { fontSize: size * 0.45 }]}>T</Text>
      </View>
      {message ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{message}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  avatar: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  face: { color: '#fff', fontWeight: '700' },
  bubble: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 280,
  },
  bubbleText: { color: colors.text, textAlign: 'center', lineHeight: 22 },
});
