// 문법 퀴즈 채점·문항 로직 — plan: docs/plans/p3-grammar.md §1.2.1~2

import type { Rng } from './quiz';

export type GrammarQuestionType = 'word_order' | 'blank_choice' | 'error_find';

export type GrammarTopicLike = {
  slug: string;
  title: string;
  cefr_level: string; // A1~C1
  explanation: string;
  tags: string[];
  sort_order: number;
};

export type GrammarQuestionLike = {
  id: string;
  topic_slug: string;
  question_type: GrammarQuestionType;
  /** word_order: 한국어 해석 / blank_choice: ___ 포함 문장 / error_find: 한국어 지시문 */
  prompt: string;
  /** word_order: 정답 어순의 칩들 / blank_choice: 보기 / error_find: 문장 조각들 */
  options: string[];
  /** word_order: 정답 문장 / blank_choice·error_find: 정답 보기 텍스트 */
  answer: string;
  explanation: string;
};

/** 채점용 정규화: trim, 연속 공백 1개로, 소문자, 문장 끝 구두점(. ! ?) 제거 */
export function normalizeAnswer(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/[.!?]+$/, '');
}

/** 칩 배열을 이은 문장이 정답 문장과 일치하는가 (정규화 비교) */
export function checkWordOrder(picked: string[], answer: string): boolean {
  return normalizeAnswer(picked.join(' ')) === normalizeAnswer(answer);
}

/**
 * 칩 셔플: rng 기반. 칩이 2개 이상이고 순열이 1개가 아니면
 * 정답 순서 그대로 나오지 않도록 보장 (재셔플)
 */
export function shuffleChips(chips: string[], rng: Rng): string[] {
  if (chips.length <= 1) return [...chips];

  // Fisher-Yates
  const arr = [...chips];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // 모든 칩이 동일하면 어떤 순서든 정답과 같으므로 그대로 둔다.
  const allSame = chips.every((c) => c === chips[0]);
  if (!allSame && arr.join(' ') === chips.join(' ')) {
    // rng가 항등 셔플을 만든 경우 결정적 회피: 첫 칩을 맨 뒤로 회전
    const rotated = arr.slice(1);
    rotated.push(arr[0]);
    return rotated;
  }

  return arr;
}

/** 유형 무관 통합 채점: word_order는 '|' join된 picked, 그 외는 보기 텍스트 비교 */
export function isGrammarCorrect(q: GrammarQuestionLike, userAnswer: string | string[]): boolean {
  if (q.question_type === 'word_order') {
    const picked = Array.isArray(userAnswer) ? userAnswer : [userAnswer];
    return checkWordOrder(picked, q.answer);
  }
  const text = Array.isArray(userAnswer) ? userAnswer.join(' ') : userAnswer;
  return text.trim() === q.answer.trim();
}

/**
 * 세션 문항 선택: count개, rng 셔플, 중복 제거.
 * weakTags와 토픽 tags가 겹치는 문항을 앞쪽에 우선 배치.
 * (유형 인터리빙은 미구현 — 향후 개선 후보)
 */
export function pickGrammarSession(
  questions: GrammarQuestionLike[],
  topics: GrammarTopicLike[],
  count: number,
  rng: Rng,
  weakTags?: string[],
): GrammarQuestionLike[] {
  const shuffle = (items: GrammarQuestionLike[]): GrammarQuestionLike[] => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  const tagsBySlug = new Map(topics.map((t) => [t.slug, t.tags]));
  const weak = new Set(weakTags ?? []);
  const isWeak = (q: GrammarQuestionLike): boolean => {
    if (weak.size === 0) return false;
    const tags = tagsBySlug.get(q.topic_slug) ?? [];
    return tags.some((t) => weak.has(t));
  };

  // weakTags 매칭 문항을 앞쪽에 우선 배치, 각 그룹은 rng 셔플
  const weakQuestions = shuffle(questions.filter(isWeak));
  const restQuestions = shuffle(questions.filter((q) => !isWeak(q)));
  const ordered = [...weakQuestions, ...restQuestions];

  // 중복 제거 후 count개로 자르기
  const seen = new Set<string>();
  const result: GrammarQuestionLike[] = [];
  for (const q of ordered) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    result.push(q);
    if (result.length >= count) break;
  }
  return result;
}

/** Learn 허브 "Ted 추천": weak_tags와 tags 교집합이 있는 토픽 (sort_order 순) */
export function recommendTopics(topics: GrammarTopicLike[], weakTags: string[]): GrammarTopicLike[] {
  const weak = new Set(weakTags);
  if (weak.size === 0) return [];
  return topics
    .filter((t) => t.tags.some((tag) => weak.has(tag)))
    .sort((a, b) => a.sort_order - b.sort_order);
}
