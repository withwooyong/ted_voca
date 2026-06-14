# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/).

## [Unreleased]

### Added
- (없음)

---

## [2026-06-14] v1.1 원격 푸시 발송 — 캠페인 발송 파이프라인 (`2ae5255`)

### Added
- `supabase/functions/push-send/` — 관리자 시크릿 인증 Edge Function. 수집된 `push_tokens`에 Expo Push API로 캠페인 푸시 발송 + 무효 토큰(`DeviceNotRegistered`) 자동 정리. P5 `speak-feedback` DI 패턴(handler 순수 + index Deno deps) 재사용.
  - `handler.ts` — 순수 DI 핸들러 + 헬퍼(`chunk`/`sanitizeField`/`buildMessages`/`extractInvalidTokens`/`summarize`). 검증 순서: OPTIONS → 관리자 인증(401) → JSON(400) → 필드(400) → 0토큰 조기종료 → 100개 청킹 발송(throw 격리) → 무효 토큰 정리(best-effort) → 200 `{sent,failed,invalidated}`.
  - `index.ts` — Deno serve. `X-Admin-Secret` 상수시간 비교(env 미설정 시 fail-closed), service role 토큰 조회/삭제, Expo Push 발송, 선택적 tier 필터(이번 UTC 주 — SQL `date_trunc('week')`와 동치).
  - `index.test.ts` — deno test 27케이스(인증/검증/0토큰/정상발송/무효토큰정리/타에러보존/청킹/격리/토큰미노출/헬퍼 단위).
- `docs/ADR/ADR-0009-remote-push-send.md` — 결정 기록(관리자 시크릿 인증·ticket 기준 무효 토큰 정리·청킹·receipt 폴링 미구현 한계).

### Changed
- `supabase/config.toml` — `[functions.push-send] verify_jwt = false`(user JWT 아닌 시크릿 인증, 핸들러 `isAdmin` 단독 책임).
- `docs/DEPLOY.md` — §D-2 push-send 배포·`PUSH_ADMIN_SECRET` secret·curl 호출 예시·시크릿 로테이션 추가. 전체 흐름 D단계 표기 갱신.
- `docs/MASTER-PLAN.md` — v1.1 후속 표의 원격 푸시 발송 ⬜ → ✅ 코드 완결.

---

## [2026-06-13] 프로토타입 동기화 (`45da25c`)

### Added
- 인터랙티브 프로토타입(`docs/prototype/index.html`)에 구현 화면 3개 추가 — Memory Booster(P4, 최근 7일 문장 자동 TTS·XP 0), 문법 사전(P3, 20토픽 CEFR 그룹핑·약점 추천), 알림 설정(P6, 복습/streak/리그 3종 토글)
- 진입점 연결 — 복습 카드→Memory Booster, 문법 '규칙 보기'·학습 허브→문법 사전, 프로필 알림→알림 설정

### Changed
- 리그 화면 v1.1 group_no 분할 반영 — '실버 리그 · 그룹 2'(28명), 그룹 내 상위10 승급/하위5 강등선, `buildLeague` 그룹 기준 재구성
- SCREENS 21개 확장 + 신규 화면 NOTES(검증 포인트) 추가, 리그 NOTES를 그룹 기준으로 갱신

### Fixed
- `gdDraw` 약점 span 따옴표 이스케이프 버그(`style=\'`) 수정 — node 시뮬레이션으로 생성 HTML 검증
- 검증: `node --check` JS 문법 OK, `go()` 21개 전부 section 매칭, SCREENS=sections=21

---

## [2026-06-13] 배포 절차 가이드화 (`930a987`)

