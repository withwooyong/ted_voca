# Session Handoff

> Last updated: 2026-06-14 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `2ae5255` v1.1 원격 푸시 발송 (핸드오프 커밋 별도)

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ → P6 ✅ → v1.1 리그 group_no 분할 ✅ → 콘텐츠 검수 ✅ → 배포 가이드화 ✅ → 프로토타입 동기화 ✅ → v1.1 원격 푸시 발송 ✅**
v1.0 전 Phase 코드 완결 + v1.1 두 항목(리그 group_no 분할·원격 푸시 발송) + 콘텐츠 검수 + 실서버 배포 런북 + 프로토타입 현행화.
로컬(Dev Mock) 풀 루프: 가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 →
문법 퀴즈/사전 → 리스닝 + Memory Booster → 회화 시나리오(TTS→STT→LLM/규칙 피드백) →
주간 리그(티어·랭킹·승강등·그룹 분할) + 로컬 알림 3종 + 오프라인 캐시·sync → XP/streak/통계.
서버 측 캠페인 푸시 발송(`push-send` Edge Function)까지 코드 완결.
**남은 것은 실제 외부 실행(Supabase 실서버 적용·Edge 배포·EAS 빌드·스토어 제출) + 실기기/실데이터 검증 — 모두 외부 계정·인프라 의존이라 본 환경에서 수행 불가.**

## Completed This Session (v1.1 원격 푸시 발송 — `2ae5255`)

P6에서 `push_tokens` 수집(007 + `savePushToken`)까지만 있고 **서버 발송 경로가 없던** 갭을 메움.
인수인계 #10 후보(로컬 구현+테스트 가능)를 plan 모드 → TDD로 구현. P5 `speak-feedback`의 DI 패턴
(handler 순수 + index Deno deps + deno test)을 그대로 따라 외부 API 없이 완전 로컬 검증.

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Expo SDK 56 푸시 발송 규약 재확인(엔드포인트·100개/요청·ticket 구조) | — | (조사) |
| 2 | TDD: `index.test.ts` 27케이스 작성(red) | `2ae5255` | supabase/functions/push-send/index.test.ts |
| 3 | `handler.ts` 구현(green) | `2ae5255` | supabase/functions/push-send/handler.ts |
| 4 | `index.ts`(Deno deps) + config.toml verify_jwt=false | `2ae5255` | supabase/functions/push-send/index.ts, supabase/config.toml |
| 5 | 문서: ADR-0009 + DEPLOY.md §D-2 + MASTER-PLAN v1.1 | `2ae5255` | docs/ADR/ADR-0009-…, docs/DEPLOY.md, docs/MASTER-PLAN.md |

### 구현 핵심
- **`push-send` Edge Function** — 관리자가 호출하면 수집된 `push_tokens`에 Expo Push API로 캠페인
  푸시를 발송하고 무효 토큰을 자동 정리. 응답은 `{sent, failed, invalidated}` 카운트만(토큰 미노출).
- **인증 = 공유 관리자 시크릿** — `X-Admin-Secret` 헤더를 env `PUSH_ADMIN_SECRET`와 **상수시간 비교**
  (env 미설정 시 fail-closed). `config.toml`에 `[functions.push-send] verify_jwt=false`(user JWT 아님).
  스키마 변경 없음(`is_admin` 컬럼 미도입).
- **무효 토큰 정리** — ticket의 `DeviceNotRegistered`만 인덱스 정렬로 자동 삭제, 일시 장애 코드
  (MessageRateExceeded 등)는 보존. 삭제 실패는 best-effort(다음 발송 재시도).
- **청킹·격리** — 100개/요청 청크, 청크 발송 throw는 격리(부분 실패가 캠페인 전체 중단 안 함).
- **tier 필터(선택)** — 이번 UTC 주(`isoUtcMonday()` = SQL `date_trunc('week', now() AT TIME ZONE 'UTC')`)
  해당 리그 티어 user_id만 대상.

