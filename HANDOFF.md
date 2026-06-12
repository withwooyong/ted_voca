# HANDOFF — Ted Voca

> 마지막 업데이트: 2026-06-12 (P3 완료)

## 현재 상태

**P0 ✅ → P1+P2 ✅ → P3 Grammar ✅** (ted-run 파이프라인 전체 통과)

로컬(Dev Mock) 모드에서 풀 루프 동작: 가입 → 온보딩 → 레벨 테스트(adaptive) →
어휘 퀴즈 3종 → SM-2 복습 → **문법 퀴즈 3유형(어순 배열·빈칸·오류 찾기) → 문법 사전(20토픽)**
→ XP/streak/통계. 레벨 테스트 weak_tags가 문법 추천(Ted 추천)에 연동됨.

## P3 산출물 (2026-06-12)

- `packages/shared/src/grammar.ts` — 어순 채점·셔플·세션 선택·추천 (vitest 18케이스, ADR-0004)
- 문법 콘텐츠 파이프라인: `scripts/grammar_content/batch_*.txt` → `generate_grammar_seed.py` →
  `content/grammar-pack.json` + `migrations/004_grammar.sql` (20토픽/200문항, 파서 unittest 16)
- 화면: `app/quiz/grammar.tsx`, `app/grammar-dict/{index,[slug]}.tsx`, learn 허브 문법 활성화 + Ted 추천
- `WordOrderBuilder` 컴포넌트 (칩 탭 배열, controlled)
- 데이터 레이어 문법 확장 (dual-mode, 어휘 난이도 입력 오염 방지 필터)

## 실행

```bash
cd apps/mobile && npm install && npm start    # Supabase 없이 Dev Mock으로 전체 동작
npm test                                       # jest 17
npm run lint && npm run typecheck
cd packages/shared && npm install && npm test  # vitest 67 (coverage 100%)
```

Supabase 사용 시: migrations 001→002(단어 510 시드)→003(level_test_done, enum) 순서로 적용 후 `.env` 설정.

## 이번 세션(P1+P2) 산출물

- `packages/shared/src/` — srs(SM-2)·quiz·xp·streak·leveltest 순수 로직 + vitest 67케이스 ([ADR-0001](docs/ADR/ADR-0001-srs-shared-pure-logic.md))
- `apps/mobile/lib/data/` — dual-mode repository (Supabase/local) ([ADR-0002](docs/ADR/ADR-0002-dual-mode-repository.md))
- 화면: 홈(실데이터)·학습 허브·어휘 퀴즈·세션 완료·SRS 복습·레벨 테스트·통계·프로필 확장
- `supabase/migrations/002`(단어 시드)·`003`(계약 보강), `scripts/generate_words_seed_sql.py`
- 테스트/빌드 인프라: vitest·jest-expo·eslint9·metro 모노레포 설정 ([ADR-0003](docs/ADR/ADR-0003-monorepo-resolution-test-infra.md))
- E2E: 웹 export + Playwright 8단계 통과 (XP 정산 수치 검증 포함)

## 주의 사항 (다음 세션에서 알아야 할 것)

1. **RTL v14는 render/fireEvent가 async** — 컴포넌트 테스트는 반드시 `await render(...)`
2. **`@ted-voca/shared`는 file: 의존성** — shared에 파일 추가 시 별도 빌드 불필요, 단 Metro 캐시 이슈 시 `npx expo start -c`
3. `lib/content/level-test.ts` 25문항 — **콘텐츠 human review 미완** (TODO 주석 참조)
4. 알려진 LOW 이슈(수용): vocab.tsx finishing이 state라 이론상 초고속 더블탭 틈, 001 `user_words.status` 기본값 'learning'(코드는 항상 명시 upsert라 무해 — P3 마이그레이션에서 'new'로 통일)
5. 저장소가 **git 미초기화** 상태였음 — 커밋 이력은 이 세션부터 시작

## 다음 작업

- **P4 Listening** (`docs/plans/p4-listening.md`) → `/ted-run docs/plans/p4-listening.md`
- 콘텐츠 human review: 레벨 테스트 25문항 + **문법 200문항** (`scripts/grammar_content/batch_*.txt` —
  수정 후 `python3 scripts/generate_grammar_seed.py` 재실행하면 JSON·SQL 동기 갱신)
- Supabase 사용 시 migration 004 적용 필요
