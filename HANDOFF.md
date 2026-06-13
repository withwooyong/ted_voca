# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `45da25c` 프로토타입 동기화 (핸드오프 커밋 별도)

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ → P6 ✅ → v1.1 리그 group_no 분할 ✅ → 콘텐츠 검수 ✅ → 배포 가이드화 ✅ → 프로토타입 동기화 ✅**
v1.0 전 Phase 코드 완결 + v1.1 첫 항목 + 콘텐츠 검수 완료 + 실서버 배포 런북 + 프로토타입 현행화.
로컬(Dev Mock) 풀 루프: 가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 →
문법 퀴즈/사전 → 리스닝 + Memory Booster → 회화 시나리오(TTS→STT→LLM/규칙 피드백) →
주간 리그(티어·랭킹·승강등·그룹 분할) + 로컬 알림 3종 + 오프라인 캐시·sync → XP/streak/통계.
**코드·콘텐츠·배포 문서·프로토타입 모두 현행. 남은 것은 실제 외부 실행(Supabase 실서버 적용·Edge 배포·EAS 빌드·스토어 제출) + 실기기/실데이터 검증 — 모두 외부 계정·인프라 의존이라 본 환경에서 수행 불가.**

## Completed This Session (프로토타입 동기화 — `45da25c`)

`docs/prototype/index.html`(6/12 생성)이 이후 구현된 P3~P6·v1.1과 드리프트 → 실제 앱 화면 내용을 반영해 4개 갭 메움. IDE에서 열려 있던 파일.

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 프로토타입↔앱 화면 갭 분석(memory-booster·notification-settings·grammar-dict·league group_no 누락 확인) | — | (조사 단계) |
| 2 | 화면 3개 추가 + 리그 그룹 분할 반영 + 진입점 연결 + NOTES/JS | `45da25c` | docs/prototype/index.html |

### 추가/변경 핵심 (실제 앱 화면 반영)
- **Memory Booster(P4)** — 최근 7일 학습 lemma·예문 연속 TTS 자동 재생, 전체 완료 시에만 세션 기록(XP 0 — 파밍 방지). 복습 화면 카드에서 진입.
- **문법 사전(P3)** — grammar-pack 20토픽, CEFR 레벨 그룹핑 + 약점 추천 상단(recommendTopics), 토픽→규칙 alert. 문법 '규칙 보기'·학습 허브에서 진입.
- **알림 설정(P6)** — 복습 리마인더(시각)/Streak 지키미(밤 9시)/리그 마감(일요일 저녁) 3종 토글 + 권한 안내. 프로필 알림에서 진입.
- **리그 group_no 분할(v1.1)** — '실버 리그 · 그룹 2'(28명), 그룹 내 상위10 승급/하위5 강등선, 분할 안내 문구. `buildLeague` 그룹 기준 재구성.
- **부수** — SCREENS 21개 확장 + 신규 NOTES, 진입점 alert→go() 교체, 학습 허브 문법 사전 행 추가.

### 검증
- `node --check` JS 문법 OK, `go()` 21개 전부 section 매칭, SCREENS=sections=21, NOTES·함수 정합.
- `gdDraw` 약점 span 따옴표 이스케이프 버그(`style=\'`) 수정 → node 시뮬레이션으로 생성 HTML 정상 확인.
- 헤드리스 브라우저 미설치로 실제 픽셀 렌더는 미수행 — 정적 분석으로 대체.

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **콘텐츠 검수** | ✅ 완료 | 어휘 510 전량 + 문법·리스닝·회화·레벨테스트 |
| 2 | **배포 문서화** | ✅ 완료 | docs/DEPLOY.md 런북 |
| 3 | **프로토타입 현행화** | ✅ 완료 | P3~P6·v1.1 화면 동기화 |
| 4 | **Supabase 실서버 마이그레이션** | ⬜ 대기 | DEPLOY.md §B. 001~008 SQL Editor 번호 순. 002는 어휘 검수로 재생성됨(최신본) |
| 5 | pg_cron 활성화 + 주간 정산(P6) | ⬜ 대기 | DEPLOY.md §C. Extensions 선행 활성화 후 007 |
| 6 | Edge Function 실배포(P5) | ⬜ 대기 | DEPLOY.md §D. deploy + `secrets set OPENAI_API_KEY` |
| 7 | EAS 실빌드·스토어 제출 | ⬜ 대기 | DEPLOY.md §E. EXPO_PUBLIC env 주입 필수 + submit 플레이스홀더 교체 + 실자산 |
| 8 | 실기기 검증(P4·P5·P6) | 🟡 대기 | iOS 무음 스위치, 마이크·실 STT, 로컬 알림·오프라인 sync |
| 9 | 리그 그룹 분할 실데이터 검증(v1.1) | 🟡 대기 | 008 적용 후 유저 30명+ 환경에서 group_no 분할·보드 격리·주간 정산 재편 |
| 10 | **v1.1 원격 푸시 발송** | ⬜ 후순위(로컬 가능) | push_tokens 기반 서버 발송(현재 토큰 수집만). 로컬 구현+테스트 가능, ted-run 대상 |
| 11 | v1.1 유료 구독 결제(IAP) | ⬜ 후순위 | App Store/Play Store 결제·상점 |

