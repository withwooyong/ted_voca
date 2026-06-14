# ADR-0009: 원격 푸시 발송은 관리자 시크릿 인증 Edge Function + 무효 토큰 자동 정리

- 상태: 승인됨
- 날짜: 2026-06-14
- 관련: [p6-gamification.md](../plans/p6-gamification.md), [ADR-0006](ADR-0006-speaking-ai-edge-function.md), [007_league_push.sql](../../supabase/migrations/007_league_push.sql)

## 컨텍스트

P6에서 `push_tokens` 테이블(007)과 클라이언트 토큰 수집(`savePushToken`)까지는 구현됐으나
**서버에서 실제로 푸시를 쏘는 경로가 없었다**(수집만). v1.1 "원격 푸시 발송"은 수집된 토큰들에
캠페인 푸시를 발송해 "수집 → 발송" 루프를 닫는 작업이다.

대량 발송은 **서비스 관리 작업**(일반 사용자가 아니라 운영자가 트리거)이고, Expo Push API는
디바이스 무효 토큰(앱 삭제·재설치 등)을 `DeviceNotRegistered`로 통지한다. 인증·무효 토큰 정리·
대량 발송 청킹이 설계 결정의 핵심이다.

## 결정

### 1. 발송은 Edge Function `push-send`, P5 DI 패턴 재사용 (handler.ts 순수 + index.ts deps)

ADR-0006 `speak-feedback`과 동일하게 `handler.ts`의 `handlePushSend(req, deps)`가
deps(isAdmin / fetchTokens / sendExpo / deleteTokens)를 주입받아 부수효과 없이 테스트된다
(deno test 27케이스). 실제 deps 조립은 `index.ts`. **shared(vitest)가 아니라 handler.ts에 둔 이유**:
Expo Push 발송은 Deno 런타임·서버 전용 로직이라 모바일/공유 코드가 쓰지 않는다 — Edge 안에서
완결하는 것이 응집도가 높다(speak-feedback 선례 동형).

### 2. 인증 = 공유 관리자 시크릿 헤더 (`X-Admin-Secret`), `is_admin` 컬럼 미도입

- `index.ts`의 `isAdmin`이 `X-Admin-Secret` 헤더를 `Deno.env.PUSH_ADMIN_SECRET`와 **상수시간 비교**
  (타이밍 공격 완화 — 길이 먼저 확인 후 XOR 누적). env 미설정 시 항상 거부(**fail-closed**).
- `profiles.is_admin` 플래그(+ user JWT) 대신 시크릿을 택한 이유: **스키마 무변경** + 서비스 관리
  작업이라 사용자 권한 모델과 분리하는 편이 단순·안전. 관리 콘솔 연계가 필요해지면 v1.1+에서 전환 가능.
- `config.toml`에 `[functions.push-send] verify_jwt = false` — 플랫폼 게이트가 user JWT를 요구해
  관리자 curl을 막지 않도록. 인증 책임은 핸들러 `isAdmin`이 단독으로 진다.

### 3. 무효 토큰은 ticket의 `DeviceNotRegistered`만 자동 삭제 (다른 에러는 보존)

- `extractInvalidTokens`가 티켓을 토큰과 **인덱스 정렬**로 대응시켜 `status==='error' &&
  details.error==='DeviceNotRegistered'`인 토큰만 수집 → `deleteTokens`로 정리.
- `MessageRateExceeded` 등 일시 장애 코드는 삭제하지 않는다(정상 토큰을 잃지 않기 위함).
- 삭제는 **best-effort**: 실패해도 응답을 깨지 않는다(다음 발송 시 재시도).
- ⚠️ **한계**: `DeviceNotRegistered`는 주로 ticket이 아니라 **receipt(2차 폴링, push/getReceipts)**
  단계에서 확정된다. 본 MVP는 ticket 레벨 에러만 처리 → 일부 무효 토큰이 남을 수 있다.
  receipt 폴링은 v1.1+ 후속(서버 큐·지연 폴링 필요).

### 4. 대량 발송 청킹 + best-effort 격리

- `chunk(rows, 100)` — Expo Push API의 요청당 100 메시지 상한 준수.
- 청크 발송 `sendExpo` throw(네트워크·5xx)는 격리: 해당 청크 토큰을 error로 카운트하고 나머지 청크는
  계속 진행한다(부분 실패가 전체 캠페인을 중단시키지 않음).
- 검증 순서: **OPTIONS → 관리자 인증(401) → JSON 파싱(400) → 필드 검증(400) → 0토큰 조기 종료
  → 청크 발송 → 무효 토큰 정리 → 200 요약**.

### 5. 응답·로그에 토큰 값 미노출

핸들러는 `{ sent, failed, invalidated }` 카운트만 반환한다. `expo_token` 값은 응답·에러·로그
어디에도 남기지 않는다(speak-feedback의 "키·응답 미노출" 원칙 승계).

### 6. 선택적 tier 필터 — 주 경계 키는 SQL과 1:1

`tier`가 주어지면 이번 주(UTC 월요일) 해당 리그 티어의 `user_id`만 대상. `index.ts`의
`isoUtcMonday()`가 007/008 SQL의 `date_trunc('week', now() AT TIME ZONE 'UTC')`·shared
`weekStartKey`와 동일한 ISO 월요일을 산출한다(리그 보드 정합성과 동일 기준).

## 결과

- 장점: 토큰 수집 → 발송 루프 완결, DI로 외부 API 없이 deno test 27 green, 시크릿 fail-closed +
  상수시간 비교 + 토큰 미노출, 무효 토큰 자동 정리, 청킹·부분 실패 격리.
- 단점: receipt 2차 폴링 미구현(일부 무효 토큰 잔존 가능), 레이트리밋 재시도/백오프 없음(실패 카운트만),
  시크릿 1개 공유라 로테이션은 수동(DEPLOY.md 안내), 실 발송은 Supabase 실배포 + `PUSH_ADMIN_SECRET`
  secret 필요(로컬은 핸들러 단위 테스트까지).
- 검증: deno test 27 green(speak-feedback 12 회귀 포함 39), `deno check index.ts` 통과,
  mobile typecheck·shared vitest 무영향(독립 추가).
- 잔여(외부/후속): Edge 실배포 + secret 설정 + 실기기 발송 검증, receipt 폴링·레이트리밋 백오프(v1.1+),
  리그 정산 자동 푸시(cron→HTTP).
