# ADR-0005: 리스닝은 expo-speech 실시간 TTS + 세대 기반 큐 제어

- 상태: 승인됨
- 날짜: 2026-06-13
- 관련: [p4-listening.md](../plans/p4-listening.md), [ADR-0004](ADR-0004-grammar-content-pipeline.md)

## 컨텍스트

P4 Listening은 클립 재생 → comprehension 퀴즈 → Memory Booster(최근 학습 문장 자동 연속 재생)가 핵심이다.
원어민 녹음 MP3는 제작·호스팅 비용과 운영 부담이 MVP에 과하고, Memory Booster는 콘텐츠가
사용자별·동적(최근 7일 학습 단어)이라 사전 녹음이 불가능하다.

## 결정

### 1. 오디오 파일 없이 expo-speech 실시간 합성 (audio_url은 예약만)

- 재생 = `Speech.speak(transcript_en, { rate, language: 'en-US' })`. 속도 3단(0.75x/1.0x/1.25x)은
  `rate` 파라미터 매핑(`LISTENING_RATES`, shared 순수 상수)으로 해결 — 오디오 파일이면 3벌 필요했다.
- `listening_clips.audio_url` 컬럼만 migration 005에 예약 — v1.1에서 원어민 MP3 도입 시
  "audio_url 있으면 파일 재생, 없으면 TTS" 폴백으로 무중단 전환 가능.
- **SDK 56 주의**: 무음 스위치 대응은 expo-av가 아니라 **expo-audio**의
  `setAudioModeAsync({ playsInSilentMode: true })` (plan 문서의 expo-av 표기는 구식).
  expo-speech 옵션에 `useApplicationAudioSession: true`를 함께 전달해 앱 오디오 세션 설정이 적용되게 한다.

### 2. TTS 큐는 세대(generation) 카운터로 취소 제어

네이티브 TTS 콜백(onDone)은 `Speech.stop()` 이후에도 늦게 발화할 수 있다. boolean 취소 플래그는
새 큐 시작 시 리셋되는 순간 구 큐의 지연 콜백이 검사를 통과해 **두 큐가 동시 진행되는 오염**이 생긴다
(2a 리뷰 H-1). 모듈 레벨 `generation`을 stop/새 큐 시작 시 증가시키고, 모든 콜백·타이머가
자기 세대와 불일치하면 무시한다. 엔진 오류(onError)는 `'stopped'` resolve로 처리해 promise hang을 막는다(H-2).

### 3. 콘텐츠는 batch 텍스트 단일 소스 → JSON+SQL 이중 출력 (ADR-0004 패턴 승계)

`scripts/listening_content/batch_*.txt` (clip/q 라인) → `generate_listening_seed.py` →
`content/listening-pack.json`(local 번들) + `migrations/005_listening.sql`(remote 시드).
클립 30개·문항 50개(3지선다 — 프로토타입 검증 결정), AI 초안으로 `# TODO(content-review)` 표기.
idempotent: clips `ON CONFLICT (slug)`, questions `ON CONFLICT (clip_id, sort_order)`,
slug는 백필 후 `NOT NULL` 강제(리뷰 M-1 — NULL slug의 UNIQUE 우회 차단).

### 4. Memory Booster는 XP 0 + stop/재개 방식

- 자동 재생은 사용자 행동이 없어 **XP 0** — 켜놓기만 해도 XP가 쌓이는 파밍을 구조적으로 차단.
  세션 기록(`module='listening'`)과 duration만 남긴다.
- 백그라운드 일시정지는 `Speech.pause()`가 **Android 미지원**이므로 stop + 항목 인덱스 보관 →
  active 복귀 시 그 항목부터 재생하는 방식으로 통일.
- 리스닝 attempt는 `listening_question_id`만 갖고 `word_id`가 없어 어휘 SRS·난이도 조절
  입력(`getRecentResults`)에 섞이지 않는다 (P3 문법과 동일 격리).

## 결과

- 장점: 오디오 비용 0, 오프라인 동작, 속도 조절 무료, Booster의 동적 콘텐츠 합성 가능
- 단점: TTS 음질이 원어민 녹음 대비 기계적 (시뮬레이터는 실기기보다 더 낮음 — 실기기 검증 필요),
  발음 평가용 정답 음원으로는 부적합 (P5에서 별도 판단)
- 검증: shared listening 100% cov, tts.ts 98% (회귀 테스트 H-1/H-2 포함), E2E 4시나리오 PASS