## Key Decisions Made

- **프로토타입은 앱 구현의 거울** — 실제 화면(memory-booster·notification-settings·grammar-dict·league group_no)을 충실히 반영. 콘텐츠도 실제 grammar-pack 20토픽 사용. 단일 정적 HTML, mock 데이터.
- **배포 정식 경로 = Supabase SQL Editor 수동 적용**(번호 순). CLI `db push`는 파일명 규칙 불일치로 비사용. shared 순수 함수 ↔ SQL 1:1 대조로 정합성 보장.
- **콘텐츠 단일 출처 = batch 파일** — batch 수정 → generate 재실행 → content/*.json + migration SQL 동기화. JSON/SQL 직접 편집 금지.

## Known Issues

- **프로토타입 픽셀 렌더 미검증** — 헤드리스 브라우저 미설치. 정적 분석(JS 문법·go 매칭·생성 HTML 시뮬)으로 대체. 실제 브라우저로 열어 시각 확인 권장.
- **EXPO_PUBLIC env 미주입 시 Dev Mock으로 빌드됨** — EAS 빌드 전 `eas env:create` 또는 eas.json env 블록 필수(현재 eas.json에 env 없음). DEPLOY.md §E-1.
- **콘텐츠 ON CONFLICT DO NOTHING** — 실서버 기시드 후 콘텐츠 수정은 재실행으로 미반영. 별도 UPDATE 필요.
- **pg_cron 플랜 의존** — Extensions UI 선행 활성화 권장.
- **그룹 분할 동시 INSERT 초과**: 신규 유저 동시 배정 시 30명 살짝 초과 가능(경미, v1.2 배정 잠금 여지 — ADR-0008).
- **SQL 로컬 테스트 파이프라인 없음** — 수동 SQL Editor 적용. shared 1:1 대응 + 리뷰 라인 대조로 보장.
- 웹은 오프라인 캐시 미지원(db.web.ts no-op) — 의도된 네이티브 전용.
- completeSession 이중 호출 시 리그 XP 이중적립 이론상 가능 — 더블탭 가드(finishingRef)로 완화, 완전 멱등 미적용.
- npm audit: mobile 11 moderate(@expo 빌드타임 전이)·shared 6 high(vitest 1.x 전이) — 런타임 비도달·exception.

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — v1.0 전 Phase 코드 완결. 코드·콘텐츠·배포 문서·프로토타입까지 준비 완료, 실제 외부 실행만 잔여.
- **즉시 할 일 후보**: ① **v1.1 원격 푸시 발송**(로컬 구현+테스트 가능, ted-run 대상 — 로컬에서 가장 진척 가능) ② 실서버 배포 실행(DEPLOY.md, 외부 계정 필요) ③ v1.1 IAP 결제 ④ 실기기/실데이터 검증
- **개발 방식**: `/ted-run <plan doc>` 또는 plan 모드 → TDD → 구현 → 이중 리뷰 → 5관문 → ADR/커밋. 콘텐츠는 batch 수정 → generate 재실행 단일 출처. shared 순수 함수 ↔ SQL 1:1 유지.
- **제약·선호**: 커밋 한글, 커밋·푸시 분리(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md).
- **검증 명령**: 콘텐츠 생성기 `python3 -m pytest scripts/test_generate_*.py`(68); `packages/shared` `npx vitest run`(228); `apps/mobile` `npx jest`(201) / `npm run typecheck`; web `npx expo export --platform web`; 프로토타입 `node --check`(script 추출).
- **주요 문서**: `docs/DEPLOY.md`(배포 런북), `docs/prototype/index.html`(클릭 프로토타입), `docs/MASTER-PLAN.md`, `docs/plans/`(Phase 작업계획서), `docs/ADR/`. migration 001~008(007=pg_cron, 008=group_no).

## Files Modified This Session

- **수정**: docs/prototype/index.html, CHANGELOG.md, HANDOFF.md
