import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { QuizOption, QuizOptionState } from '@/components/quiz/QuizOption';
import { TedMascot } from '@/components/TedMascot';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/constants/theme';
import { LEVEL_TEST_QUESTIONS } from '@/lib/content/level-test';
import { completeSession, saveLevelTestResult } from '@/lib/data';
import {
  nextDifficulty,
  scoreLevelTest,
  type LevelTestAnswer,
  type LevelTestQuestion,
  type LevelTestResult,
} from '@ted-voca/shared';

const TEST_SIZE = 20;
const START_DIFFICULTY = 3;

type Stage = 'intro' | 'quiz' | 'result';

const TAG_LABELS: Record<string, string> = {
  tense: '⏱️ 시제',
  'business-vocab': '💼 비즈니스 어휘',
  'daily-vocab': '🗣️ 일상 어휘',
  'grammar-articles': '📐 관사',
  'grammar-prepositions': '📐 전치사',
  'grammar-conditionals': '📐 가정법',
  'grammar-subjunctive': '📐 가정법(현재)',
  'grammar-relative': '📐 관계대명사',
  'listening-liaison': '🎧 연음 듣기',
};

const CEFR_NOTE: Record<string, string> = {
  A1: 'CEFR 기준 · 입문 (토익 ~300 수준)',
  A2: 'CEFR 기준 · 초급 (토익 300~450 수준)',
  B1: 'CEFR 기준 · 중급 (토익 450~650 수준)',
  B2: 'CEFR 기준 · 중상급 (토익 650~800 수준)',
  C1: 'CEFR 기준 · 상급 (토익 800+ 수준)',
};

/** 해당 난이도의 미사용 문항, 없으면 가까운 난이도로 폴백 */
function pickQuestion(
  targetDifficulty: number,
  usedIds: Set<string>,
): LevelTestQuestion | null {
  for (let spread = 0; spread <= 4; spread++) {
    for (const diff of spread === 0 ? [targetDifficulty] : [targetDifficulty - spread, targetDifficulty + spread]) {
      if (diff < 1 || diff > 5) continue;
      const candidate = LEVEL_TEST_QUESTIONS.find(
        (q) => q.difficulty === diff && !usedIds.has(q.id),
      );
      if (candidate) return candidate;
    }
  }
  return null;
}

