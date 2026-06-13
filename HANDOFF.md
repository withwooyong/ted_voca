# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `45aa9fb` P5 Speaking + AI (커밋·푸시 완료)

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 Speaking + AI ✅** — 로컬(Dev Mock) 풀 루프 동작:
가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 → 문법 퀴즈/사전 →
리스닝 + Memory Booster → **회화 시나리오(Ted TTS → STT → LLM/규칙 피드백 → 다음 턴)** → XP/streak/통계.
ted-run 4회 분할(P1+P2 / P3·P4 / P5 / P6) 중 **P5까지 완료, P6만 남음.**

## Completed This Session (P5 — ted-run 풀 파이프라인, Step 1~5)

| # | Task | Files |
|---|------|-------|
| 1 | shared 회화 로직 (Dice 채점·localFeedback·잠금·XP) | packages/shared/src/speaking.ts (+index) |
| 2 | STT 어댑터 (device/mock 교체식) | apps/mobile/lib/stt.ts |
| 3 | 데이터 레이어 speaking dual-mode 4함수 | lib/data/{types,local,remote,index}.ts, lib/content/speaking-pack.ts |
| 4 | Edge Function speak-feedback (핸들러 DI + 진입점) + config.toml | supabase/functions/speak-feedback/{handler,index}.ts, supabase/config.toml |
| 5 | 콘텐츠 파이프라인 시나리오 10/턴 68 → JSON+SQL | scripts/generate_speaking_seed.py, scripts/speaking_content/, content/speaking-pack.json, migrations/006_speaking.sql |
| 6 | UI: DialogueSession·목록·대화 컨테이너·learn 진입 | components/speaking/DialogueSession.tsx, app/speaking/{index,[slug]}.tsx, (tabs)/learn.tsx |
| 7 | 이중 리뷰(2a sonnet + 2b opus 적대적) FAIL→전건 수정→재리뷰 PASS | 한도 원자화·응답형상·off-by-one·turnOrder·verify_jwt·인젝션 등 |
| 8 | 5관문 검증 + E2E 4시나리오 PASS | (E2E /tmp/ted_e2e_p5/ — 휘발성) |
| 9 | ADR-0006 + 문서 현행화 | docs/ADR/ADR-0006, MASTER-PLAN, plan §7, CHANGELOG |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **P6 Gamification** | 🟢 다음 진입 | `/ted-run docs/plans/p6-gamification.md` — 리그·푸시·스토어 준비. 전 모듈 완성 후 마지막 Phase |
| 2 | Edge Function 실배포 | ⬜ 대기 | `supabase functions deploy speak-feedback` + `supabase secrets set OPENAI_API_KEY=...`. 미배포 시 로컬은 규칙기반 폴백으로 동작 |
| 3 | 실기기 검증(P4+P5) | 🟡 대기 | P4 iOS 무음 스위치 / P5 마이크 권한·실 STT 인식률·왕복 지연. app.json infoPlist에 NSMicrophoneUsageDescription·NSSpeechRecognitionUsageDescription 추가 필요(스토어 거부 방지) |
| 4 | 콘텐츠 human review | 🟡 대기 | 회화 시나리오 10(`scripts/speaking_content/`) + 리스닝 50 + 문법 200 + 레벨테스트 25. batch 수정 → 해당 generate 스크립트 재실행 |
| 5 | Supabase 실서버 마이그레이션 | ⬜ 대기 | 001→002→003→004→005→006 순서 + Edge 배포 |

## Key Decisions Made (ADR-0006)

- **LLM은 Edge Function `speak-feedback` 경유** — OPENAI_API_KEY는 Deno.env secret, 클라이언트는 invoke만. 핸들러는 순수함수(DI)로 deno test
- **일일 한도는 원자적 RPC** `increment_speaking_usage` — `ON CONFLICT DO UPDATE SET count=count+1 WHERE count<limit RETURNING`로 row lock 직렬화(select-then-upsert의 TOCTOU 비용폭탄 차단, 2b CRITICAL). SECURITY DEFINER + service role만 실행
- **user_id는 검증된 JWT에서**(클라이언트 body 아님), 500자 cap·turnOrder 정수검증은 Edge에서 강제, verify_jwt는 config.toml로 코드 고정(defense-in-depth)
- **프롬프트 인젝션 완화** — userText를 `<user_utterance>` 태그 격리 + `<`/`>` 전각 치환(태그 탈출 차단), LLM 출력 제어문자 제거·500자 cap
- **STT 어댑터 인터페이스** — device/mock 교체, Whisper 폴백은 어댑터 추가로 v1.1
- **Dev Mock으로 AI 없이 전 플로우** — localFeedback(Dice 0.8/0.4 구간), usage는 AsyncStorage
- **DialogueSession Ted 자동진행은 useSyncExternalStore 게이트** — P4 ClipSession과 동일(네이티브 onDone의 ConcurrentRoot flush)

