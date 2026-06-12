import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { getGrammarTopics, getLocalProfileProgress } from '@/lib/data';
import { recommendTopics, type GrammarTopicLike } from '@ted-voca/shared';

export default function GrammarDictScreen() {
  const [topics, setTopics] = useState<GrammarTopicLike[] | null>(null);
  const [weakTags, setWeakTags] = useState<string[]>([]);
  const [error, setError] = useState(false);

  // 재방문 시 weak_tags 갱신 반영 (레벨 테스트 직후 추천 변경)
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [list, progress] = await Promise.all([
            getGrammarTopics(),
            getLocalProfileProgress(),
          ]);
          if (!alive) return;
          setTopics(list);
          setWeakTags(progress.weak_tags);
        } catch {
          if (alive) setError(true);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const recommended = useMemo(
    () => (topics ? recommendTopics(topics, weakTags) : []),
    [topics, weakTags],
  );

  // CEFR 레벨로 그룹핑 (레벨 오름차순, 같은 레벨은 sort_order)
  const grouped = useMemo(() => {
    if (!topics) return [];
    const map = new Map<string, GrammarTopicLike[]>();
    for (const t of topics) {
      const arr = map.get(t.cefr_level) ?? [];
      arr.push(t);
      map.set(t.cefr_level, arr);
    }
    return [...map.entries()]
      .map(([level, items]) => ({
        level,
        items: [...items].sort((a, b) => a.sort_order - b.sort_order),
      }))
      .sort((a, b) => a.level.localeCompare(b.level));
  }, [topics]);

  const renderRow = (topic: GrammarTopicLike) => (
    <Pressable key={topic.slug} onPress={() => router.push(`/grammar-dict/${topic.slug}`)}>
      <Card style={styles.row}>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{topic.title}</Text>
          <Text style={styles.rowDesc} numberOfLines={1}>
            {topic.explanation}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{topic.cefr_level}</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Card>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>문법 사전</Text>
        <View style={styles.spacer} />
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>토픽을 불러오지 못했어. 잠시 후 다시 시도해줘.</Text>
        </View>
      ) : !topics ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : topics.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>아직 등록된 문법 토픽이 없어.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {recommended.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Ted 추천</Text>
              {recommended.map(renderRow)}
            </View>
          )}
          {grouped.map((group) => (
            <View key={group.level} style={styles.section}>
              <Text style={styles.sectionTitle}>{group.level}</Text>
              {group.items.map(renderRow)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  back: { fontSize: 28, color: colors.text, width: 24 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  spacer: { width: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  rowDesc: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  badge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  chevron: { color: colors.textMuted, fontSize: 20 },
});