### Added
- `docs/DEPLOY.md` 배포 런북 — 실서버 배포 5단계(Supabase 생성·마이그레이션 001~008·pg_cron·Edge Function·EAS 빌드/제출)를 실행 가능한 순서·명령·검증으로 정리
- 마이그레이션 의존성·주의 명시: SQL Editor 번호 순 수동 적용, 007=pg_cron 선행·008=007 이후, 콘텐츠 시드 `ON CONFLICT DO NOTHING` 재시드 미갱신, pg_cron Extensions 선행 활성화
- Edge `speak-feedback`: `OPENAI_API_KEY`만 수동 secret(SUPABASE_* 자동 주입)·`verify_jwt=true`
- 발견 갭: `EXPO_PUBLIC_*` env가 eas.json/EAS env에 없어 빌드 시 Dev Mock으로 빌드될 위험 → `eas env:create` 주입 절차로 보강
- 배포 후 검증 체크리스트(30명+ group_no 분할 실데이터 검증 포함)

### Changed
- `supabase/README.md` 현행화 — P1 시점 outdated 내용 → 현재 마이그레이션 목록 + DEPLOY.md 포인터로 교체

---

## [2026-06-13] 콘텐츠 human review 2차 — 어휘 (`b66d93a`)

### Changed
- 어휘 toeic-800 검수 수정 11건(HIGH 6 + 명백 LOW 5) — 510단어(batch_01~10) 5개 병렬 전문 검수
- HIGH: `collection` 불가산 명사 관사 오류(`A data collection` → `Data collection`), `deduct` 타동사 자동사 오용 비문(`Taxes deduct from` → `We deduct taxes from`), `exercise` 비문 예문+협소 의미(`행사` → `운동, 행사` + 명사 예문)
- 명백 LOW: `apologize` 명령형 register(`Please apologize` → `We apologize`), `besides`(prep) 부사뜻→전치사뜻(`게다가` → `~외에도`), `custom` 비표준 영어(`It is custom to` → `It is the custom to`), `due` 관사 누락(`first of month` → `first of the month`), `aim` 예문 정합(`겨냥하다` → `목표로 하다`)
- toeic-800-pack 재생성(510단어) → migration 002_words_seed.sql 동기화, pytest 68 통과

### Fixed
- `distinction` 오역 — meaning_ko `차별` → `차이, 구별`(예문은 '구별' 의미, 퀴즈 정답 깨짐 결함)
- `each`/`either` pos enum 정합 — `determiner`(VALID_POS 외, SQL서 `other`로 강제 매핑되며 tags/pos 불일치) → `other`

### 검수 결과
- 리스닝 batch_01(17 clip·25문항): 결함 없음 — 정답·transcript·해설 전부 정합, 수정 없음
- 미적용 6건: `affair`·`cell`·`compound`·`entry`·`fashion`·`deliver`(현행 허용 범위 내 취향성, 1차 보수적 기준 유지)

---

## [2026-06-13] 콘텐츠 human review 1차 (`16a68b4`)

### Changed
- 문법 콘텐츠 검수 수정: 가정법 조건절 누락(`She would know the answer here` → `If Mary were here, she would help us`), 관사 한영 일치(`that table` → `on my desk`), 관계대명사 단수 일치(`red caps` → `a cap`)
- 리스닝: 비표준 "손님센터" → "고객 서비스 데스크"(shopping-lost-child transcript_ko + 해설)
- 회화: job-interview 힌트 직역투 다듬기("혁신에 대한 집중에 끌렸습니다" → "혁신을 중시하는 점에 끌렸습니다")
- 레벨테스트 lt-d5-04 해설: "감동시켰다"·"그의" 성별 단정 → "우리에게 깊은 인상을 준 지원자"
- 3개 콘텐츠 팩 재생성(grammar 200·listening 50·speaking 68) → migration 004·005·006 SQL 동기화

### Fixed
- 문법 error_find 무오류 문항 교체(`Please open a window near you` — 틀린 부분 없음 → `I saw a moon last night`, 유일 대상 the 학습)

### Removed
- 추적되던 `scripts/__pycache__/*.pyc` Git 추적 해제(.gitignore 기등록 잔재)

---

## [2026-06-13] v1.1 리그 group_no 분할 (`b77fc95`)

