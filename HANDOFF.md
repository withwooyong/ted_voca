# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `b77fc95` v1.1 리그 group_no 분할

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ → P6 Gamification ✅ → v1.1 리그 group_no 분할 ✅(코드)**
v1.0 전 Phase 코드 완결 + v1.1 첫 항목(리그 그룹 분할) 코드 완결.
로컬(Dev Mock) 풀 루프: 가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 →
문법 퀴즈/사전 → 리스닝 + Memory Booster → 회화 시나리오(TTS→STT→LLM/규칙 피드백) →
주간 리그(티어·랭킹·승강등·**그룹 분할**) + 로컬 알림 3종 + 오프라인 캐시·sync → XP/streak/통계.
**남은 것은 실서버 배포·실기기 검증·스토어 실제 제출(외부 인프라/계정/자산) + 그룹 분할 실데이터 검증.**

## Completed This Session (v1.1 리그 group_no 분할 — `b77fc95`)

ADR-0007 §3의 "tier=그룹" 단순화를 해소. 각 tier를 `LEAGUE_GROUP_SIZE(30)`명 단위 그룹으로 쪼개
랭킹·승강등·보드를 `(tier, group_no)` 단위로 동작시킴.

| # | Task | Files |
|---|------|-------|
| 1 | shared 그룹 배정 순수 함수 2종 + 테스트 | packages/shared/src/league.ts(`assignGroupNos`/`pickGroupNoForNewEntry`/`group_no?`), tests/league.test.ts(+15, vitest 213→228) |
| 2 | migration 008 — group_no 컬럼 + RPC 3종 그룹 스코프 교체 | supabase/migrations/008_league_groups.sql (007 idempotent 패턴, shared 1:1 주석) |
| 3 | 데이터 레이어 group_no 노출 | lib/data/{types,remote,local}.ts(`LeagueSummary.groupNo`), components/league/LeagueBoard.tsx·app/league.tsx(그룹 라벨), __tests__/data-league.test.ts(+1) |
| 4 | 검증·문서·커밋 | vitest 228·jest 201·typecheck·expo export web 전건 PASS, ADR-0008, CHANGELOG/HANDOFF/MASTER-PLAN |

### 설계 핵심 (ADR-0008)
- **경쟁 단위 = (tier, group_no)** — 랭킹/승강등 PARTITION을 `(tier)`→`(tier, group_no)`. `outcomeForRank`/`nextTier`는 그대로(rank·cnt만 그룹 기준). shared 순수 함수는 이미 "한 그룹"을 받으므로 시그니처 불변.
- **배정 기준 = user_id ASC 정렬 후 30명씩 chunk** — `finalize_league` 다음 주 시드 시 새 tier별 `floor((row_number-1)/30)`. 결정적(replay 안전)·실력 무관 분산. snake-draft 균형은 v1.2.
- **신규/첫 주 엔트리** — `increment_league_xp` INSERT 경로에서 `pickGroupNoForNewEntry`(여유<30 최소 group_no→max+1→0). ON CONFLICT는 group_no 미변경.
- **승강등 시 재편** — 다음 주 group_no는 새 tier 기준 전원 재chunk → tier 바뀐 유저도 자연 합류.

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **Supabase 실서버 마이그레이션** | ⬜ 대기 | 001→…→007→**008** 순서. **007은 pg_cron Extension 활성화 필요**(Dashboard→Database→Extensions). **008은 007 이후 실행**(league_entries·함수 전제, pg_cron 함수만 교체되어 재등록 불필요) |
| 2 | Edge Function 실배포(P5) | ⬜ 대기 | `supabase functions deploy speak-feedback` + `supabase secrets set OPENAI_API_KEY=...` |
| 3 | EAS 실빌드·스토어 제출 | ⬜ 대기 | `eas build --profile preview/production` + TestFlight/내부트랙. Apple/Google 계정·서명·아이콘/스크린샷 실자산 필요(eas.json·정책 문서는 작성됨, 플레이스홀더 실값 교체) |
| 4 | 실기기 검증(P4·P5·P6) | 🟡 대기 | P4 iOS 무음 스위치, P5 마이크·실 STT, P6 로컬 알림·오프라인 sync |
| 5 | **리그 그룹 분할 실데이터 검증(v1.1)** | 🟡 대기 | 008 적용 후 유저 30명+ 환경에서 그룹 분할·보드 격리·주간 정산 group_no 재편 확인 |
| 6 | 콘텐츠 human review | 🟡 대기 | 회화 10 + 리스닝 50 + 문법 200 + 레벨테스트 25 (AI 초안). batch 수정 → generate 스크립트 재실행 |
| 7 | v1.1 원격 푸시 발송 | ⬜ 후순위 | push_tokens 기반 서버 발송(현재 토큰 수집만) |
| 8 | v1.1 유료 구독 결제(IAP) | ⬜ 후순위 | App Store/Play Store 결제·상점 |

