import type { WordLike } from '@ted-voca/shared';

// 번들 단어팩 — local(mock) 모드의 단어 소스. Supabase 모드에서는 words 테이블 사용.
const pack = require('../../../../content/toeic-800-pack.json') as {
  course: { slug: string; title: string; description: string };
  words: {
    lemma: string;
    pos: string;
    meaning_ko: string;
    example_en: string;
    example_ko: string;
    difficulty: number;
    tags: string[];
    sort_order: number;
  }[];
};

export type Word = WordLike & {
  example_ko: string | null;
  tags: string[];
  sort_order: number;
};

export const COURSE_SLUG = pack.course.slug;
export const COURSE_TITLE = pack.course.title;

let cache: Word[] | null = null;

export function getBundledWords(): Word[] {
  if (!cache) {
    cache = pack.words.map((w) => ({
      id: `${pack.course.slug}:${w.lemma}`,
      lemma: w.lemma,
      pos: w.pos,
      meaning_ko: w.meaning_ko,
      example_en: w.example_en || null,
      example_ko: w.example_ko || null,
      difficulty: w.difficulty,
      tags: w.tags,
      sort_order: w.sort_order,
    }));
  }
  return cache;
}