## Known Issues

- **신규 사용자는 카페 시나리오만 해제**(레벨 1) — 나머지 9개는 min_level 잠금. 의도된 게이팅이나 콘텐츠/레벨 곡선 조정 여지. P6 또는 콘텐츠 확장 시 검토
- Edge Function 미배포 상태 — 실 AI 피드백은 배포·secret 후. 그 전까지 remote도 폴백 품질
- app.json에 마이크/음성인식 권한 사용 문자열 미설정 — 실기기 빌드 전 추가 필요(iOS 크래시/스토어 거부 방지)
- 회화 시나리오 10·리스닝 50·문법 200은 AI 초안 — human review 전
- `user_words.status` DEFAULT 불일치(001) — 무해, 이월
- RTL v14 async / `react-hooks/purity`(new Date는 핸들러 안) / ConcurrentRoot 비동기 반영은 waitFor·useSyncExternalStore
- E2E: headless TTS는 prototype 레벨 Object.defineProperty 스텁, STT는 Dev Mock이라 스텁 불필요. 서빙 `npx expo serve dist`(http.server는 SPA 라우팅 안 됨)
- npm audit moderate 11건 — 전부 @expo 빌드타임 툴체인 전이 의존(런타임 비도달, SDK 56 고유), P5 무관

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — Phase 단위 완성. P5까지 완료, **P6 Gamification이 마지막**
- **즉시 할 일**: `/ted-run docs/plans/p6-gamification.md` — 리그·푸시 알림·스토어 준비. p6 plan doc의 migration 번호가 005 등으로 적혀 있으면 007로 이월 필요(005=리스닝, 006=회화 점유)
- **개발 방식**: `/ted-run <plan doc>` 풀 파이프라인 유지 — TDD red→green, opus 병렬 구현(파일 소유 비중첩 3분할이 효과적), 독립 2a/2b 리뷰→전건 수정→재리뷰, 5관문(보안 분류는 3-4·3-5 포함), 웹 export+Playwright E2E, ADR/커밋. **리뷰가 실 버그를 잡는 효과 재확인**(P5: 한도 TOCTOU·응답 형상·인젝션)
- **제약·선호**: 커밋 한글, **커밋·푸시 분리 확인**(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md)
- **검증 명령**: `apps/mobile`: `npx jest`(130) / `npm run typecheck·lint`; `packages/shared`: `npx vitest run`(152); `python3 scripts/test_generate_speaking_seed.py`(30); `deno test supabase/functions/speak-feedback/`(12)
- **P5 외부 API 운영**: OpenAI 키는 `supabase secrets set OPENAI_API_KEY=...`, 함수 배포는 `supabase functions deploy speak-feedback`. 미배포여도 Dev Mock·폴백으로 앱은 동작

## Files Modified This Session

- **신규**: packages/shared/src/speaking.ts, apps/mobile/lib/stt.ts, apps/mobile/components/speaking/DialogueSession.tsx, apps/mobile/app/speaking/{index,[slug]}.tsx, supabase/functions/speak-feedback/{handler,index}.ts, supabase/config.toml, scripts/generate_speaking_seed.py, scripts/speaking_content/batch_01.txt, content/speaking-pack.json, supabase/migrations/006_speaking.sql, docs/ADR/ADR-0006, 테스트 6파일(shared/tests/speaking, __tests__/{stt,data-speaking,dialogue-session}, supabase/.../index.test.ts, scripts/test_generate_speaking_seed.py)
- **수정**: apps/mobile/lib/content/speaking-pack.ts(stub→실구현), lib/data 4파일, (tabs)/learn.tsx, shared/index.ts, app.json/package.json(expo-speech-recognition), 문서(plan p5, MASTER-PLAN, CHANGELOG, HANDOFF)
