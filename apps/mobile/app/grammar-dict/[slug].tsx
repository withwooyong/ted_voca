import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { getGrammarQuestions, getGrammarTopics } from '@/lib/data';
import type { GrammarTopicLike } from '@ted-voca/shared';

type Loaded = {
  topic: GrammarTopicLike;
  examples: string[];
};

export default function GrammarTopicScreen() {
  const params = useLocalSearchParams<{ slug?: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!slug) {
          if (alive) setError(true);
          return;
        }
        const [topics, questions] = await Promise.all([
          getGrammarTopics(),
          getGrammarQuestions(slug),
        ]);
        const topic = topics.find((t) => t.slug === slug);
        if (!topic) {
          if (alive) setError(true);
          return;
        }
        // word_order 정답 문장을 예문으로 2~3개 활용
        const examples = questions
          .filter((q) => q.question_type === 'word_order')
          .map((q) => q.answer)
          .slice(0, 3);
        if (alive) setLoaded({ topic, examples });
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>토픽을 불러오지 못했어.</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const { topic, examples } = loaded;

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headTitle} numberOfLines={1}>
          {topic.title}
        </Text>
        <View style={styles.spacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{topic.title}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{topic.cefr_level}</Text>
          </View>
        </View>

        <Card>
          <Text style={styles.explanation}>{topic.explanation}</Text>
        </Card>

        {examples.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>예문</Text>
            {examples.map((ex, i) => (
              <Card key={`${i}-${ex}`} style={styles.exampleCard}>
                <Text style={styles.exampleText}>{ex}</Text>
              </Card>
            ))}
          </View>
        )}

        <Button
          title="이 토픽 문제 풀기"
          onPress={() => router.push(`/quiz/grammar?topic=${topic.slug}`)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: { fontSize: 28, color: colors.text, width: 24 },
  headTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  spacer: { width: 24 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text },
  badge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  explanation: { fontSize: 15, lineHeight: 23, color: colors.text },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  exampleCard: { backgroundColor: colors.surfaceAlt },
  exampleText: { fontSize: 16, lineHeight: 24, color: colors.text, fontWeight: '600' },
});
