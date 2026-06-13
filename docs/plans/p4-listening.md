# p4-listening.md — Listening (P4)

> TTS 기반 리스닝(재생→comprehension 퀴즈)과 Memory Booster를 구축한다.
> 오디오 파일 없이 expo-speech 실시간 TTS로 시작한다 (비용·오프라인 이점).

## 0. 메타

| 항목 | 값 |
|------|-----|
| Phase | **P4** — Listening |
| 본 chunk | TTS 재생 + 속도 조절 + comprehension 퀴즈 + Memory Booster |
| 트랙 | `apps/mobile` + `supabase/` + `scripts/` |
| 의존 | P1+P2 완료 (세션 기록, repository). P3와 순서 무관 (병행 가능) |
| UI 레퍼런스 | [프로토타입](../prototype/index.html) `#listening` |
| ted-run 적용 | ✅ |
| plan doc lifecycle | 본 doc → /ted-run 명시 호출 |

## 1. 목적

### 1.1 현 상태 (problem)

- `listening_clips` 테이블에 audio 소스·문항 구조가 없고 콘텐츠·UI 없음.
- MP3 제작·호스팅은 비용·운영 부담 — MVP에 과함.

### 1.2 목표 (DoD)

1. **TTS 재생** — `expo-speech`로 transcript 실시간 합성. 속도 0.75x/1.0x/1.25x = `rate` 파라미터 (오디오 파일 불필요, 마이그레이션으로 `audio_url` 컬럼은 예약만)
2. **재생 게이트** — 최소 1회 재생 후 문항 노출 (프로토타입 UX). "다시 듣기" 무제한
3. **comprehension 퀴즈** — 클립당 1~2문항 3지선다 (프로토타입 `#listening` 검증 — 모바일 한 화면 보기 수). `listening_questions` 테이블 신설
4. **따라 말하기 (선택)** — 버튼만 배치, 녹음·비교는 P5 STT 인프라 재사용 시 활성화 (P4에서는 disabled + 안내)
5. **기록 연동** — `study_sessions(module='listening')` + `quiz_attempts.listening_question_id`
6. **Memory Booster** — 최근 7일 학습 단어(`quiz_attempts` 기준)의 예문을 연속 TTS 재생하는 자동 모드. Review 탭 하단 진입(프로토타입 위치)
7. **1차 콘텐츠** — 클립 30개 (TOEIC 안내방송·사내공지·일상 monologue, 5~15초 분량 자체 작성) + 문항 50개. 200개는 증분

### 1.3 명시적 비목표 (out-of-scope)

- ❌ 원어민 녹음 MP3 / Supabase Storage 호스팅 (v1.1 — `audio_url` 컬럼만 예약)
- ❌ 발음 평가·따라 말하기 채점 (P5 이후)
- ❌ TED Talk 등 외부 콘텐츠 (저작권 — 자체 작성만)

## 2. 영향 범위

| 경로 | 변경 |
|------|------|
| `apps/mobile/lib/tts.ts` | **신규** expo-speech 래퍼 (rate 프리셋, 큐 재생, 중단) |
| `apps/mobile/app/quiz/listening.tsx` | **신규** 재생→퀴즈 화면 |
| `apps/mobile/app/(tabs)/review.tsx` | Memory Booster 진입 추가 |
| `apps/mobile/app/memory-booster.tsx` | **신규** 자동 재생 모드 |
| `apps/mobile/lib/data/listening.ts` | **신규** repository |
| `supabase/migrations/004_listening.sql` | **신규** 문항 테이블 + 시드 |
| `scripts/generate_listening_seed.py` | **신규** 배치 → SQL |

## 3. Supabase (migration 004)

```sql
ALTER TABLE listening_clips ADD COLUMN audio_url TEXT;          -- v1.1 예약
ALTER TABLE listening_clips ADD COLUMN tags TEXT[] DEFAULT '{}';
CREATE TABLE listening_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clip_id UUID REFERENCES listening_clips(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL,        -- {choices:[...]}
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE quiz_attempts ADD COLUMN listening_question_id UUID REFERENCES listening_questions(id) ON DELETE SET NULL;
-- RLS: listening_questions read_all (authenticated)
```

## 4. 동작 명세

- **재생**: `Speech.speak(transcript, { rate, language: 'en-US' })`. 재생 중 웨이브 애니메이션, 완료 콜백에서 문항 노출
- **Memory Booster**: 대상 = 최근 7일 `quiz_attempts` 단어 중 `example_en` 보유 단어. "단어 → (1초) → 예문" 순서로 큐 재생, 화면에 단어·뜻 카드 동기 표시, 백그라운드 진입 시 일시정지
- **iOS 무음 스위치**: expo-av Audio mode `playsInSilentModeIOS` 설정 — SDK 56 문서로 확인 (AGENTS.md)

## 5. 테스트

| 테스트 | 방법 |
|--------|------|
| tts 래퍼 단위 | jest mock — rate 매핑, 큐 순서, stop 동작 |
| 재생 게이트 | RTL — 재생 전 문항 미노출 |
| 콘텐츠 파서 | python: 문항 정답 포함 검증 |
| Manual E2E | 실기기 — 무음 스위치·백그라운드·속도 3단 체감 (시뮬레이터 TTS 음질 상이) |

## 6. 완료 체크리스트

- [x] migration 005 생성(004는 grammar가 점유 → 번호 이월) + 클립 30/문항 50 시드 — Supabase 실서버 적용·human review는 대기
- [x] tts.ts 래퍼 + 테스트 (세대 기반 큐 취소·onError 처리 — ADR-0005)
- [x] 리스닝 화면: 재생 게이트·속도 3단·퀴즈·해설
- [x] 따라 말하기 placeholder (P5 연동 지점 주석)
- [x] Memory Booster 자동 재생 + 백그라운드 정지/복귀 재개 (XP 0 정책 — ADR-0005)
- [x] 세션·attempts 기록 + XP 연동 (`xpForQuizSession`)
- [ ] 실기기 오디오 검증 (iOS 무음 모드 포함) — 사용자 실기기 필요
- [x] typecheck + 전체 테스트 PASS (jest 83 / vitest 118 / python 22, E2E 4시나리오)