### Added
- 리그 group_no 분할(v1.1): 각 tier를 30명 단위 그룹으로 쪼개 랭킹·승강등·보드를 `(tier, group_no)` 단위로 동작
  - `packages/shared/league.ts`: `assignGroupNos`(주간 시드 — user_id 정렬 후 floor(index/30)), `pickGroupNoForNewEntry`(신규 적립 — 여유 그룹 최소→max+1→0), `LeagueEntryLike.group_no?` — vitest 213→228
  - migration 008: `league_entries.group_no` 컬럼 + `increment_league_xp`(신규 행 group_no 배정)·`get_league_board`(본인 그룹만)·`finalize_league`(그룹 내 정산 + 새 tier 기준 group_no 재편) 교체. pg_cron은 함수만 교체되어 재등록 불필요
  - `LeagueSummary.groupNo` 노출(remote me-row, local Dev Mock=0), LeagueBoard `groupNo>0`일 때 "그룹 N" 라벨

### Changed
- 데이터 레이어 `LeagueSummary`에 `groupNo` 필드 추가(remote `get_league_board` 그룹 스코프 결과 + me-row select에 `group_no`)

### Docs
- ADR-0008: group_no 분할·user_id 정렬 배정·동시 INSERT 한계 근거. MASTER-PLAN v1.1 후속 표 추가, HANDOFF 마이그레이션 목록 001~008

---

## [2026-06-13] P6 Gamification

### Added
- 주간 리그: 홈 리그 카드(티어·내 순위·승급까지 XP 차이) → 리그 화면(티어 배지 🥉🥈🥇·보드·본인 하이라이트·승급/강등선·마감 N일 카운트다운)
- `packages/shared/league.ts`: 순수 로직 — `weekStartKey`/`daysUntilWeekEnd`(UTC 월요일), `rankEntries`(xp desc+user_id asc), `outcomeForRank`(승급 우선·그룹≤5 강등 없음), `nextTier`(clamp), `buildLeagueView` — vitest 61, cov 100%
- migration 007: `increment_league_xp`(회당 cap 500·누적 2e9 오버플로우 방어·week_start 서버 강제·원자적 가산)·`get_league_board`(본인 tier 그룹, **user_id/email 비노출**)·`finalize_league`(승강등 정산) SECURITY DEFINER + pg_cron 매주 UTC 월요일 00:00 정산 + `push_tokens`(own-row RLS)
- 로컬 알림 3종: `planNotifications`(순수 — 복습 리마인더/streak 보호/리그 마감) + `createExpoScheduler`(SDK56 DAILY/WEEKLY 트리거) + `syncNotifications`(권한→재스케줄), 알림 설정 화면(토글·시각 칩, `tv_notif_prefs`)
- 오프라인 캐시+sync: `queue.ts`(dedupe/order/removeSynced 순수)·`sync.ts`(`flushQueue` 첫 실패 중단·`flushPendingQueue` DB연동)·`db.ts`(expo-sqlite SDK56) + 데이터 레이어 league/push dual-mode
- 스토어 준비: `eas.json`(build/submit 프로필), `app.json`(expo-notifications plugin·알림/마이크 권한·P5 누락 infoPlist 보완), `docs/store/`(개인정보처리방침·스토어 등록 문구)
- ADR-0007: 리그 쓰기 RPC 전용·보드 PII 비노출·tier=그룹·pg_cron·알림 순수함수·오프라인 플랫폼 분기 근거

### Changed
- 홈: 리그 placeholder → 실데이터 카드(`/league` 진입), 포커스 시 오프라인 큐 flush(best-effort)
- 프로필: "알림 설정" 진입 카드
- `completeSession`(local·remote): XP 적립 시 `addLeagueXp` best-effort 연동(실패해도 세션 결과 보존)
- `lib/data/remote.ts`: `recordAttempt`를 폴백판/`recordAttemptRaw`(폴백 없음, flush 전용)로 분리, `constants/theme.ts`에 `primaryTint` 토큰 추가

