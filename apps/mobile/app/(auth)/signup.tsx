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
import { colors, spacing } from '@/constants/theme';
import { useAuthStore } from '@/lib/auth-store';

export default function SignupScreen() {
  const signUp = useAuthStore((s) => s.signUp);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async () => {
    if (!displayName.trim() || !email.trim() || password.length < 6) {
      Alert.alert('입력 오류', '이름, 이메일, 비밀번호(6자+)를 입력해 주세요.');
      return;
    }
    try {
      await signUp(email.trim(), password, displayName.trim());
      router.replace('/');
    } catch (e) {
      Alert.alert('가입 실패', e instanceof Error ? e.message : '다시 시도해 주세요.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TedMascot message="처음이구나! 나는 Ted야. 함께 영어 실력 키워보자." />
        <View style={styles.form}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            placeholder="Ted"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
          />
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
            placeholder="6자 이상"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
          <Button title="가입하기" onPress={onSubmit} loading={isLoading} />
          <Button title="로그인으로 돌아가기" variant="ghost" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.lg },
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
});
