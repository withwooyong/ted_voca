# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `930a987` 배포 절차 가이드화 (핸드오프 커밋 별도)

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ → P6 ✅ → v1.1 리그 group_no 분할 ✅ → 콘텐츠 검수(1차 4도메인 + 2차 어휘) ✅ → 배포 가이드화 ✅**
v1.0 전 Phase 코드 완결 + v1.1 첫 항목 + 콘텐츠 검수 완료 + 실서버 배포 런북 정리.
로컬(Dev Mock) 풀 루프: 가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 →
문법 퀴즈/사전 → 리스닝 + Memory Booster → 회화 시나리오(TTS→STT→LLM/규칙 피드백) →
주간 리그(티어·랭킹·승강등·그룹 분할) + 로컬 알림 3종 + 오프라인 캐시·sync → XP/streak/통계.
**코드·콘텐츠·배포 문서는 준비 완료. 남은 것은 실제 외부 실행(Supabase 실서버 적용·Edge 배포·EAS 빌드·스토어 제출) + 실기기/실데이터 검증 — 모두 외부 계정·인프라 의존이라 본 환경에서 수행 불가.**

## Completed This Session (배포 절차 가이드화 — `930a987`)

기존 배포 자산(마이그레이션 001~008·config.toml·eas.json·app.json·Edge Function·store 문서)을 전수 파악해 실행 가능한 단일 배포 런북으로 정리.

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 배포 자산 전수 파악(마이그레이션 의존성·pg_cron·Edge env·EAS 프로파일·env 갭) | — | (조사 단계) |
| 2 | `docs/DEPLOY.md` 배포 런북 작성 — 5단계 순서·명령·검증·체크리스트 | `930a987` | docs/DEPLOY.md |
| 3 | `supabase/README.md` 현행화(P1 outdated → 현재 마이그레이션 목록 + DEPLOY 포인터) | `930a987` | supabase/README.md |

### 가이드 핵심 (기존 자산에서 추출·검증)
- **마이그레이션 = SQL Editor 번호 순 수동 적용**(CLI 파이프라인 없음, 파일명 00N 체계가 CLI 타임스탬프 규칙과 불일치). 전부 idempotent. **007=pg_cron 선행 의존, 008=007 이후**.
- **콘텐츠 시드(002·004·005·006) `ON CONFLICT DO NOTHING`** — 이미 시드된 행은 재실행으로 갱신 안 됨(검수 수정 반영 시 별도 UPDATE 필요).
- **pg_cron** — Dashboard Extensions 선행 활성화 권장. `finalize-league-weekly` UTC 월 00:00(=KST 월 09:00).
- **Edge `speak-feedback`** — `OPENAI_API_KEY`만 수동 secret, SUPABASE_URL/ANON/SERVICE_ROLE는 플랫폼 자동 주입. `verify_jwt=true`.
- **발견 갭** — `EXPO_PUBLIC_*` env가 eas.json/EAS env에 **없음** → 빌드 시 Dev Mock으로 빌드될 위험. `eas env:create` 주입 절차를 가이드에 명시.
- **EAS** — 프로파일(dev/preview/prod)·submit 플레이스홀더 교체 항목·스토어 자산 체크리스트.

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **콘텐츠 검수** | ✅ 완료 | 어휘 510 전량 + 문법·리스닝·회화·레벨테스트. 잔여 batch 없음 |
| 2 | **배포 문서화** | ✅ 완료 | docs/DEPLOY.md 런북. 실제 실행만 잔여(아래 3~7) |
| 3 | **Supabase 실서버 마이그레이션** | ⬜ 대기 | DEPLOY.md §B. 001~008 SQL Editor 번호 순. 002는 어휘 검수로 재생성됨(최신본 적용) |
| 4 | pg_cron 활성화 + 주간 정산(P6) | ⬜ 대기 | DEPLOY.md §C. Extensions 선행 활성화 후 007 적용 |
| 5 | Edge Function 실배포(P5) | ⬜ 대기 | DEPLOY.md §D. `supabase functions deploy speak-feedback` + `secrets set OPENAI_API_KEY` |
| 6 | EAS 실빌드·스토어 제출 | ⬜ 대기 | DEPLOY.md §E. EXPO_PUBLIC env 주입 필수 + eas.json submit 플레이스홀더 교체 + 실자산(아이콘/스크린샷) |
| 7 | 실기기 검증(P4·P5·P6) | 🟡 대기 | iOS 무음 스위치, 마이크·실 STT, 로컬 알림·오프라인 sync |
| 8 | 리그 그룹 분할 실데이터 검증(v1.1) | 🟡 대기 | 008 적용 후 유저 30명+ 환경에서 group_no 분할·보드 격리·주간 정산 재편 확인 |
| 9 | v1.1 원격 푸시 발송 | ⬜ 후순위 | push_tokens 기반 서버 발송(현재 토큰 수집만). 로컬 구현+테스트 가능 |
| 10 | v1.1 유료 구독 결제(IAP) | ⬜ 후순위 | App Store/Play Store 결제·상점 |
| 11 | 프로토타입 작업 | ⬜ 미착수 | docs/prototype/index.html — 내용 확인 후 방향 정함 |

