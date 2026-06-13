import type { DialogueTurnLike, SpeakingScenarioLike } from '@ted-voca/shared';

// 번들 스피킹팩 — local(mock) 모드 콘텐츠 소스 (listening-pack.ts와 동일 패턴).
// scripts/generate_speaking_seed.py 가 batch에서 생성.
const pack = require('../../../../content/speaking-pack.json') as {
  scenarios: SpeakingScenarioLike[];
  turns: DialogueTurnLike[];
};

export function getBundledSpeakingScenarios(): SpeakingScenarioLike[] {
  return pack.scenarios;
}

export function getBundledDialogueTurns(): DialogueTurnLike[] {
  return pack.turns;
}