### Fixed
- 이중 리뷰 검출 전건 수정: `league_entries` 직접 쓰기 RLS로 XP·tier 치팅 가능(2b CRITICAL → insert/update_own 정책 회수, 쓰기 RPC 전용), `outcomeForRank` 그룹≤5에서 선두까지 강등(2a CRITICAL → groupSize>DEMOTE 가드, SQL 동기화), 홈이 마스킹된 user_id로 `buildLeagueView` 재계산→xpToPromote 오계산(2a CRITICAL → 서버 rank 직접 사용), flush가 미지원 타입 무음 삭제(2a HIGH → throw로 큐 보존), `increment_league_xp` INT 오버플로우(2b HIGH → 2e9 cap)
- web export 실패(expo-sqlite wa-sqlite worker/wasm) → `db.web.ts` no-op 플랫폼 스텁으로 네이티브 전용화

---

## [2026-06-13] P5 Speaking + AI (`45aa9fb`)

### Added
- 회화 시나리오: 목록(레벨 잠금·일일 잔여 횟수) + 턴제 대화(Ted TTS → 사용자 발화 → 피드백 카드 → 다음 턴), 완료 화면(XP·좋은 발화 수)
- STT 어댑터 `lib/stt.ts`: on-device(expo-speech-recognition, 권한·15s 타임아웃·리스너 정리) / mock(Dev Mock 힌트 자동입력) 교체식 + `getSttAdapter` 팩토리
- Edge Function `speak-feedback`: 순수 핸들러(DI) + index 진입점. 인증→바디→길이→turnOrder→한도→LLM(gpt-4o-mini)→저장 흐름. deno test 12
- 비용 안전장치: 일일 10회 **원자적 RPC**(`increment_speaking_usage`, row lock 직렬화), 500자 cap(Edge 강제), LLM 실패 시 규칙기반 폴백, 키는 Edge secret + `config.toml` verify_jwt
- `packages/shared/speaking.ts`: 채점(Dice 유사도)·`localFeedback`·`isScenarioLocked`·`xpForSpeakingSession` 등 순수 로직 — vitest 34, cov 100%
- 콘텐츠 파이프라인: batch → `speaking-pack.json` + `migrations/006_speaking.sql` 이중 출력, 시나리오 10/턴 68(AI 초안), 파서 unittest 30
- migration 006: `speaking_usage`·`speaking_attempts`(본인 row RLS)·원자적 usage RPC, `speaking_scenarios` emoji/min_level/sort_order, `dialogue_turns` UNIQUE(scenario_id,turn_order)
- `DialogueSession` 컴포넌트(ConcurrentRoot 게이트로 Ted 자동진행) + 데이터 레이어 speaking dual-mode(local: localFeedback·AsyncStorage usage / remote: Edge invoke)
- ADR-0006: Edge Function 경유 LLM·비용 안전장치·STT 어댑터 근거

### Changed
- learn 허브: 회화(AI) 잠금 해제 → `/speaking` 진입

### Fixed
- 이중 리뷰 검출: 한도 비원자성 TOCTOU 비용폭탄(C1, 원자적 RPC), Edge 응답 형상 불일치 프로덕션 크래시(C-1), Dev Mock STT off-by-one(H-1), turnOrder 미검증→500(H2), verify_jwt 코드 미고정(H1), 프롬프트 태그 탈출·LLM 출력 미정제(M2), STT 리스너 재시작 누적(M-1)

---

## [2026-06-13] P4 Listening (`fb040b2`)

