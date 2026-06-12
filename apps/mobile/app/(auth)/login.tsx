import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { TedMascot } from '@/components/TedMascot';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@ted-voca/shared';
import { colors, spacing } from '@/constants/theme';
import { getAuthModeLabel, useAuthStore } from '@/lib/auth-store';

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력해 주세요.');
      return;
    }
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (e) {
      Alert.alert('로그인 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>{APP_NAME}</Text>
        <TedMascot message="다시 왔네! 오늘도 같이 공부하자." />
        <View style={styles.form}>
          <Text style={styles.label}>이메일</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
          <Button title="로그인" onPress={onSubmit} loading={isLoading} />
          <Button title="계정 만들기" variant="ghost" onPress={() => router.push('/signup')} />
        </View>
        <Text style={styles.mode}>Auth: {getAuthModeLabel()}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.lg },
  brand: { fontSize: 28, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  form: { gap: spacing.sm },
  label: { color: colors.text, fontWeight: '600', marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
  },
  mode: { textAlign: 'center', color: colors.textMuted, fontSize: 12 },
});