### 검증
- `deno test supabase/functions/` → **39 passed**(push-send 27 + speak-feedback 12 회귀), 0 failed.
- `deno check supabase/functions/push-send/index.ts` 통과(원격 deps 포함).
- `apps/mobile` typecheck 클린, `packages/shared` vitest 228 passed (둘 다 무영향 회귀 스모크).
- mobile jest(201)·content pytest(68)는 supabase/docs/config만 변경해 영향권 밖(미실행).

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **콘텐츠 검수** | ✅ 완료 | 어휘 510 전량 + 문법·리스닝·회화·레벨테스트 |
| 2 | **배포 문서화** | ✅ 완료 | docs/DEPLOY.md 런북(§D-2 push-send 포함) |
| 3 | **프로토타입 현행화** | ✅ 완료 | P3~P6·v1.1 화면 동기화 |
| 4 | **v1.1 원격 푸시 발송(코드)** | ✅ 완료 | `push-send` Edge Function — deno test 27 |
| 5 | **Supabase 실서버 마이그레이션** | ⬜ 대기 | DEPLOY.md §B. 001~008 SQL Editor 번호 순 |
| 6 | pg_cron 활성화 + 주간 정산(P6) | ⬜ 대기 | DEPLOY.md §C. Extensions 선행 활성화 후 007 |
| 7 | Edge Function 실배포(P5·v1.1) | ⬜ 대기 | DEPLOY.md §D. `speak-feedback`(OPENAI_API_KEY) + `push-send`(PUSH_ADMIN_SECRET) |
| 8 | EAS 실빌드·스토어 제출 | ⬜ 대기 | DEPLOY.md §E. EXPO_PUBLIC env 주입 필수 + submit 플레이스홀더 교체 + 실자산 |
| 9 | 실기기 검증(P4·P5·P6) | 🟡 대기 | iOS 무음 스위치, 마이크·실 STT, 로컬 알림·오프라인 sync |
| 10 | 리그 그룹 분할 실데이터 검증(v1.1) | 🟡 대기 | 008 적용 후 유저 30명+ 환경에서 group_no 분할·보드 격리·주간 정산 재편 |
| 11 | 원격 푸시 실발송 검증(v1.1) | 🟡 대기 | `push-send` 배포 + `PUSH_ADMIN_SECRET` + 실 토큰 환경에서 curl 발송·무효 토큰 정리 확인 |
| 12 | 원격 푸시 receipt 2차 폴링(v1.1+) | ⬜ 후순위 | 현재 ticket 레벨만 — DeviceNotRegistered 일부 잔존. push/getReceipts 폴링 추가(로컬 구현 가능) |
| 13 | 리그 정산 자동 푸시(v1.1+) | ⬜ 후순위 | finalize_league 후 승강등 결과 push (cron→HTTP, pg_net 인프라) |
| 14 | v1.1 유료 구독 결제(IAP) | ⬜ 후순위 | App Store/Play Store 결제·상점 |

## Key Decisions Made (이번 세션)

- **원격 푸시는 Edge Function `push-send`** — P5 DI 패턴(handler 순수/index deps) 재사용. shared가 아닌
  handler.ts에 둔 이유: Expo 발송은 Deno·서버 전용이라 모바일/공유가 안 씀(ADR-0009 §1).
- **인증 = 공유 관리자 시크릿 헤더** (사용자 선택) — `is_admin` 컬럼 대신 시크릿으로 스키마 무변경 +
  서비스 관리 작업 분리. `verify_jwt=false`로 플랫폼 게이트를 끄고 핸들러 `isAdmin`이 단독 책임(ADR-0009 §2).
- **무효 토큰은 ticket의 DeviceNotRegistered만 삭제** — 일시 장애 코드 보존. receipt 2차 폴링은 MVP
  비목표(한계 명시, v1.1+ 후속) (ADR-0009 §3).
- **범위 = 캠페인 발송만** (사용자 선택) — 리그 결과 자동 푸시(cron→HTTP)는 서버 인프라 의존이라 후속.

## Known Issues