## Key Decisions Made

- **배포 정식 경로 = Supabase SQL Editor 수동 적용**(번호 순). CLI `db push`는 파일명 규칙 불일치로 비사용. shared 순수 함수 ↔ SQL 1:1 대조로 정합성 보장.
- **배포 문서 단일 출처 = docs/DEPLOY.md** — supabase/README는 빠른 요약 + 포인터. 마이그레이션 의존성·env 갭·재시드 주의를 한 곳에 집약.
- **콘텐츠 단일 출처 = batch 파일** — batch 수정 → generate 재실행 → content/*.json + migration SQL 동기화. JSON/SQL 직접 편집 금지.

## Known Issues

- **EXPO_PUBLIC env 미주입 시 Dev Mock으로 빌드됨** — EAS 빌드 전 `eas env:create` 또는 eas.json env 블록 필수(현재 eas.json에 env 없음). DEPLOY.md §E-1 명시.
- **콘텐츠 ON CONFLICT DO NOTHING** — 실서버 기시드 후 콘텐츠 수정은 재실행으로 미반영. 별도 UPDATE 필요.
- **pg_cron 플랜 의존** — Extensions UI 선행 활성화 권장(SQL `CREATE EXTENSION` 실패 가능).
- **그룹 분할 동시 INSERT 초과**: 신규 유저 동시 배정 시 30명 살짝 초과 가능(경미, v1.2 배정 잠금 여지 — ADR-0008).
- **SQL 로컬 테스트 파이프라인 없음** — 수동 SQL Editor 적용. shared 1:1 대응 + 리뷰 라인 대조로 보장.
- 웹은 오프라인 캐시 미지원(db.web.ts no-op) — 의도된 네이티브 전용.
- completeSession 이중 호출 시 리그 XP 이중적립 이론상 가능 — 더블탭 가드(finishingRef)로 완화, 완전 멱등 미적용.
- npm audit: mobile 11 moderate(@expo 빌드타임 전이)·shared 6 high(vitest 1.x 전이) — 런타임 비도달·exception.

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — v1.0 전 Phase 코드 완결. 현재 "배포·검증·출시" 단계 + v1.1 기능 확장. 코드·콘텐츠·배포 문서까지 준비 완료, 실제 외부 실행만 잔여.
- **즉시 할 일 후보**: ① 실서버 배포 실행(DEPLOY.md 따라 Supabase·Edge·EAS — 외부 계정 필요) ② v1.1 원격 푸시 발송(로컬 구현+테스트 가능, ted-run 대상) ③ v1.1 IAP 결제 ④ 프로토타입(docs/prototype/index.html) 작업
- **개발 방식**: `/ted-run <plan doc>` 또는 plan 모드 → TDD → 구현 → 이중 리뷰 → 5관문 → ADR/커밋. 콘텐츠는 batch 수정 → generate 재실행 단일 출처. shared 순수 함수 ↔ SQL 1:1 유지.
- **제약·선호**: 커밋 한글, 커밋·푸시 분리(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md).
- **검증 명령**: 콘텐츠 생성기 `python3 -m pytest scripts/test_generate_*.py`(68); `packages/shared` `npx vitest run`(228); `apps/mobile` `npx jest`(201) / `npm run typecheck`; web `npx expo export --platform web`.
- **배포 문서**: `docs/DEPLOY.md`(런북) + `supabase/README.md`(요약). migration: 001 schema, 002 words(어휘 검수 재생성), 003 P1/P2 fixes, 004 grammar, 005 listening, 006 speaking, 007 league+push+pg_cron, 008 league group_no.

## Files Modified This Session

- **추가**: docs/DEPLOY.md
- **수정**: supabase/README.md, CHANGELOG.md, HANDOFF.md
