import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Flashcard } from '@/components/review/Flashcard';
import { TedMascot } from '@/components/TedMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import {
  completeSession,
  getDueWords,
  saveReview,
  type DueCard,
  type UserWordRow,
} from '@/lib/data';
import {
  previewIntervals,
  xpForReviewSession,
  type SrsGrade,
} from '@ted-voca/shared';

type QueueItem = DueCard & { requeued?: boolean };

type GradeResult = {
  lemma: string;
  grade: SrsGrade;
  row: UserWordRow;
};

type Phase = 'loading' | 'empty' | 'reviewing' | 'done' | 'error';

const GRADE_LABEL: Record<SrsGrade, string> = {
  again: '다시',
  hard: '어려움',
  good: '알맞음',
  easy: '쉬움',
};

const GRADE_COLOR: Record<SrsGrade, string> = {
  again: colors.error,
  hard: colors.accent,
  good: colors.success,
  easy: colors.primary,
};

const GRADE_ORDER: SrsGrade[] = ['again', 'hard', 'good', 'easy'];

export default function ReviewScreen() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<GradeResult[]>([]);
  const [total, setTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (isActive: () => boolean) => {
    setPhase('loading');
    setQueue([]);
    setIndex(0);
    setFlipped(false);
    setResults([]);
    try {
      const due = await getDueWords(new Date());
      if (!isActive()) return; // 포커스 이탈 후 setState 방지
      if (due.length === 0) {
        setPhase('empty');
        return;
      }
      setQueue(due.map((d) => ({ ...d })));
      setTotal(due.length);
      setPhase('reviewing');
    } catch (err) {
      if (!isActive()) return;
      console.error('[review] getDueWords failed', err);
      setPhase('error');
    }
  }, []);

  // 탭 재방문 시 새 큐 로드
  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const current = queue[index];

  async function onGrade(grade: SrsGrade) {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      const row = await saveReview(current.word.id, grade, new Date());
      const nextResults = [
        ...results,
        { lemma: current.word.lemma, grade, row },
      ];
      setResults(nextResults);

      // 'again' 카드는 세션 큐 맨 뒤에 재삽입 (단, 카드당 1회 제한)
      let nextQueue = queue;
      if (grade === 'again' && !current.requeued) {
        nextQueue = [...queue, { ...current, requeued: true }];
        setQueue(nextQueue);
      }

      const nextIndex = index + 1;
      if (nextIndex >= nextQueue.length) {
        await finish(nextResults);
      } else {
        setIndex(nextIndex);
        setFlipped(false);
      }
    } catch (err) {
      console.error('[review] saveReview failed', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function finish(finalResults: GradeResult[]) {
    const grades = finalResults.map((r) => r.grade);
    const itemsCorrect = grades.filter((g) => g !== 'again').length;
    const xpEarned = xpForReviewSession(grades);
    try {
      await completeSession({
        module: 'review',
        itemsCompleted: finalResults.length,
        itemsCorrect,
        xpEarned,
        now: new Date(),
      });
    } catch (err) {
      console.error('[review] completeSession failed', err);
    }
    setPhase('done');
  }

  if (phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (phase === 'error') {
    return (
      <View style={styles.center}>
        <TedMascot size={56} message="복습 큐를 불러오지 못했어. 다시 시도해 줘." />
        <Button title="다시 시도" onPress={() => load(() => true)} style={styles.actionBtn} />
      </View>
    );
  }

  if (phase === 'empty') {
    return (
      <View style={styles.center}>
        <TedMascot size={72} message="오늘 복습 끝! 새 단어를 배워볼까?" />
        <Button
          title="어휘 퀴즈 풀러 가기"
          onPress={() => router.push('/quiz/vocab')}
          style={styles.actionBtn}
        />
        <Button
          title="홈으로"
          variant="ghost"
          onPress={() => router.push('/(tabs)')}
          style={styles.actionBtn}
        />
      </View>
    );
  }

  if (phase === 'done') {
    const grades = results.map((r) => r.grade);
    const xpEarned = xpForReviewSession(grades);
    const schedule = buildSchedule(results);
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.doneContent}>
        <TedMascot size={72} message={`복습 끝! +${xpEarned} XP`} />
        <View style={styles.statRow}>
          <Card style={styles.statCard}>
            <Text style={[styles.statNum, { color: colors.primary }]}>+{xpEarned}</Text>
            <Text style={styles.statLbl}>획득 XP</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={[styles.statNum, { color: colors.success }]}>{results.length}</Text>
            <Text style={styles.statLbl}>처리한 카드</Text>
          </Card>
        </View>

        <Card>
          <Text style={styles.scheduleLabel}>다음 복습 스케줄</Text>
          {schedule.map((line) => (
            <Text key={line.bucket} style={styles.scheduleLine}>
              <Text style={styles.scheduleWord}>{line.words}</Text>
              {` — ${line.bucket}`}
            </Text>
          ))}
        </Card>

        <TedMascot
          size={44}
          message={'내일 아침에 푸시로 알려줄게. "Ted: 복습 1개 10분 컷!"'}
        />

        <Button
          title="홈으로"
          onPress={() => router.push('/(tabs)')}
          style={styles.actionBtn}
        />
      </ScrollView>
    );
  }

  // reviewing
  const intervals = current ? previewIntervals(current.state) : null;
  const progress = total > 0 ? Math.min(1, (index + 1) / Math.max(total, queue.length)) : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>🔄 오늘의 복습</Text>
        <Text style={styles.headerMeta}>
          {index + 1}/{queue.length}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {current ? (
        <Flashcard
          front={current.word.lemma}
          meaning={current.word.meaning_ko}
          pos={current.word.pos}
          example={current.word.example_en}
          flipped={flipped}
          onFlip={() => setFlipped((f) => !f)}
        />
      ) : null}

      {flipped && intervals ? (
        <>
          <View style={styles.gradeRow}>
            {GRADE_ORDER.map((grade) => (
              <GradeButton
                key={grade}
                grade={grade}
                interval={intervals[grade]}
                disabled={submitting}
                onPress={() => onGrade(grade)}
              />
            ))}
          </View>
          <Text style={styles.gradeHint}>
            버튼의 날짜 = SM-2가 계산한 다음 복습일 (투명한 스케줄)
          </Text>
        </>
      ) : (
        <Text style={styles.flipHint}>카드를 탭해서 뜻을 확인하고 평가해 줘</Text>
      )}
    </ScrollView>
  );
}