## Known Issues

- **그룹 분할 동시 INSERT 초과**: 두 신규 유저가 동시에 같은 group_no를 골라 30명을 살짝 넘길 수 있음 — 보드·랭킹은 정상(경미한 불균형, "미달/초과 허용" 단순화). v1.2에서 배정 잠금/재조정 여지(ADR-0008)
- **SQL 로컬 테스트 파이프라인 없음** — migration 008은 수동 SQL Editor 적용. shared 1:1 대응 + 리뷰 라인 대조로 정합성 보장(007 전략 계승)
- 007 적용 전 pg_cron 미활성이면 `CREATE EXTENSION pg_cron` 실패 가능(플랜별) — cron 블록만 수동 처리, 나머지 독립 실행 가능
- 웹은 오프라인 캐시 미지원(db.web.ts no-op) — 의도된 네이티브 전용
- completeSession 이중 호출 시 리그 XP 이중적립 이론상 가능 — 더블탭 가드(finishingRef)로 완화, 완전 멱등 미적용
- npm audit: mobile 11 moderate(@expo 빌드타임 전이)·shared 6 high(vitest 1.x 전이) — 런타임 비도달·exception
- 회화 10·리스닝 50·문법 200은 AI 초안 — human review 전

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — v1.0 전 Phase 코드 완결. 현재 "배포·검증·출시" 단계 + v1.1 기능 확장 진행 중(group_no 분할 완료)
- **즉시 할 일 후보**: ① v1.1 다음 항목 — 원격 푸시 발송 파이프라인 또는 유료 구독 결제(IAP) ② 배포 절차 점검·가이드화(Supabase 001~008 적용·pg_cron·Edge·EAS) ③ 콘텐츠 human review ④ 실서버 배포 후 그룹 분할 실데이터 검증
- **개발 방식**: `/ted-run <plan doc>` 또는 plan 모드 → TDD → 구현 → 이중 리뷰 → 5관문 → ADR/커밋. shared 순수 함수 ↔ SQL 1:1 일치 원칙 유지(007·008 주석 방식)
- **제약·선호**: 커밋 한글, **커밋·푸시 분리**(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md)
- **검증 명령**: `packages/shared`: `npx vitest run`(228); `apps/mobile`: `npx jest`(201) / `npm run typecheck`·`npm run lint`; web: `npx expo export --platform web` → `npx expo serve dist`
- **migration 번호**: 001 schema, 002 words seed, 003 P1/P2 fixes, 004 grammar, 005 listening, 006 speaking, 007 league+push, **008 league group_no 분할**

## Files Modified This Session

- **신규**: supabase/migrations/008_league_groups.sql, docs/ADR/ADR-0008-league-group-split.md
- **수정**: packages/shared/src/league.ts, packages/shared/tests/league.test.ts, apps/mobile/lib/data/{types,remote,local}.ts, apps/mobile/components/league/LeagueBoard.tsx, apps/mobile/app/league.tsx, apps/mobile/__tests__/data-league.test.ts, CHANGELOG.md, HANDOFF.md, docs/MASTER-PLAN.md
