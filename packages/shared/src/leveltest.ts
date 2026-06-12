// 레벨 테스트 — 20문항, 정답률 기반 난이도 조절, CEFR + weak_tags 산출
// plan: docs/plans/p1-p2-vocab-srs.md §1.2.4

export type LevelTestQuestion = {
  id: string;
  module: 'vocab' | 'grammar' | 'listening';
  difficulty: number; // 1~5
  tags: string[];
  prompt: string;
  /** 예문/지문 (없으면 null) */
  sentence: string | null;
  options: string[];
  answer: string;
  explanation: string;
};

export type LevelTestAnswer = {
  question: LevelTestQuestion;
  correct: boolean;
};

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';

export type LevelTestResult = {
  cefr: Cefr;
  /** 가중 점수 0~1: Σ(정답 difficulty) / Σ(전체 difficulty) */
  score: number;
  weakTags: string[];
};

/** 다음 문항 난이도: 정답 → +1, 오답 → -1 (1~5 클램프) */
export function nextDifficulty(current: number, correct: boolean): number {
  const next = current + (correct ? 1 : -1);
  return Math.max(1, Math.min(5, next));
}

/** score 경계: <0.2 A1, <0.4 A2, <0.6 B1, <0.8 B2, ≥0.8 C1 */
export function cefrFromScore(score: number): Cefr {
  if (score < 0.2) return 'A1';
  if (score < 0.4) return 'A2';
  if (score < 0.6) return 'B1';
  if (score < 0.8) return 'B2';
  return 'C1';
}

/** weak tag: 해당 tag 문항 2개 이상 && 정답률 < 0.6 */
export function scoreLevelTest(answers: LevelTestAnswer[]): LevelTestResult {
  if (answers.length === 0) {
    return { cefr: 'A1', score: 0, weakTags: [] };
  }

  const totalDifficulty = answers.reduce((sum, a) => sum + a.question.difficulty, 0);
  const correctDifficulty = answers
    .filter((a) => a.correct)
    .reduce((sum, a) => sum + a.question.difficulty, 0);
  const score = totalDifficulty > 0 ? correctDifficulty / totalDifficulty : 0;

  const tagStats = new Map<string, { total: number; correct: number }>();
  for (const a of answers) {
    for (const tag of a.question.tags) {
      const stat = tagStats.get(tag) ?? { total: 0, correct: 0 };
      stat.total += 1;
      if (a.correct) stat.correct += 1;
      tagStats.set(tag, stat);
    }
  }

  const weakTags: string[] = [];
  for (const [tag, stat] of tagStats) {
    if (stat.total >= 2 && stat.correct / stat.total < 0.6) {
      weakTags.push(tag);
    }
  }

  return { cefr: cefrFromScore(score), score, weakTags };
}