export default function LevelTestScreen() {
  const [stage, setStage] = useState<Stage>('intro');
  const [current, setCurrent] = useState<LevelTestQuestion | null>(null);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [result, setResult] = useState<LevelTestResult | null>(null);
  const [saving, setSaving] = useState(false);

  const answers = useRef<LevelTestAnswer[]>([]);
  const usedIds = useRef<Set<string>>(new Set());
  const startedAt = useRef(0); // start()에서 설정 (렌더 중 impure 호출 금지 — react-hooks/purity)

  const sessionCount = Math.min(TEST_SIZE, LEVEL_TEST_QUESTIONS.length);

  const start = () => {
    answers.current = [];
    usedIds.current = new Set();
    startedAt.current = new Date().getTime();
    const first = pickQuestion(START_DIFFICULTY, usedIds.current);
    if (!first) return;
    usedIds.current.add(first.id);
    setCurrent(first);
    setIndex(0);
    setAnswered(false);
    setPicked(null);
    setStage('quiz');
  };

  const optionState = (label: string): QuizOptionState => {
    if (!answered || !current) return 'default';
    if (label === current.answer) return lastCorrect ? 'correct' : 'revealed';
    if (label === picked) return 'wrong';
    return 'default';
  };

  const answer = (opt: string) => {
    if (answered || !current) return;
    const correct = opt === current.answer;
    setPicked(opt);
    setLastCorrect(correct);
    setAnswered(true);
    answers.current.push({ question: current, correct });
  };

  const finish = async () => {
    const res = scoreLevelTest(answers.current);
    setResult(res);
    setStage('result');
    setSaving(true);
    try {
      const now = new Date();
      await saveLevelTestResult({ cefr: res.cefr, weakTags: res.weakTags, now });
      await completeSession({
        module: 'level_test',
        itemsCompleted: answers.current.length,
        itemsCorrect: answers.current.filter((a) => a.correct).length,
        xpEarned: 0,
        now,
        durationSeconds: Math.round((now.getTime() - startedAt.current) / 1000),
      });
    } catch {
      // 저장 실패해도 결과는 보여준다 (mock 모드에선 실패 거의 없음)
    } finally {
      setSaving(false);
    }
  };

  const next = () => {
    if (!current) return;
    const last = answers.current[answers.current.length - 1];
    const reachedEnd = answers.current.length >= sessionCount;

    if (reachedEnd) {
      finish();
      return;
    }

    const targetDiff = nextDifficulty(current.difficulty, last.correct);
    const nextQ = pickQuestion(targetDiff, usedIds.current);
    if (!nextQ) {
      // 더 낼 문항이 없으면 조기 종료
      finish();
      return;
    }
    usedIds.current.add(nextQ.id);
    setCurrent(nextQ);
    setIndex((i) => i + 1);
    setAnswered(false);
    setPicked(null);
  };

  // ── 인트로 ──────────────────────────────────────────
  if (stage === 'intro') {
    return (
      <View style={styles.container}>
        <View style={styles.introBody}>
          <TedMascot
            size={56}
            message={'실력을 알아야 딱 맞는 코스를 줄 수 있어!\n20문항, 약 5분이면 끝나.'}
          />
          <Card>
            <Text style={styles.introText}>
              · 어휘 / 문법 / 리스닝 혼합 출제{'\n'}
              · 정답률에 따라 난이도가 자동 조절돼요 (adaptive){'\n'}
              · 결과로 CEFR 추정 레벨과 약점 태그를 알려드려요
            </Text>
          </Card>
        </View>
        <View style={styles.dock}>
          <Button title="테스트 시작" onPress={start} />
          <Button
            title="나중에 하기"
            variant="ghost"
            onPress={() => router.back()}
            style={styles.gap}
          />
        </View>
      </View>
    );
  }

  // ── 결과 ────────────────────────────────────────────
  if (stage === 'result' && result) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.resultBody}>
          <TedMascot size={56} message="수고했어! 지금 실력에 맞춰 코스를 준비했어 🎯" />
          <Card style={styles.cefrCard}>
            <Text style={styles.statLabel}>추정 레벨</Text>
            <Text style={styles.cefrText}>{result.cefr}</Text>
            <Text style={styles.cefrNote}>{CEFR_NOTE[result.cefr]}</Text>
          </Card>
          <Card>
            <Text style={styles.sectionLabel}>약점 태그 — 복습에 우선 반영돼요</Text>
            {result.weakTags.length === 0 ? (
              <Text style={styles.muted}>뚜렷한 약점이 없어! 골고루 잘했어 👏</Text>
            ) : (
              <View style={styles.chips}>
                {result.weakTags.map((tag) => (
                  <View key={tag} style={styles.chip}>
                    <Text style={styles.chipText}>{TAG_LABELS[tag] ?? tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </ScrollView>
        <View style={styles.dock}>
          <Button
            title="맞춤 코스 시작"
            loading={saving}
            onPress={() => router.replace('/(tabs)')}
          />
        </View>
      </View>
    );
  }

  // ── 진행 ────────────────────────────────────────────
  if (!current) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>문항을 준비하지 못했어.</Text>
        <Button title="뒤로" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.head}>
        <Text style={styles.title}>실력 진단</Text>
        <Text style={styles.meta}>
          {index + 1}/{sessionCount}
        </Text>
        <Pressable
          onPress={() =>
            Alert.alert('진단 그만두기', '지금 나가면 결과가 저장되지 않아. 그만둘까?', [
              { text: '계속 풀기', style: 'cancel' },
              { text: '그만두기', style: 'destructive', onPress: () => router.back() },
            ])
          }
          hitSlop={12}
          accessibilityRole="button">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[styles.progressFill, { width: `${((index + 1) / sessionCount) * 100}%` }]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.prompt}>{current.prompt}</Text>
        {current.sentence ? <Text style={styles.sentence}>{current.sentence}</Text> : null}
        <View style={styles.options}>
          {current.options.map((opt) => (
            <QuizOption
              key={opt}
              label={opt}
              state={optionState(opt)}
              disabled={answered}
              onPress={() => answer(opt)}
            />
          ))}
        </View>
      </ScrollView>

      {answered && (
        <View style={[styles.sheet, lastCorrect ? styles.sheetGood : styles.sheetBad]}>
          <Text style={styles.verdict}>{lastCorrect ? '✅ 정답!' : '❌ 아쉬워요'}</Text>
          <Text style={styles.expl}>{current.explanation}</Text>
          <Button title="계속 →" onPress={next} />
        </View>
      )}
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
  introBody: { flex: 1, justifyContent: 'center', gap: spacing.lg, padding: spacing.lg },
  introText: { fontSize: 14, lineHeight: 24, color: colors.textMuted },
  dock: { padding: spacing.lg, gap: spacing.sm },
  gap: { marginTop: spacing.xs },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  close: { fontSize: 20, color: colors.textMuted },
  progressTrack: {
    height: 6,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.primary },
  body: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  prompt: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  sentence: { fontSize: 19, lineHeight: 28, color: colors.text, fontWeight: '600' },
  options: { gap: spacing.sm, marginTop: spacing.sm },
  sheet: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetGood: { backgroundColor: '#ECFDF5' },
  sheetBad: { backgroundColor: '#FEF2F2' },
  verdict: { fontSize: 17, fontWeight: '800', color: colors.text },
  expl: { fontSize: 14, lineHeight: 21, color: colors.text },
  resultBody: { padding: spacing.lg, gap: spacing.md },
  cefrCard: { alignItems: 'center', paddingVertical: spacing.lg },
  statLabel: { fontSize: 12, color: colors.textMuted },
  cefrText: { fontSize: 44, fontWeight: '800', color: colors.primary, marginVertical: 4 },
  cefrNote: { fontSize: 13, color: colors.textMuted },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  muted: { fontSize: 14, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, color: colors.primary, fontWeight: '600' },
});