- **receipt 2차 폴링 미구현(push-send)** — `DeviceNotRegistered`는 주로 receipt 단계에서 확정 →
  ticket 레벨만 처리하는 MVP는 일부 무효 토큰이 잔존 가능. ADR-0009·DEPLOY §D-2에 명시.
- **푸시 레이트리밋 백오프 없음** — 대량 발송 시 `MessageRateExceeded`는 실패 카운트만(재시도 X).
- **PUSH_ADMIN_SECRET 시크릿 1개 공유** — 로테이션 수동(DEPLOY §D-2 4번). HTTPS 전제로 평문 헤더 전송.
- **EXPO_PUBLIC env 미주입 시 Dev Mock으로 빌드됨** — EAS 빌드 전 env 필수(DEPLOY §E-1).
- **콘텐츠 ON CONFLICT DO NOTHING** — 실서버 기시드 후 콘텐츠 수정은 재실행으로 미반영. 별도 UPDATE 필요.
- **pg_cron 플랜 의존** — Extensions UI 선행 활성화 권장.
- **그룹 분할 동시 INSERT 초과**: 신규 유저 동시 배정 시 30명 살짝 초과 가능(경미, v1.2 — ADR-0008).
- **SQL/Edge 로컬 테스트 파이프라인 = deno test + shared 1:1 대조** — 실 DB 적용은 수동 SQL Editor.
- 웹은 오프라인 캐시 미지원(db.web.ts no-op) — 의도된 네이티브 전용.
- completeSession 이중 호출 시 리그 XP 이중적립 이론상 가능 — 더블탭 가드로 완화, 완전 멱등 미적용.
- npm audit: mobile 11 moderate(@expo 빌드타임 전이)·shared 6 high(vitest 1.x 전이) — 런타임 비도달·exception.

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — v1.0 전 Phase + v1.1 코드 트랙
  대부분 완결. 코드·콘텐츠·배포 문서·프로토타입 준비 완료, 실제 외부 실행만 잔여.
- **즉시 할 일 후보**: ① **원격 푸시 receipt 폴링**(v1.1+, 로컬 구현+테스트 가능 — push-send 확장,
  ted-run 대상) ② **리그 정산 자동 푸시**(cron→HTTP, 일부 로컬 가능) ③ 실서버 배포 실행(DEPLOY.md,
  외부 계정 필요) ④ v1.1 IAP 결제 ⑤ 실기기/실데이터 검증. **로컬에서 가장 진척 가능한 건 ① receipt 폴링.**
- **개발 방식**: `/ted-run <plan doc>` 또는 plan 모드 → TDD → 구현 → 이중 리뷰 → 5관문 → ADR/커밋.
  Edge Function은 P5/v1.1 패턴(handler 순수 DI + index Deno deps + deno test) 고수. 콘텐츠는 batch
  수정 → generate 재실행 단일 출처. shared 순수 함수 ↔ SQL 1:1 유지.
- **제약·선호**: 커밋 한글, 커밋·푸시 분리(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md).
- **검증 명령**: 콘텐츠 `python3 -m pytest scripts/test_generate_*.py`(68); `packages/shared`
  `npx vitest run`(228); `apps/mobile` `npx jest`(201) / `npm run typecheck`; **Edge Function
  `deno test supabase/functions/`(39 = speak-feedback 12 + push-send 27)**; web `npx expo export
  --platform web`; 프로토타입 `node --check`(script 추출).
- **주요 문서**: `docs/DEPLOY.md`(배포 런북 — §D-2 push-send), `docs/prototype/index.html`(클릭
  프로토타입), `docs/MASTER-PLAN.md`, `docs/plans/`(Phase 작업계획서), `docs/ADR/`(0009까지).
  migration 001~008(007=pg_cron·push_tokens, 008=group_no). Edge Function: speak-feedback(P5)·push-send(v1.1).

## Files Modified This Session

- **신규**: supabase/functions/push-send/{handler.ts, index.ts, index.test.ts}, docs/ADR/ADR-0009-remote-push-send.md
- **수정**: supabase/config.toml, docs/DEPLOY.md, docs/MASTER-PLAN.md, CHANGELOG.md, HANDOFF.md
