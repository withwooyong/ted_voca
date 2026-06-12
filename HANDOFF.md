# Session Handoff

> Last updated: 2026-06-12 17:41 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `74f8da2` - P3 Grammar — 문법 퀴즈 3유형·사전·콘텐츠 파이프라인

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 Grammar ✅** — 로컬(Dev Mock) 모드에서 풀 루프 동작:
가입 → 온보딩 → 레벨 테스트(adaptive) → 어휘 퀴즈 3종 → SM-2 복습 → 문법 퀴즈 3유형 →
문법 사전(20토픽) → XP/streak/통계. 모든 변경 커밋·푸시 완료, 미커밋 작업 없음.

## Completed This Session

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 인터랙티브 프로토타입 (P0~P6 전체 동선 클릭 모형) | `4e7d761` | docs/prototype/index.html |
| 2 | P1~P6 작업계획서 일괄 작성 + MASTER-PLAN 로드맵 연결 | `4e7d761` | docs/plans/p1-p2…p6, docs/MASTER-PLAN.md |
| 3 | P1+P2: SM-2 SRS·어휘 퀴즈 3종·레벨 테스트·통계·단어 시드 510·테스트 인프라 (ted-run 풀 파이프라인) | `4e7d761` | packages/shared, apps/mobile/lib·app, migrations/002·003, ADR-0001~0003 |
| 4 | git init + GitHub repo 생성(withwooyong/ted_voca) | `4e7d761` | — |
| 5 | P3: 문법 퀴즈 3유형·사전·콘텐츠 파이프라인 20토픽/200문항 (ted-run 풀 파이프라인) | `74f8da2` | app/quiz/grammar.tsx, app/grammar-dict/, shared/grammar.ts, scripts/grammar_content/, migrations/004, ADR-0004 |
| 6 | repo public 전환 + 푸시 | `74f8da2` | — |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | P4 Listening | ⬜ 미착수 | `/ted-run docs/plans/p4-listening.md` — P3와 독립, 바로 진입 가능 |
| 2 | 콘텐츠 human review | 🟡 대기 | 문법 200문항(`scripts/grammar_content/batch_*.txt`) + 레벨테스트 25문항(`lib/content/level-test.ts`). batch 수정 후 `python3 scripts/generate_grammar_seed.py` 재실행 시 JSON·SQL 동기 갱신 |
| 3 | Supabase 실서버 마이그레이션 | ⬜ 대기 | 001→002→003→004 순서 적용 (Supabase 프로젝트 생성 시) |
| 4 | P5 Speaking / P6 Gamification | ⬜ 미착수 | P5는 외부 API(Edge Function) — plan doc 참조 |

## Key Decisions Made

- **SM-2 등 학습 로직은 packages/shared 순수 함수** — 시간 주입(now 파라미터), vitest 전수 검증 (ADR-0001)
- **데이터 레이어 dual-mode repository** — 화면은 `@/lib/data`만 import, Supabase/AsyncStorage 분기 일원화 (ADR-0002)
- **@ted-voca/shared는 file: 의존성 + Metro watchFolders** — tsconfig paths만으로는 Metro가 못 풀어 런타임 깨짐 (ADR-0003)
- **문법 콘텐츠는 batch 텍스트 단일 소스 → JSON+SQL 이중 출력** — local/remote 콘텐츠 불일치 구조적 차단 (ADR-0004)
- **문법은 SRS 비대상 (v1.0)** — v1.1에서 어휘 SRS와 통합 검토 (ADR-0004)
- **어순 UI는 드래그가 아닌 칩 탭 배열** — 프로토타입 검증 결정

## Known Issues

- 문법 200문항·레벨테스트 25문항은 AI 초안 — human review 전 (`# TODO(content-review)` 표기)
- `001_initial_schema.sql`의 `user_words.status` DEFAULT 'learning' vs 코드 initial 'new' — 코드가 항상 명시 upsert라 무해, 다음 마이그레이션에서 통일 예정
- RTL v14는 `render`/`fireEvent`가 **async** — 컴포넌트 테스트는 반드시 `await` (ADR-0003)
- `react-hooks/purity` 룰이 컴포넌트 스코프 `Date.now()`를 플래그 — 핸들러에서 `new Date()` 생성·재사용 컨벤션
- 첫 push 시 "remote end hung up" 발생 이력 → `http.postBuffer` 150MB로 로컬 설정해 해결됨

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱을 Phase 단위로 완성. 실행 전략은 "계획 일괄, 실행 단계별" — ted-run 4회 분할(P1+P2 / P3·P4 / P5 / P6) 중 2회 완료
- **개발 방식**: `/ted-run <plan doc>` 풀 파이프라인 (TDD red→green, opus 병렬 구현, sonnet 독립 리뷰→전건 수정→재리뷰, 5관문 검증, 웹 export+Playwright E2E, ADR/커밋). 이 방식 유지 권장
- **제약·선호**: 커밋 메시지 한글, 커밋·푸시 분리 확인(글로벌 규칙), Expo SDK 56 — 코드 작성 전 versioned docs 확인(AGENTS.md)
- **실행/검증 명령**: `apps/mobile`: `npm start`(Dev Mock 전체 동작) / `npm test`(jest 28) / `npm run lint·typecheck`; `packages/shared`: `npm test`(vitest 85, cov 98.7%); E2E는 `npx expo export --platform web` + `expo serve dist` + Playwright(python) 패턴 — /tmp/proto_shot/ted_e2e*.py 참조(휘발성)
- **다음 착수점**: P4 Listening — expo-speech 실시간 TTS(오디오 파일 없음), `listening_questions` 테이블 신설(migration 005), Memory Booster. p4-listening.md에 상세 스펙 있음

## Files Modified This Session

- `4e7d761` 초기 커밋: 113 files (P0+기획문서+프로토타입+P1+P2 전체)
- `74f8da2` P3: 24 files changed, +5,780 / −14
- 세션 마무리 문서 정리(본 handoff): CHANGELOG.md 신규, HANDOFF.md 재작성, plan doc 체크리스트·MASTER-PLAN 로드맵 현행화
