// 스피킹(회화) 공유 로직 — plan: docs/plans/p5-speaking-ai.md §1
// listening.ts / grammar.ts와 동일한 순수 함수·Like-타입·헤더 주석 스타일.

import { XP_SESSION_BONUS } from './xp';

// ── 타입 ────────────────────────────────────────────────────

export type SpeakingScenarioLike = {
  id: string;
  slug: string;
  title: string;
  context: string | null;
  difficulty: number;
  emoji: string;
  min_level: number;
  sort_order: number;
};

export type DialogueTurnLike = {
  id: string;
  scenario_slug: string;
  turn_order: number;
  speaker: 'ted' | 'user';
  text_en: string;
  hint_ko: string | null;
};

export type SpeakVerdict = 'natural' | 'ok' | 'awkward';

export type SpeakFeedback = {
  verdict: SpeakVerdict;
  correction: string;
  alternative: string;
};

// ── 상수 ────────────────────────────────────────────────────

/** 일일 AI 피드백 요청 한도 */
export const SPEAKING_DAILY_LIMIT = 10;
/** 단일 발화 최대 길이 (LLM 비용·악용 방지) */
export const SPEAKING_MAX_UTTERANCE_CHARS = 500;
/** user 턴 1개당 XP */
export const XP_PER_SPEAKING_TURN = 5;

// ── XP ──────────────────────────────────────────────────────

/** 스피킹 세션 XP: user 턴 0개면 0, 그 외 turn*5 + 세션 보너스(10) */
export function xpForSpeakingSession(userTurnCount: number): number {
  if (userTurnCount <= 0) return 0;
  return userTurnCount * XP_PER_SPEAKING_TURN + XP_SESSION_BONUS;
}

// ── 시나리오 ────────────────────────────────────────────────

/** 시나리오 잠금 여부: min_level > userLevel 이면 잠금 (경계 동일 시 해제) */
export function isScenarioLocked(s: SpeakingScenarioLike, userLevel: number): boolean {
  return s.min_level > userLevel;
}

/** 특정 시나리오의 턴만 turn_order 오름차순으로 반환 (불변 — 복사 후 정렬) */
export function turnsForScenario(turns: DialogueTurnLike[], slug: string): DialogueTurnLike[] {
  return turns
    .filter((t) => t.scenario_slug === slug)
    .slice()
    .sort((a, b) => a.turn_order - b.turn_order);
}

// ── 발화 비교 ───────────────────────────────────────────────

const PUNCTUATION_RE = /[.,!?;:'"]/g;

/**
 * 발화 정규화: trim → 소문자 → 구두점(. , ! ? ; : ' ") 제거 → 연속 공백 1개.
 * 구두점 제거 후 남는 공백을 정리하므로 순서가 중요.
 */
export function normalizeUtterance(s: string): string {
  return s
    .toLowerCase()
    .replace(PUNCTUATION_RE, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * 발화 유사도: 정규화 후 토큰 집합 Dice 계수.
 * - 빈 입력(정규화 후 토큰 0개)이면 0
 * - 어순 무관(집합 기반) — 동일 토큰집합이면 1
 * - Dice = 2|A∩B| / (|A|+|B|)
 */
export function compareUtterance(expected: string, actual: string): number {
  const a = new Set(normalizeUtterance(expected).split(' ').filter(Boolean));
  const b = new Set(normalizeUtterance(actual).split(' ').filter(Boolean));
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return (2 * intersection) / (a.size + b.size);
}

// ── 로컬 피드백 (mock 모드·LLM 폴백) ────────────────────────

/**
 * 규칙 기반 로컬 피드백 — Dice 유사도 임계로 verdict 결정.
 * - >=0.8 natural / >=0.4 ok / else awkward
 * - natural: correction은 칭찬 문구, ok/awkward: correction에 expected 원문 포함
 * - 모든 verdict에서 alternative는 비어있지 않은 문자열
 */
export function localFeedback(expected: string, user: string): SpeakFeedback {
  const similarity = compareUtterance(expected, user);
  if (similarity >= 0.8) {
    return {
      verdict: 'natural',
      correction: '아주 자연스러워요! 그대로 잘 하셨어요.',
      alternative: expected,
    };
  }
  if (similarity >= 0.4) {
    return {
      verdict: 'ok',
      correction: `좋아요! 이렇게 말해보세요: ${expected}`,
      alternative: expected,
    };
  }
  return {
    verdict: 'awkward',
    correction: `이렇게 말해보세요: ${expected}`,
    alternative: expected,
  };
}