### Added
- P4 Listening: TTS 재생(0.75x/1.0x/1.25x) → 재생 게이트 → comprehension 퀴즈 3지선다 → 해설, 따라 말하기 placeholder(P5 연동 지점)
- Memory Booster: 최근 7일 학습 단어의 lemma→예문 연속 TTS 자동 재생, 백그라운드 정지/복귀 재개, XP 0 정책 (Review 탭 진입 카드)
- `lib/tts.ts`: expo-speech+expo-audio(SDK 56, `playsInSilentMode`) 래퍼 — 세대(generation) 기반 큐 취소·onError 처리 (회귀 테스트 포함)
- `packages/shared/listening.ts`: 채점·클립 선택·`buildBoosterQueue`(7일 경계·dedupe·example_en 필터) — vitest 33케이스, cov 100%
- 리스닝 콘텐츠 파이프라인: batch 텍스트 → `listening-pack.json` + `migrations/005_listening.sql` 이중 출력, 클립 30/문항 50(AI 초안, human review 필요), 파서 unittest 22
- migration 005: `listening_questions` 신설(RLS read_all, `UNIQUE(clip_id, sort_order)`), `quiz_attempts.listening_question_id`, `quiz_type` enum 'listening', `listening_clips`에 slug(백필+NOT NULL+UNIQUE)·audio_url(v1.1 예약)·tags·sort_order
- `ClipSession` 컴포넌트(재생 게이트 — `useSyncExternalStore` 외부 스토어로 네이티브 onDone 동기 flush) + 데이터 레이어 리스닝 dual-mode 확장
- ADR-0005: 실시간 TTS 채택·세대 기반 큐 제어·Booster XP 0 근거

### Changed
- learn 허브: 리스닝 잠금 해제 → `/quiz/listening` 진입
- review 탭: Memory Booster 진입 카드 (empty/done/reviewing 전 phase)
- plan §1.2.3 4지선다 → 3지선다 현행화 (프로토타입 검증 근거)

### Fixed
- 리뷰 검출 6건: TTS 큐 재시작 시 구 콜백의 신 큐 오염(H-1, 세대 카운터), 엔진 오류 시 promise 영구 hang(H-2), migration slug NULL의 UNIQUE 우회(M-1), booster 언마운트 후 setState(M-2), TTS 실패 시 무한 침묵 게이트(L-2), tts 테스트의 expo-av 시절 키(`playsInSilentModeIOS`) 단언 교정

### Removed
- (없음)

---

## [2026-06-12] Session Summary

### Added
- P3 Grammar: 문법 퀴즈 3유형(어순 탭 배열·빈칸 선택·오류 찾기) + 오답 해설·규칙 보기 (`74f8da2`)
- 문법 사전 화면: CEFR 그룹 토픽 목록 + 상세 + 토픽 한정 출제 진입 (`74f8da2`)
- 문법 콘텐츠 파이프라인: batch 텍스트 → `grammar-pack.json` + `migrations/004_grammar.sql` 이중 출력, 20토픽/200문항(AI 초안, human review 필요), 파서 unittest 16 (`74f8da2`)
- `packages/shared/grammar.ts`: 어순 채점 정규화·칩 셔플(항등 회피)·세션 선택·약점 추천 — vitest 18케이스 (`74f8da2`)
- `WordOrderBuilder` 컴포넌트 (controlled 칩 배열) + 데이터 레이어 문법 dual-mode 확장 (`74f8da2`)
- migration 004: `quiz_attempts.grammar_question_id`, `quiz_type` enum 'grammar', `grammar_topics.tags`, `UNIQUE(topic_id, sort_order)` (`74f8da2`)
- P0~P1+P2 전체 초기 구축: Expo 앱 골격, SM-2 SRS, 어휘 퀴즈 3종, 레벨 테스트, 통계, 단어 시드 510, 테스트 인프라(vitest/jest-expo), 인터랙티브 프로토타입, P0~P6 작업계획서, ADR-0001~0003 (`4e7d761`)

### Changed
- learn 허브: 문법 잠금 해제 + weak_tags 기반 "Ted 추천" 카드 (`74f8da2`)
- 어휘 난이도 조절 입력(`getRecentResults`)에서 문법 attempt 제외 — 양 모드 (`74f8da2`)
- vocab/grammar 퀴즈 next()에 동기 더블탭 가드(finishingRef) — XP 이중 적립 방지 (`74f8da2`)

### Fixed
- 문법 콘텐츠 오류 9건: 생성기 검증이 칩 중복 등 6건, 코드리뷰가 한국어-영어 주어 불일치 등 3건 차단·수정 (`74f8da2`)

### Removed
- (없음)
