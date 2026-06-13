# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: P6 커밋 (`git log -1` 참조) — 직전 푸시 완료분은 `45aa9fb` P5

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ → P6 Gamification ✅** — **v1.0 코드 완결.**
로컬(Dev Mock) 풀 루프: 가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 →
문법 퀴즈/사전 → 리스닝 + Memory Booster → 회화 시나리오(TTS→STT→LLM/규칙 피드백) →
**주간 리그(티어·랭킹·승강등) + 로컬 알림 3종 + 오프라인 캐시·sync** → XP/streak/통계.
**전 Phase 완료. 남은 것은 실서버 배포·실기기 검증·스토어 실제 제출(외부 인프라/계정/자산).**

## Completed This Session (P6 — ted-run 풀 파이프라인, 코드 완결 범위)

| # | Task | Files |
|---|------|-------|
| 1 | shared 리그 순수 로직(주차·랭킹·승강등·뷰) | packages/shared/src/league.ts (+index), tests/league.test.ts (vitest 61, cov 100%) |
| 2 | migration 007 — 리그 RPC 3종(SECURITY DEFINER)·pg_cron·push_tokens | supabase/migrations/007_league_push.sql |
| 3 | 로컬 알림(순수 결정함수 + expo-notifications 어댑터) | apps/mobile/lib/notifications.ts, __tests__/notifications.test.ts |
| 4 | 오프라인 큐(순수)+sqlite(플랫폼 분기)+sync 통합 | lib/offline/{queue,sync,db,db.web}.ts, __tests__/{offline-queue,offline-sync}.test.ts |
| 5 | 데이터 레이어 league/push dual-mode + completeSession 연동 + recordAttemptRaw 분리 | lib/data/{types,index,local,remote}.ts, __tests__/data-league.test.ts |
| 6 | UI: 리그 화면·보드·홈 카드·알림 설정·프로필 진입 | app/league.tsx, components/league/LeagueBoard.tsx, app/(tabs)/{index,profile}.tsx, app/notification-settings.tsx, app/_layout.tsx |
| 7 | 스토어 준비(설정·문서, 실제 제출 제외) | apps/mobile/{app.json,eas.json}, docs/store/{privacy-policy,store-listing}.md |
| 8 | 이중 리뷰(2a sonnet + 2b opus) — CRITICAL 3·HIGH 3 전건 수정 → 재리뷰 PASS | RLS 치팅·gold 강등 경계·xpToPromote 마스킹·flush 무음삭제·INT 오버플로우 등 |
| 9 | 5관문 + E2E 14케이스(웹 export+Playwright) PASS + ADR-0007 + 문서 | docs/ADR/ADR-0007, CHANGELOG, HANDOFF, plan §7 |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **Supabase 실서버 마이그레이션** | ⬜ 대기 | 001→002→…→007→**008** 순서 적용. **007은 pg_cron Extension 활성화 필요**(Supabase Dashboard → Database → Extensions). **008(group_no 분할)은 007 이후 실행** — `league_entries`·함수 존재 전제, pg_cron 함수만 교체되어 재등록 불필요. 플랜별 권한 확인 |
| 2 | Edge Function 실배포(P5) | ⬜ 대기 | `supabase functions deploy speak-feedback` + `supabase secrets set OPENAI_API_KEY=...` |
| 3 | EAS 실빌드·스토어 제출 | ⬜ 대기 | `eas build --profile preview/production` + TestFlight/내부트랙 제출. Apple/Google 개발자 계정·서명·아이콘/스크린샷 실자산 필요. eas.json·정책 문서는 작성됨(플레이스홀더 실값 교체) |
| 4 | 실기기 검증(P4·P5·P6) | 🟡 대기 | P4 iOS 무음 스위치, P5 마이크·실 STT, **P6 로컬 알림 수신·권한 플로우·오프라인 비행기모드 sync** |
| 5 | 콘텐츠 human review | 🟡 대기 | 회화 10 + 리스닝 50 + 문법 200 + 레벨테스트 25 (AI 초안). batch 수정 → generate 스크립트 재실행 |
| 6 | 리그 group_no 분할(v1.1) | ✅ 완료 | tier를 30명 단위 그룹으로 분할(ADR-0008). migration 008 작성·shared/데이터/UI 반영. **실서버 008 적용·실데이터 30명+ 검증만 잔여**. 동시 INSERT 그룹 초과·snake-draft 균형은 v1.2 후순위 |

## Key Decisions Made (ADR-0007)

