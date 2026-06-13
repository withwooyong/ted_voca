# ADR-0006: Speaking은 Edge Function 경유 LLM + 비용 안전장치 + STT 어댑터

- 상태: 승인됨
- 날짜: 2026-06-13
- 관련: [p5-speaking-ai.md](../plans/p5-speaking-ai.md), [ADR-0002](ADR-0002-dual-mode-repository.md), [ADR-0005](ADR-0005-listening-tts-pipeline.md)

## 컨텍스트

P5 Speaking은 상황별 회화 시나리오 + 사용자 발화(STT) + LLM 피드백이다. 이 앱에서
**외부 API(OpenAI)·서버 비용·사용자 인증이 처음 개입하는 Phase**다. OpenAI 키를 클라이언트에
둘 수 없고(번들 추출 위험), 비용 폭탄(무제한 호출)과 프롬프트 인젝션이 실제 공격 표면이다.

## 결정

### 1. LLM 호출은 Supabase Edge Function `speak-feedback` 경유 (키는 서버 secret)

- 클라이언트(remote.ts)는 `supabase.functions.invoke('speak-feedback', {body})`만 호출. 키·프롬프트·usage·attempt 기록은 전부 Edge가 담당.
- `OPENAI_API_KEY`는 `Deno.env`로만 읽고 로그·응답·에러 메시지에 절대 노출하지 않는다(에러는 status code만).
- 모델 `gpt-4o-mini`, `max_tokens 300`, `temperature 0.3`, `response_format: json_object`.

### 2. 핸들러는 순수 함수로 분리 (DI) — 외부 API 없이 단위 테스트

`handler.ts`의 `handleSpeakFeedback(req, deps)`가 deps(getUser/checkAndIncrementUsage/callLlm/saveAttempt/getExpectedTurn)를 주입받아 부수효과 없이 테스트된다(deno test 12케이스). 실제 deps 조립은 `index.ts`. 검증 순서: **인증(401) → 바디(400) → 길이 cap(400) → turnOrder 정수 검증(400) → 일일 한도(429) → LLM(실패 시 폴백) → 저장(best-effort) → 200**.

### 3. 비용 안전장치 4중 + 보안 하드닝 (적대적 리뷰 반영)

- **일일 10회 — 원자적 RPC**: `increment_speaking_usage(p_user,p_date,p_limit)`가 `INSERT ... ON CONFLICT DO UPDATE SET count=count+1 WHERE count<limit RETURNING`로 row lock 직렬화. select-then-upsert는 동시 요청 TOCTOU로 한도를 우회당하므로(2b CRITICAL) 폐기. `SECURITY DEFINER` + `REVOKE ... FROM PUBLIC/authenticated/anon`로 service role만 실행.
- **user_id는 검증된 JWT에서** (클라이언트 body가 아님) — 남의 한도로 비용 전가 불가.
- **500자 cap은 Edge에서 강제** (클라이언트 검사는 UX용 보조). `turnOrder` 정수 검증으로 NaN→500·저장오염 차단.
- **프롬프트 인젝션 완화**: userText를 `<user_utterance>` 태그로 격리 + `<`/`>`를 전각 치환해 태그 탈출 차단. LLM 출력(correction/alternative)은 제어문자 제거 + 500자 cap(저장형 2차 피해 표면 축소).
- **verify_jwt 코드 고정**: `supabase/config.toml`에 `[functions.speak-feedback] verify_jwt = true` — 플랫폼 게이트 + 핸들러 getUser 이중(defense-in-depth).
- **API 실패 시 규칙 기반 폴백**: `callLlm` throw(키 미설정·장애) → `ruleBasedFeedback`(기대답안 비교)로 200 응답(`fallback:true`). 서비스 연속성 유지.

### 4. STT는 어댑터 인터페이스 (on-device / mock 교체)

`lib/stt.ts`의 `SttAdapter`: `createDeviceAdapter`(expo-speech-recognition, 권한·타임아웃 15s·리스너 정리·결과 1회 보장) / `createMockAdapter`(Dev Mock — 힌트 자동입력). `getSttAdapter`가 가용성·preferMock으로 선택. Whisper 폴백(녹음→Edge)은 어댑터 추가로 확장 가능 — v1.1.

### 5. Dev Mock 모드로 AI 없이 전 플로우 동작 (ADR-0002 dual-mode 승계)

Supabase 미설정 시: STT는 mock(기대답안 자동입력), 피드백은 `localFeedback`(shared 순수함수 — Dice 유사도 0.8/0.4 구간 → natural/ok/awkward), usage는 AsyncStorage. **OpenAI 없이 개발·테스트·E2E 가능**.

### 6. 콘텐츠는 batch → JSON+SQL 이중 출력 (ADR-0004/0005 패턴 승계)

`scripts/speaking_content/batch_*.txt` → `generate_speaking_seed.py` → `content/speaking-pack.json` + `migrations/006_speaking.sql`. 시나리오 10개·턴 68개(5~7턴, 첫 턴 ted·연속 user 금지), AI 초안. `min_level`로 레벨 잠금(레벨 1은 카페만 해제).

## 결과

- 장점: 키 안전, 비용 상한·원자적 한도, 인젝션 완화, Dev Mock으로 AI 비용 없이 개발, 어댑터로 STT 확장
- 단점: Edge Function 배포·secret 설정·실서버가 있어야 실 AI 동작(로컬은 폴백 품질). gpt-4o-mini 피드백 품질 한계. 시나리오 대부분 상위 레벨 잠금이라 신규 사용자는 카페만 접근(의도된 게이팅이나 콘텐츠 확장 필요)
- 검증: shared speaking cov 100%, jest 130·vitest 152·deno 12·python 30 green, 2a·2b 리뷰 PASS(CRITICAL/HIGH 0), E2E 4시나리오 PASS
- 잔여: Edge Function 실배포·OPENAI_API_KEY secret·실기기 마이크 권한 문자열(app.json infoPlist)·실 STT 인식률 검증은 인프라/실기기 필요
