# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: 본 세션 P4 커밋 참조 (`git log -1`)

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 Listening ✅** — 로컬(Dev Mock) 모드에서 풀 루프 동작:
가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 → 문법 퀴즈/사전 →
**리스닝(TTS 재생 게이트 → comprehension 퀴즈) → Memory Booster** → XP/streak/통계.

## Completed This Session (P4 — ted-run 풀 파이프라인)

| # | Task | Files |
|---|------|-------|
| 1 | TDD: 테스트 93개 red 선행 (계약 고정) | shared/tests/listening, __tests__/tts·data-listening·clip-session, scripts/test_generate_listening_seed.py |
| 2 | shared 리스닝 순수 로직 (채점·클립 선택·buildBoosterQueue) | packages/shared/src/listening.ts |
| 3 | TTS 래퍼 — 세대 기반 큐 취소, expo-audio playsInSilentMode | apps/mobile/lib/tts.ts |
| 4 | 데이터 레이어 dual-mode 리스닝 4함수 | lib/data/{types,local,remote,index}.ts, lib/content/listening-pack.ts |
| 5 | 콘텐츠 파이프라인: 클립 30/문항 50 → JSON+SQL | scripts/generate_listening_seed.py, scripts/listening_content/, content/listening-pack.json, migrations/005_listening.sql |
| 6 | UI: ClipSession(재생 게이트)·리스닝 퀴즈·Memory Booster·진입점 | components/listening/, app/quiz/listening.tsx, app/memory-booster.tsx, (tabs)/review·learn.tsx |
| 7 | 리뷰 1차 FAIL(HIGH 2) → 전건 수정 → 재리뷰 PASS | tts 세대 카운터·onError, slug NOT NULL, aliveRef 등 6건 |
| 8 | E2E 4시나리오 PASS (TTS 스텁 주입 기법) | /tmp/ted_e2e_p4/ (휘발성) |
| 9 | ADR-0005 + 문서 현행화 | docs/ADR/ADR-0005, MASTER-PLAN, plan §6 체크리스트, CHANGELOG |

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | P5 Speaking + AI | ⬜ 미착수 | `/ted-run docs/plans/p5-speaking-ai.md` — 외부 API(Edge Function), 따라 말하기 활성화 연동 지점은 ClipSession의 `TODO(P5)` 주석 |
| 2 | 실기기 오디오 검증 | 🟡 대기 | iOS 무음 스위치·백그라운드·속도 3단 체감 — 시뮬레이터 TTS 음질 상이, 사용자 실기기 필요 (plan §6 유일한 미체크 항목) |
| 3 | 콘텐츠 human review | 🟡 대기 | 리스닝 50문항(`scripts/listening_content/batch_*.txt`) + 문법 200문항 + 레벨테스트 25문항. batch 수정 후 `python3 scripts/generate_listening_seed.py` 재실행 시 JSON·SQL 동기 갱신 |
| 4 | Supabase 실서버 마이그레이션 | ⬜ 대기 | 001→002→003→004→005 순서 적용 |
| 5 | P6 Gamification | ⬜ 미착수 | 전 모듈 완성 후 |

## Key Decisions Made (ADR-0005)

- **오디오 파일 없이 expo-speech 실시간 TTS** — audio_url 컬럼만 예약, v1.1에서 MP3 폴백 전환 가능
- **SDK 56은 expo-av 아닌 expo-audio** — `setAudioModeAsync({ playsInSilentMode: true })` + speech 옵션 `useApplicationAudioSession: true`
- **TTS 큐 취소는 세대(generation) 카운터** — boolean 플래그는 큐 재시작 시 구 네이티브 콜백이 신 큐를 오염시킴 (리뷰 H-1)
- **Memory Booster XP 0** — 자동 재생 XP 파밍 차단, 세션 기록만. 백그라운드는 stop+인덱스 재개 (Android pause 미지원)
- **리스닝 attempt는 word_id 없음** — 어휘 SRS·난이도 조절 입력에서 격리 (P3 문법과 동일 패턴)
- **3지선다** — 프로토타입 검증 결정, plan 문서 현행화함
- **ClipSession 재생 게이트는 useSyncExternalStore** — 네이티브 onDone(React 이벤트 밖)의 동기 flush 필요 (ConcurrentRoot)

## Known Issues

- 리스닝 50문항·클립 30개는 AI 초안 — human review 전 (`# TODO(content-review)`)
- `user_words.status` DEFAULT 불일치(001) — 무해, 다음 마이그레이션에서 통일 예정 (이전 세션부터 이월)
- RTL v14 render/fireEvent는 async — 반드시 await / `react-hooks/purity` — `new Date()`는 핸들러 안에서
- E2E 시 headless TTS는 onend 미발화 — `speechSynthesis.speak`를 **prototype 레벨 Object.defineProperty**로 스텁해야 함 (직접 교체는 타입 에러). 서빙은 `npx expo serve dist` 필수 (http.server는 SPA 라우팅 안 됨)

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 풀스위트 영어 학습 앱 — ted-run 4회 분할 중 3회 완료 (P1+P2 / P3·P4 / 남은 것: P5 / P6)
- **개발 방식**: `/ted-run <plan doc>` 풀 파이프라인 유지 권장 (TDD red→green, opus 병렬 구현, 독립 리뷰→전건 수정→재리뷰, 5관문, 웹 export+Playwright E2E, ADR/커밋)
- **제약·선호**: 커밋 한글, 커밋·푸시 분리 확인, Expo SDK 56 — versioned docs 확인 (AGENTS.md)
- **실행/검증 명령**: `apps/mobile`: `npm start` / `npx jest`(83) / `npm run lint·typecheck`; `packages/shared`: `npx vitest run`(118, cov 100/96.8); `python3 scripts/test_generate_listening_seed.py`(22)
- **다음 착수점**: P5 Speaking + AI — STT·LLM 피드백·시나리오. 외부 API라 Supabase Edge Function 필요 (p5-speaking-ai.md 참조). ClipSession 따라 말하기 활성화도 P5 범위

## Files Modified This Session

- 신규: shared/listening.ts, lib/tts.ts, lib/content/listening-pack.ts, components/listening/ClipSession.tsx, app/quiz/listening.tsx, app/memory-booster.tsx, scripts/generate_listening_seed.py, scripts/listening_content/batch_01·02.txt, content/listening-pack.json, migrations/005_listening.sql, ADR-0005, 테스트 5파일
- 수정: lib/data 4파일, (tabs)/review.tsx, (tabs)/learn.tsx, shared/index.ts, plan p4 문서, MASTER-PLAN, CHANGELOG, HANDOFF(본 문서), package.json(expo-speech·expo-audio 추가)
