# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `16a68b4` 콘텐츠 human review 1차 (핸드오프 커밋 별도)

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ → P6 Gamification ✅ → v1.1 리그 group_no 분할 ✅ → 콘텐츠 human review 1차 ✅**
v1.0 전 Phase 코드 완결 + v1.1 첫 항목(리그 그룹 분할) + AI 초안 콘텐츠 1차 검수 완료.
로컬(Dev Mock) 풀 루프: 가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 →
문법 퀴즈/사전 → 리스닝 + Memory Booster → 회화 시나리오(TTS→STT→LLM/규칙 피드백) →
주간 리그(티어·랭킹·승강등·그룹 분할) + 로컬 알림 3종 + 오프라인 캐시·sync → XP/streak/통계.
**남은 것은 실서버 배포·실기기 검증·스토어 실제 제출(외부 인프라/계정/자산) + 그룹 분할 실데이터 검증 + 콘텐츠 잔여 검수.**

## Completed This Session (콘텐츠 human review 1차 — `16a68b4`)

AI 초안 콘텐츠(문법 164·리스닝 50·회화 67·레벨테스트 25문항)를 도메인별 병렬 전문 검수.
전반 품질 높고 결함률 낮음 — 발견 9건 중 권장안(HIGH 2 + LOW 6, G4 제외) 7건 적용.

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 4개 도메인 병렬 검수(문법/리스닝/회화/레벨테스트) | — | (리뷰 단계, 산출 없음) |
| 2 | HIGH 2건 수정 — 무오류 error_find 교체(G1), 가정법 조건절 누락(G2) | `16a68b4` | scripts/grammar_content/batch_01.txt·batch_02.txt |
| 3 | LOW 6건 수정 — 관사 한영 일치(G3)·관계대명사 단수(G5)·손님센터(L1)·회화 힌트(S2)·레벨테스트 해설(LT1) | `16a68b4` | grammar/listening/speaking batch, apps/mobile/lib/content/level-test.ts |
| 4 | 3개 팩 재생성 + SQL 동기화 + pyc 추적 해제 + 검증 | `16a68b4` | content/*.json, supabase/migrations/004·005·006 |

### 적용 핵심
- **HIGH 2** — G1: `Please open a window near you`(틀린 부분 없는 정상 문장, error_find 부적합) → `I saw a moon last night`(유일 대상 the). G2: `She would know the answer here`(조건절 누락) → `If Mary were here, she would help us`.
- **LOW 6** — G3 `that table`→`on my desk`(지시사 불일치), G5 `red caps`→`a cap`(복수 불일치), L1 "손님센터"→"고객 서비스 데스크", S2 회화 힌트 직역투 다듬기, LT1 lt-d5-04 해설 오역·성별 단정 수정.
- **word_order 제약 대응** — 칩 4~9개·중복 단어 금지 때문에 G2(she 중복)·G3(the 중복)·G5(10칩·is 중복)는 의미·문법을 살리면서 제약을 만족하도록 문장 조정.
- **미적용** — G4(`much information`)는 토픽이 much+불가산을 의도적으로 가르치므로 유지. S1(회화 "Yes,")은 이미 정상이라 변경 불필요(리뷰 오독).

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **콘텐츠 잔여 검수** | 🟡 대기 | 이번 1차는 문법 batch_01·02 / 리스닝 batch_02 / 회화 / 레벨테스트만. 어휘 단어팩(toeic-800)·리스닝 batch_01·기타 batch는 미검수 |
| 2 | **Supabase 실서버 마이그레이션** | ⬜ 대기 | 001→…→007→008 순서. 007은 pg_cron Extension 활성화 필요. 008은 007 이후. 콘텐츠 재검수로 004·005·006 SQL 갱신됨(재적용 시 최신본 사용) |
| 3 | Edge Function 실배포(P5) | ⬜ 대기 | `supabase functions deploy speak-feedback` + `supabase secrets set OPENAI_API_KEY=...` |
| 4 | EAS 실빌드·스토어 제출 | ⬜ 대기 | `eas build --profile preview/production` + TestFlight/내부트랙. 계정·서명·아이콘/스크린샷 실자산 필요 |
| 5 | 실기기 검증(P4·P5·P6) | 🟡 대기 | P4 iOS 무음 스위치, P5 마이크·실 STT, P6 로컬 알림·오프라인 sync |
| 6 | 리그 그룹 분할 실데이터 검증(v1.1) | 🟡 대기 | 008 적용 후 유저 30명+ 환경에서 그룹 분할·보드 격리·주간 정산 group_no 재편 확인 |
| 7 | v1.1 원격 푸시 발송 | ⬜ 후순위 | push_tokens 기반 서버 발송(현재 토큰 수집만) |
| 8 | v1.1 유료 구독 결제(IAP) | ⬜ 후순위 | App Store/Play Store 결제·상점 |

## Key Decisions Made

- **콘텐츠 검수 = 정답·문법·한영 일치·distractor·해설 6개 결함 클래스 기준**, 보수적 판정(취향 아닌 실제 결함만). 도메인별 병렬 에이전트로 1차 스윕 후 HIGH 직접 재검증.
- **word_order 콘텐츠 수정 시 생성기 제약(칩 4~9개·중복 단어 금지)을 의미보다 우선** — 한영 정합을 살리되 칩 제약을 만족하는 대체 문장 선택(예: 같은 주어 반복 회피 위해 Mary/she 분리).
- **콘텐츠 단일 출처 = batch 파일** — batch 수정 → `generate_*` 재실행 → content/*.json + migration SQL 동기화. JSON/SQL 직접 편집 금지.

## Known Issues

- **콘텐츠 1차 검수만 완료** — 어휘 단어팩(toeic-800-pack)·리스닝 batch_01·미검수 batch 잔여. 어휘 단어팩은 본 세션 범위 밖이었음
- **그룹 분할 동시 INSERT 초과**: 두 신규 유저가 동시에 같은 group_no를 골라 30명을 살짝 넘길 수 있음(경미한 불균형, v1.2 배정 잠금 여지 — ADR-0008)
- **SQL 로컬 테스트 파이프라인 없음** — migration 수동 SQL Editor 적용. shared 1:1 대응 + 리뷰 라인 대조로 정합성 보장
- 007 적용 전 pg_cron 미활성이면 `CREATE EXTENSION pg_cron` 실패 가능(플랜별) — cron 블록만 수동 처리
- 웹은 오프라인 캐시 미지원(db.web.ts no-op) — 의도된 네이티브 전용
- completeSession 이중 호출 시 리그 XP 이중적립 이론상 가능 — 더블탭 가드(finishingRef)로 완화, 완전 멱등 미적용
- npm audit: mobile 11 moderate(@expo 빌드타임 전이)·shared 6 high(vitest 1.x 전이) — 런타임 비도달·exception

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — v1.0 전 Phase 코드 완결. 현재 "배포·검증·출시" 단계 + v1.1 기능 확장 + 콘텐츠 품질화 진행 중
- **즉시 할 일 후보**: ① 콘텐츠 잔여 검수(어휘 단어팩·리스닝 batch_01) ② 배포 절차 점검·가이드화(Supabase 001~008·pg_cron·Edge·EAS) ③ v1.1 다음 항목(원격 푸시 발송 / IAP) ④ 실서버 배포 후 그룹 분할 실데이터 검증
- **개발 방식**: `/ted-run <plan doc>` 또는 plan 모드 → TDD → 구현 → 이중 리뷰 → 5관문 → ADR/커밋. 콘텐츠는 batch 수정 → generate 재실행 단일 출처 원칙. shared 순수 함수 ↔ SQL 1:1 일치 유지
- **제약·선호**: 커밋 한글, 커밋·푸시 분리(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md)
- **검증 명령**: 콘텐츠 생성기: `python3 -m pytest scripts/test_generate_*.py`(68); `packages/shared`: `npx vitest run`(228); `apps/mobile`: `npx jest`(201) / `npm run typecheck`; web: `npx expo export --platform web`
- **migration 번호**: 001 schema, 002 words seed, 003 P1/P2 fixes, 004 grammar, 005 listening, 006 speaking, 007 league+push, 008 league group_no 분할 (004·005·006은 이번 콘텐츠 검수로 재생성됨)

## Files Modified This Session

- **수정**: apps/mobile/lib/content/level-test.ts, scripts/grammar_content/batch_01.txt·batch_02.txt, scripts/listening_content/batch_02.txt, scripts/speaking_content/batch_01.txt, content/{grammar,listening,speaking}-pack.json, supabase/migrations/004_grammar.sql·005_listening.sql·006_speaking.sql, CHANGELOG.md, HANDOFF.md
- **추적 해제**: scripts/__pycache__/generate_grammar_seed.cpython-314.pyc