- **리그 쓰기는 SECURITY DEFINER RPC 전용** — 001의 `league_insert_own`/`league_update_own`을 007에서 회수(클라이언트 직접 UPDATE로 xp·tier 치팅 차단, 2b CRITICAL). `select_own`만 유지. ⚠️ `league_entries`에 `FORCE ROW LEVEL SECURITY` 추가 금지(적립 INSERT까지 막힘 — owner RLS 우회 의존)
- **보드 PII 비노출** — `get_league_board`는 본인 tier 그룹의 `(rank, display_name, xp, tier, is_me)`만, user_id·email 절대 미반환. 클라이언트는 `'me'`/`'other-N'` 마스킹만 봄
- **tier = 그룹** — group_no 분할은 v1.1(초기 유저 적음, plan 비목표 "그룹 미달 허용"). 승급 상위10·강등 하위5, **그룹≤5면 강등 없음**(경계 버그 가드). shared `outcomeForRank` ↔ SQL `finalize_league` 1:1 일치
- **주 경계 UTC 월요일** — `weekStartKey`/`daysUntilWeekEnd`와 pg_cron(`0 0 * * 1`) 통일(streak은 로컬이지만 리그는 UTC)
- **알림 = 순수 결정함수 분리** — `planNotifications`(테스트 100%) + `createExpoScheduler`(SDK56 DAILY/WEEKLY) 어댑터. 원격 푸시는 토큰 수집만(v1.1)
- **오프라인 플랫폼 분기** — `db.web.ts` no-op 스텁으로 expo-sqlite를 web 번들에서 제외(wa-sqlite worker/wasm가 빌드 깸). `recordAttemptRaw`(폴백 없음)를 flush가 사용해 무음 삭제 차단
- **Dev Mock 전 플로우**(ADR-0002 승계) — 리그 본인 1명 보드, 알림 mock, 오프라인 큐 미사용

## Known Issues

- **007 적용 전 pg_cron 미활성**이면 `CREATE EXTENSION pg_cron` 실패 가능(플랜별) — cron 블록만 수동 처리, 나머지 객체는 독립 실행 가능
- **웹은 오프라인 캐시 미지원**(db.web.ts no-op) — 의도된 네이티브 전용. 웹은 온라인·AsyncStorage 가정
- **completeSession 이중 호출 시 리그 XP 이중적립** 이론상 가능 — 기존 더블탭 가드(finishingRef, P3)로 완화. 완전 멱등은 미적용(세션 누적 본질상)
- finalize_league INSERT 서브쿼리가 CTE 재사용 아닌 재조회(read-skew 이론적) — 단일 트랜잭션·cron 단독이라 실전 무해
- npm audit: mobile 11 moderate(@expo 빌드타임 전이, 런타임 비도달)·shared 6 high(vitest 1.x 전이, 테스트 빌드타임) — 둘 다 P6 무관·exception
- 회화 10·리스닝 50·문법 200은 AI 초안 — human review 전
- E2E: 웹 export 후 `npx expo serve dist`(http.server는 SPA 라우팅 안 됨), expo-notifications 웹 미지원 warning은 허용

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — **전 Phase(P0~P6) 코드 완결**. 다음은 "배포·검증·출시" 단계
- **즉시 할 일 후보**: ① Supabase 실서버에 migration 001~007 순차 적용(+pg_cron 활성화·Edge 배포·secret) → ② EAS preview 빌드 → 실기기 검증(알림·STT·오프라인) → ③ 스토어 자산 제작·정책 문서 실값 → 제출. 또는 콘텐츠 human review / v1.1 기능(group_no 분할·원격 푸시·결제)
- **개발 방식**: `/ted-run <plan doc>` 풀 파이프라인 — TDD→opus 병렬 구현(파일 소유 비중첩)→독립 2a/2b 리뷰→전건 수정→재리뷰→5관문→E2E→ADR/커밋. **이번에도 이중 리뷰가 실 버그(치팅 RLS·경계 강등·마스킹 오계산) 검출 — 재확인**
- **제약·선호**: 커밋 한글, **커밋·푸시 분리 확인**(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md)
- **검증 명령**: `packages/shared`: `npx vitest run`(228); `apps/mobile`: `npx jest`(201) / `npm run typecheck`·`npm run lint`; web: `npx expo export --platform web` → `npx expo serve dist`
- **migration 번호**: 001 schema, 002 words seed, 003 P1/P2 fixes, 004 grammar, 005 listening, 006 speaking, 007 league+push, **008 league group_no 분할**

## Files Modified This Session

- **신규**: packages/shared/src/league.ts, packages/shared/tests/league.test.ts, apps/mobile/lib/notifications.ts, lib/offline/{queue,sync,db,db.web}.ts, apps/mobile/app/league.tsx, app/notification-settings.tsx, components/league/LeagueBoard.tsx, apps/mobile/eas.json, supabase/migrations/007_league_push.sql, docs/ADR/ADR-0007, docs/store/{privacy-policy,store-listing}.md, 테스트 4파일(__tests__/{data-league,notifications,offline-queue,offline-sync})
- **수정**: packages/shared/src/index.ts, apps/mobile/lib/data/{types,index,local,remote}.ts, app/(tabs)/{index,profile}.tsx, app/_layout.tsx, constants/theme.ts, app.json/package.json(expo-notifications/sqlite/device), 문서(CHANGELOG, HANDOFF, plan p6 §7, MASTER-PLAN)
