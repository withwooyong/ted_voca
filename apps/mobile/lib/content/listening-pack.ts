import type { ListeningClipLike, ListeningQuestionLike } from '@ted-voca/shared';

// 번들 리스닝팩 — local(mock) 모드 콘텐츠 소스 (grammar-pack.ts와 동일 패턴).
// scripts/generate_listening_seed.py 가 batch에서 생성.
const pack = require('../../../../content/listening-pack.json') as {
  clips: ListeningClipLike[];
  questions: ListeningQuestionLike[];
};

export function getBundledListeningClips(): ListeningClipLike[] {
  return pack.clips;
}

export function getBundledListeningQuestions(): ListeningQuestionLike[] {
  return pack.questions;
}
