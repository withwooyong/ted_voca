# p5-speaking-ai.md — Speaking + AI (P5)

> 상황별 회화 시나리오 + STT 입력 + LLM 피드백을 구축한다.
> 외부 API(비용·키 보안)가 개입하는 유일한 Phase — Edge Function 경유를 원칙으로 한다.

## 0. 메타

| 항목 | 값 |
|------|-----|
| Phase | **P5** — Speaking + AI |
| 본 chunk | 시나리오 대화 UI + STT + LLM 피드백 + 비용 안전장치 |
| 트랙 | `apps/mobile` + `supabase/`(Edge Functions) + `scripts/` |
| 의존 | P1+P2 완료. P3/P4와 순서 무관이나 P4의 tts.ts 재사용 (Ted 대사 읽기) |
| UI 레퍼런스 | [프로토타입](../prototype/index.html) `#speaking-list` `#speaking` |
| ted-run 적용 | ✅ |
| plan doc lifecycle | 본 doc → /ted-run 명시 호출 |

## 1. 목적

### 1.1 현 상태 (problem)

- `speaking_scenarios`/`dialogue_turns` 테이블만 있고 콘텐츠·UI·AI 연동 없음.
- OpenAI 키를 클라이언트에 둘 수 없음 — 서버 경유 구조와 비용 cap이 선결 과제.

### 1.2 목표 (DoD)

1. **시나리오 목록** — 난이도·턴 수 표시, 레벨 잠금(user level 기반), 일일 잔여 횟수 노출 (프로토타입 UX)
2. **대화 플로우** — 턴제: Ted 대사(TTS 재생) → 사용자 발화(STT) → 피드백 카드 → 다음 턴. `dialogue_turns.hint_ko`를 마이크 위 힌트로 노출
3. **STT** — 1차: `expo-speech-recognition`(on-device, 무료) — SDK 56 호환 검증 후 채택. 폴백: expo-av 녹음 → Edge Function 경유 Whisper API. 어댑터 인터페이스로 두 구현 교체 가능하게
4. **LLM 피드백** — Edge Function `speak-feedback`: (시나리오 컨텍스트, 기대 턴, 사용자 발화) → 3줄 피드백(자연스러움 판정 + 교정 + 대안 표현). 모델 gpt-4o-mini, max_tokens 제한
5. **비용 안전장치** — ① 일일 무료 10회(`speaking_usage` 테이블, Edge Function에서 검사·증가) ② 발화 텍스트 500자 cap ③ API 실패 시 규칙 기반 폴백 메시지(기대 답안 비교) ④ 키는 Edge Function secret
6. **기록** — `speaking_attempts` 테이블: 발화 텍스트·피드백·시나리오. 세션은 `study_sessions(module='speaking')`
7. **1차 콘텐츠** — 시나리오 10개(카페·호텔·미팅·길찾기 등) × 5~7턴. 25개는 증분

### 1.3 명시적 비목표 (out-of-scope)

- ❌ 자유 대화 (시나리오 스크립트 기반만 — 비용·품질 통제)
- ❌ 발음 점수화 (텍스트 피드백만)
- ❌ 유료 플랜·결제 (무료 10회 고정, v1.1)
- ❌ 음성 녹음 파일 저장 (텍스트만 — 프라이버시·스토리지)

## 2. 영향 범위

| 경로 | 변경 |
|------|------|
| `apps/mobile/app/speaking/index.tsx` | **신규** 시나리오 목록 |
| `apps/mobile/app/speaking/[slug].tsx` | **신규** 대화 화면 |
| `apps/mobile/lib/stt.ts` | **신규** STT 어댑터 (on-device / Whisper) |
| `apps/mobile/lib/data/speaking.ts` | **신규** repository |
| `supabase/functions/speak-feedback/` | **신규** Edge Function (Deno) |
| `supabase/migrations/006_speaking.sql` | **신규** usage·attempts 테이블 + 시드 (005는 P4 리스닝 점유 → 번호 이월) |
| `scripts/generate_speaking_seed.py` | **신규** 시나리오 배치 → SQL |

## 3. Supabase (migration 006)

```sql
CREATE TABLE speaking_usage (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  count INT DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
CREATE TABLE speaking_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scenario_id UUID REFERENCES speaking_scenarios(id),
  turn_order INT,
  user_text TEXT NOT NULL,
  feedback JSONB,             -- {verdict, correction, alternative}
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- RLS: 본인 row만. speaking_usage 증가는 Edge Function(service role)에서만
```

## 4. Edge Function 계약

```
POST /functions/v1/speak-feedback  (Authorization: user JWT)
req:  { scenarioSlug, turnOrder, userText }
res:  { verdict: 'natural'|'ok'|'awkward', correction: string, alternative: string, remainingToday: number }
429:  { error: 'daily_limit', remainingToday: 0 }
```

- JWT로 user 식별 → usage 검사/증가(atomic upsert) → 프롬프트 호출 → attempts 기록 → 응답
- 프롬프트: 시스템 역할 고정("간결한 영어 코치 Ted, 한국어 3줄 피드백"), few-shot 1개, temperature 0.3

## 5. Dev Mock 모드

Supabase 미설정 시: STT는 힌트 문장 자동 입력(프로토타입 방식), 피드백은 기대 턴과 단순 비교한 canned 응답. **AI 없이도 전체 플로우 개발·테스트 가능**해야 한다.

## 6. 테스트

| 테스트 | 방법 |
|--------|------|
| STT 어댑터 | jest mock — 어댑터 교체, 타임아웃, 권한 거부 처리 |
| Edge Function | deno test — limit 검사, 프롬프트 조립, 폴백 |
| 대화 플로우 | RTL — 턴 진행, 잔여 횟수 감소, 한도 도달 UI |
| Manual E2E | 실기기 — 마이크 권한, 실제 STT 인식률, 왕복 지연 체감 |

## 7. 완료 체크리스트

- [x] migration 006(005는 P4 점유) + 시나리오 10개/턴 68개 시드 — Supabase 실서버 적용·human review는 대기
- [x] STT 어댑터 (on-device + mock 교체식 — Whisper 폴백은 어댑터 추가로 v1.1)
- [x] Edge Function 핸들러 + deno test 12 — **실배포·secret 설정은 인프라 대기**
- [x] 일일 10회 cap (원자적 RPC) + 429 → 한도 안내 UI + 마이크 disabled
- [x] 대화 화면: TTS 대사 → STT(mock 자동입력) → 피드백 → 다음 턴
- [x] Dev Mock 모드 전체 플로우 (localFeedback, AI 없이 동작)
- [x] speaking_attempts/usage/sessions 기록 + XP(`xpForSpeakingSession`)
- [ ] 실기기 검증 (마이크 권한·실 STT 인식률·왕복 지연) — 실기기 + Edge 배포 필요
- [x] typecheck + 전체 테스트 PASS (jest 130 / vitest 152 / deno 12 / python 30, E2E 4시나리오)