function GradeButton({
  grade,
  interval,
  disabled,
  onPress,
}: {
  grade: SrsGrade;
  interval: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = GRADE_COLOR[grade];
  return (
    <View style={styles.gradeBtnWrap}>
      <Button
        title={GRADE_LABEL[grade]}
        variant="secondary"
        disabled={disabled}
        onPress={onPress}
        style={StyleSheet.flatten([styles.gradeBtn, { borderColor: color }])}
      />
      <Text style={[styles.gradeInterval, { color }]}>{interval}</Text>
    </View>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

function bucketFor(row: UserWordRow, now: Date): { key: number; label: string } {
  const next = new Date(row.next_review_at).getTime();
  const diffMs = next - now.getTime();
  if (diffMs <= 60 * 60 * 1000) return { key: 0, label: '10분 뒤' };
  const days = Math.round(diffMs / DAY_MS);
  if (days <= 1) return { key: 1, label: '내일' };
  return { key: days, label: `${days}일 뒤` };
}

function buildSchedule(results: GradeResult[]): { bucket: string; words: string }[] {
  const now = new Date();
  const groups = new Map<number, { label: string; words: string[] }>();
  for (const r of results) {
    const { key, label } = bucketFor(r.row, now);
    const g = groups.get(key);
    if (g) {
      if (!g.words.includes(r.lemma)) g.words.push(r.lemma);
    } else {
      groups.set(key, { label, words: [r.lemma] });
    }
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g]) => ({ bucket: g.label, words: g.words.join(' · ') }));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  center: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionBtn: { alignSelf: 'stretch' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '800', color: colors.text },
  headerMeta: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 99 },
  flipHint: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    marginTop: spacing.sm,
  },
  gradeRow: { flexDirection: 'row', gap: spacing.sm },
  gradeBtnWrap: { flex: 1, alignItems: 'center', gap: 4 },
  gradeBtn: { width: '100%', paddingHorizontal: 4 },
  gradeInterval: { fontSize: 12, fontWeight: '700' },
  gradeHint: { textAlign: 'center', fontSize: 11.5, color: colors.textMuted },
  doneContent: {
    padding: spacing.md,
    gap: spacing.md,
    paddingBottom: spacing.xl,
    alignItems: 'stretch',
  },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800' },
  statLbl: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600', marginTop: 2 },
  scheduleLabel: {
    fontSize: 11.5,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  scheduleLine: { fontSize: 14, color: colors.text, lineHeight: 26 },
  scheduleWord: { fontWeight: '800', color: colors.primary },
});
