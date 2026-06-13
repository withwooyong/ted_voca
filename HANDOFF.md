# Session Handoff

> Last updated: 2026-06-13 (KST)
> Branch: `main` (https://github.com/withwooyong/ted_voca — public)
> Latest commit: `b66d93a` 콘텐츠 human review 2차 — 어휘 (핸드오프 커밋 별도)

## Current Status

**P0 ✅ → P1+P2 ✅ → P3 ✅ → P4 ✅ → P5 ✅ → P6 Gamification ✅ → v1.1 리그 group_no 분할 ✅ → 콘텐츠 human review 1차 ✅ → 2차(어휘) ✅**
v1.0 전 Phase 코드 완결 + v1.1 첫 항목(리그 그룹 분할) + AI 초안 콘텐츠 검수(문법·리스닝·회화·레벨테스트 1차 + 어휘 전량 2차) 완료.
로컬(Dev Mock) 풀 루프: 가입 → 온보딩 → 레벨 테스트 → 어휘 퀴즈 3종 → SM-2 복습 →
문법 퀴즈/사전 → 리스닝 + Memory Booster → 회화 시나리오(TTS→STT→LLM/규칙 피드백) →
주간 리그(티어·랭킹·승강등·그룹 분할) + 로컬 알림 3종 + 오프라인 캐시·sync → XP/streak/통계.
**콘텐츠 검수는 사실상 완료(어휘 510 + 4개 도메인). 남은 것은 실서버 배포·실기기 검증·스토어 실제 제출(외부 인프라/계정/자산) + 그룹 분할 실데이터 검증.**

## Completed This Session (콘텐츠 human review 2차 — 어휘 — `b66d93a`)

AI 초안 어휘 toeic-800 510단어(batch_01~10)를 5개 병렬 전문 검수 + 리스닝 batch_01 검수.
전역 중복 0, 전반 품질 높음 — 발견 사항 중 권장안 11건(HIGH 6 + 명백 LOW 5) 적용, 취향성 6건 미적용.

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 어휘 510단어 5개 병렬 검수(batch 01-02/03-04/05-06/07-08/09-10) + 리스닝 batch_01 검수 | — | (리뷰 단계, 산출 없음) |
| 2 | HIGH 6건 수정 — collection 관사/deduct 자동사/distinction 오역/each·either pos enum/exercise 예문 | `b66d93a` | scripts/word_batches/batch_04·07·08·09.txt |
| 3 | 명백 LOW 5건 수정 — apologize·besides·custom·due·aim | `b66d93a` | scripts/word_batches/batch_01·02·03·06·08.txt |
| 4 | toeic 팩 + words SQL 재생성 + 검증(pytest 68, determiner 0) | `b66d93a` | content/toeic-800-pack.json, supabase/migrations/002_words_seed.sql |

### 적용 핵심
- **HIGH 6** — collection: `A data collection`→`Data collection`(불가산 명사 관사). deduct: `Taxes deduct from`→`We deduct taxes from`(타동사 자동사 오용 비문). distinction: meaning_ko `차별`→`차이, 구별`(오역, 예문은 '구별' 의미 — 퀴즈 정답 깨짐). each·either: pos `determiner`→`other`(VALID_POS enum 외 값으로 SQL서 `other` 강제매핑되며 tags/pos 불일치하던 결함 정합화). exercise: `행사`+동사형 비문 예문→`운동, 행사`+명사 예문.
- **명백 LOW 5** — apologize `Please apologize`→`We apologize`(명령형 register), besides(prep) `게다가`(부사뜻)→`~외에도`(pos·예문 정합), custom `It is custom to`→`It is the custom to`(비표준 영어), due `first of month`→`first of the month`(관사 누락), aim `겨냥하다`→`목표로 하다`(예문 aim to 의미 정합).
- **리스닝 batch_01** — 17 clip·25문항 검수, 정답·transcript·한영·해설·distractor 전부 정합, **결함 없음 → 수정 없음**.
- **미적용 6** — affair·cell·compound·entry·fashion·deliver는 현행이 허용 의미 범위 내 취향성이라 1차의 보수적 기준대로 유지.

## In Progress / Pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **콘텐츠 검수** | ✅ 사실상 완료 | 어휘 510 전량 + 문법·리스닝·회화·레벨테스트 검수 완료. 잔여 미검수 batch 없음(speaking batch_01만 1차에서 도메인 검수됨, 추가 batch 없음) |
| 2 | **Supabase 실서버 마이그레이션** | ⬜ 대기 | 001→002→…→007→008 순서. 002는 이번 어휘 검수로 재생성됨(재적용 시 최신본). 007은 pg_cron Extension 활성화 필요, 008은 007 이후 |
| 3 | Edge Function 실배포(P5) | ⬜ 대기 | `supabase functions deploy speak-feedback` + `supabase secrets set OPENAI_API_KEY=...` |
| 4 | EAS 실빌드·스토어 제출 | ⬜ 대기 | `eas build --profile preview/production` + TestFlight/내부트랙. 계정·서명·아이콘/스크린샷 실자산 필요 |
| 5 | 실기기 검증(P4·P5·P6) | 🟡 대기 | P4 iOS 무음 스위치, P5 마이크·실 STT, P6 로컬 알림·오프라인 sync |
| 6 | 리그 그룹 분할 실데이터 검증(v1.1) | 🟡 대기 | 008 적용 후 유저 30명+ 환경에서 그룹 분할·보드 격리·주간 정산 group_no 재편 확인 |
| 7 | v1.1 원격 푸시 발송 | ⬜ 후순위 | push_tokens 기반 서버 발송(현재 토큰 수집만) |
| 8 | v1.1 유료 구독 결제(IAP) | ⬜ 후순위 | App Store/Play Store 결제·상점 |

## Key Decisions Made

- **콘텐츠 검수 = 정답·문법·한영 일치·distractor·해설·pos 정확성 기준**, 보수적 판정(취향 아닌 실제 결함만). 어휘는 510단어를 5개 병렬 에이전트(각 100단어)로 스윕 후 HIGH 직접 재검증.
- **어휘 pos는 VALID_POS enum(noun/verb/adjective/adverb/preposition/conjunction/other)만 유효** — `determiner` 등 enum 외 값은 generate_words_seed_sql.py가 `other`로 강제 매핑하나 tags에는 원값이 남아 JSON/SQL 불일치 발생. 검수 시 enum 위반은 HIGH로 정합화.
- **콘텐츠 단일 출처 = batch 파일** — batch 수정 → `generate_toeic_seed.py` → `content/toeic-800-pack.json` → `generate_words_seed_sql.py` → `002_words_seed.sql` 순 재생성. JSON/SQL 직접 편집 금지.

## Known Issues

- **콘텐츠 검수 완료** — 어휘 전량 + 4개 도메인 검수됨. 추가 batch 생성 시 동일 기준 재검수 필요.
- **words SQL ON CONFLICT (course_id, lemma) DO NOTHING** — 기존 시드된 행은 meaning_ko 등 변경이 재적용으로 갱신되지 않음. 실서버에 이미 시드된 경우 검수 수정 반영하려면 별도 UPDATE 필요(현재는 초기 시드 전이라 무관).
- **그룹 분할 동시 INSERT 초과**: 두 신규 유저가 동시에 같은 group_no를 골라 30명을 살짝 넘길 수 있음(경미한 불균형, v1.2 배정 잠금 여지 — ADR-0008)
- **SQL 로컬 테스트 파이프라인 없음** — migration 수동 SQL Editor 적용. shared 1:1 대응 + 리뷰 라인 대조로 정합성 보장
- 007 적용 전 pg_cron 미활성이면 `CREATE EXTENSION pg_cron` 실패 가능(플랜별) — cron 블록만 수동 처리
- 웹은 오프라인 캐시 미지원(db.web.ts no-op) — 의도된 네이티브 전용
- completeSession 이중 호출 시 리그 XP 이중적립 이론상 가능 — 더블탭 가드(finishingRef)로 완화, 완전 멱등 미적용
- npm audit: mobile 11 moderate(@expo 빌드타임 전이)·shared 6 high(vitest 1.x 전이) — 런타임 비도달·exception

## Context for Next Session

- **사용자 목표**: MASTER-PLAN 기반 말해보카급 풀스위트 영어 학습 앱 — v1.0 전 Phase 코드 완결. 현재 "배포·검증·출시" 단계 + v1.1 기능 확장 + 콘텐츠 품질화(검수 완료) 진행 중
- **즉시 할 일 후보**: ① 배포 절차 점검·가이드화(Supabase 001~008·pg_cron·Edge·EAS) ② v1.1 다음 항목(원격 푸시 발송 / IAP) ③ 실서버 배포 후 그룹 분할 실데이터 검증 ④ 프로토타입(docs/prototype/index.html) 관련 작업(미착수)
- **개발 방식**: `/ted-run <plan doc>` 또는 plan 모드 → TDD → 구현 → 이중 리뷰 → 5관문 → ADR/커밋. 콘텐츠는 batch 수정 → generate 재실행 단일 출처 원칙. shared 순수 함수 ↔ SQL 1:1 일치 유지
- **제약·선호**: 커밋 한글, 커밋·푸시 분리(푸시는 명시 요청 시만), Expo SDK 56 versioned docs 확인(AGENTS.md)
- **검증 명령**: 콘텐츠 생성기: `python3 -m pytest scripts/test_generate_*.py`(68); `packages/shared`: `npx vitest run`(228); `apps/mobile`: `npx jest`(201) / `npm run typecheck`; web: `npx expo export --platform web`
- **migration 번호**: 001 schema, 002 words seed(어휘 검수로 재생성), 003 P1/P2 fixes, 004 grammar, 005 listening, 006 speaking, 007 league+push, 008 league group_no 분할

## Files Modified This Session

- **수정**: scripts/word_batches/batch_01·02·03·04·06·07·08·09.txt, content/toeic-800-pack.json, supabase/migrations/002_words_seed.sql, CHANGELOG.md, HANDOFF.md
