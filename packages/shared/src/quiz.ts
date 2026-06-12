// 어휘 퀴즈 문항 생성 + 난이도 조절 — plan: docs/plans/p1-p2-vocab-srs.md §1.2.5

export type WordLike = {
  id: string;
  lemma: string;
  pos: string;
  meaning_ko: string;
  example_en: string | null;
  difficulty: number; // 1~5
};

export type VocabQuizType = 'blank' | 'multiple_choice' | 'spelling';

export type QuizDifficulty = 'easy' | 'normal' | 'hard';

export type VocabQuestion = {
  type: VocabQuizType;
  word: WordLike;
  /** blank: 예문에서 lemma가 _____ 로 치환된 문장 / mcq: lemma / spelling: meaning_ko */
  prompt: string;
  /** blank: lemma 4개, mcq: meaning_ko 4개 (정답 포함, rng 셔플). spelling: [] */
  options: string[];
  answer: string;
};

export type Rng = () => number; // [0,1) — 테스트 주입용

/** 최근 정답 기록(boolean[], 최신이 마지막)으로 난이도: ≥80% hard, ≤50% easy, 그 외 normal. 표본 4개 미만은 normal */
export function difficultyFromRecent(recent: boolean[]): QuizDifficulty {
  if (recent.length < 4) return 'normal';
  const rate = recent.filter(Boolean).length / recent.length;
  if (rate >= 0.8) return 'hard';
  if (rate <= 0.5) return 'easy';
  return 'normal';
}

/** easy → difficulty ≤ 2, normal → ≤ 4, hard → 전체. 필터 결과가 비면 전체 반환 */
export function wordsForDifficulty(words: WordLike[], difficulty: QuizDifficulty): WordLike[] {
  const max = difficulty === 'easy' ? 2 : difficulty === 'normal' ? 4 : 5;
  const filtered = words.filter((w) => w.difficulty <= max);
  return filtered.length > 0 ? filtered : words;
}

/**
 * 오답 단어 추출: 같은 pos 우선, 부족하면 다른 pos로 채움.
 * 자기 자신 제외, lemma·meaning_ko 중복 제외. rng로 선택.
 */
export function pickDistractors(word: WordLike, pool: WordLike[], count: number, rng: Rng): WordLike[] {
  const picked: WordLike[] = [];

  const isEligible = (c: WordLike): boolean => {
    if (c.id === word.id) return false;
    if (c.lemma === word.lemma || c.meaning_ko === word.meaning_ko) return false;
    if (picked.some((p) => p.lemma === c.lemma || p.meaning_ko === c.meaning_ko)) return false;
    return true;
  };

  const drawFrom = (candidates: WordLike[]) => {
    let available = candidates.filter(isEligible);
    while (picked.length < count && available.length > 0) {
      const idx = Math.floor(rng() * available.length);
      picked.push(available[idx]);
      available = candidates.filter(isEligible);
    }
  };

  // 같은 pos 우선
  drawFrom(pool.filter((c) => c.pos === word.pos));
  // 부족하면 다른 pos로 채움
  if (picked.length < count) {
    drawFrom(pool.filter((c) => c.pos !== word.pos));
  }

  return picked;
}

/**
 * 문항 생성. 허용 유형:
 * - 신규 단어(isNewWord): spelling 제외
 * - blank는 example_en 있을 때만
 * - 허용 유형 중 rng로 선택, 보기 4개(blank→lemma, mcq→meaning_ko)
 */
function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildQuestion(
  word: WordLike,
  pool: WordLike[],
  opts: { isNewWord: boolean; rng: Rng },
): VocabQuestion {
  const { isNewWord, rng } = opts;

  const allowed: VocabQuizType[] = [];
  if (word.example_en) allowed.push('blank');
  allowed.push('multiple_choice');
  if (!isNewWord) allowed.push('spelling');

  const type = allowed[Math.floor(rng() * allowed.length)];

  if (type === 'spelling') {
    return {
      type,
      word,
      prompt: word.meaning_ko,
      options: [],
      answer: word.lemma,
    };
  }

  const distractors = pickDistractors(word, pool, 3, rng);

  if (type === 'blank') {
    const pattern = new RegExp(word.lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const prompt = (word.example_en ?? '').replace(pattern, '_____');
    const options = shuffle([word.lemma, ...distractors.map((d) => d.lemma)], rng);
    return { type, word, prompt, options, answer: word.lemma };
  }

  // multiple_choice
  const options = shuffle([word.meaning_ko, ...distractors.map((d) => d.meaning_ko)], rng);
  return { type, word, prompt: word.lemma, options, answer: word.meaning_ko };
}

/** 철자 정답 판정: trim + 소문자 비교 */
export function isSpellingCorrect(input: string, answer: string): boolean {
  return input.trim().toLowerCase() === answer.trim().toLowerCase();
}
