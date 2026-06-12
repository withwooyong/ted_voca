import type { GrammarQuestionLike, GrammarTopicLike } from '@ted-voca/shared';

// 번들 문법팩 — local(mock) 모드 콘텐츠 소스 (word-pack.ts와 동일 패턴).
// scripts/generate_grammar_seed.py 가 batch 텍스트에서 생성.
const pack = require('../../../../content/grammar-pack.json') as {
  topics: GrammarTopicLike[];
  questions: (GrammarQuestionLike & { sort_order: number })[];
};

export function getBundledGrammarTopics(): GrammarTopicLike[] {
  return pack.topics;
}

export function getBundledGrammarQuestions(): GrammarQuestionLike[] {
  return pack.questions;
}
