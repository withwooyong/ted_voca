# p6-gamification.md — Gamification + Launch (P6)

> 주간 리그, 푸시 알림, 스토어 출시 준비를 구축한다. v1.0 마지막 Phase.

## 0. 메타

| 항목 | 값 |
|------|-----|
| Phase | **P6** — Gamification + Launch |
| 본 chunk | 주간 리그 + 복습 리마인더 푸시 + 오프라인 캐시 + 스토어 준비 |
| 트랙 | `apps/mobile` + `supabase/`(Edge Functions, cron) + EAS |
| 의존 | P1~P5 완료 (XP 적립원이 모두 존재해야 리그가 의미 있음) |
| UI 레퍼런스 | [프로토타입](../prototype/index.html) `#league` |
| ted-run 적용 | ✅ |
| plan doc lifecycle | 본 doc → /ted-run 명시 호출 |

## 1. 목적

### 1.1 현 상태 (problem)

- XP는 쌓이지만 경쟁·리텐션 장치(리그·푸시)가 없음. `league_entries` 테이블만 존재.
- 스토어 제출 자산(아이콘·스크린샷·정책 문서)과 EAS 빌드 파이프라인 미구성.

### 1.2 목표 (DoD)

1. **주간 리그** — 주간 XP 집계 → 같은 티어 내 30명 그룹 랭킹. 티어: bronze/silver/gold. 매주 월요일 00:00 UTC 정산(상위 10 승급, 하위 5 강등) — `pg_cron` + SQL 함수
2. **리그 화면** — 내 순위 하이라이트, 승급선 표시, 마감 카운트다운 (프로토타입 UX)
3. **푸시 알림** — ① 복습 리마인더: **로컬 알림**(expo-notifications, 사용자 설정 시각 기본 09:00 — 복습 큐는 클라이언트가 알므로 서버 불필요) ② 리그 마감 D-1: 로컬 알림 ③ 원격 푸시 토큰 수집(`push_tokens` 테이블)은 v1.1 캠페인 대비 수집만
4. **streak 보호 알림** — 21:00까지 미학습 시 "Ted: streak 꺼지기 3시간 전!" 로컬 알림
5. **오프라인 캐시** — expo-sqlite: 단어팩 + 오늘 복습 큐 캐시, 오프라인 학습 결과 큐잉 → 재접속 시 sync (MASTER-PLAN DoD의 오프라인 요건)
6. **스토어 준비** — 앱 아이콘/스플래시 확정, app.json 메타데이터, 개인정보처리방침 문서, EAS Build 프로필(preview/production), TestFlight/내부 테스트 트랙 1회 제출

### 1.3 명시적 비목표 (out-of-scope)

- ❌ 결제·구독 (v1.1)
- ❌ 친구·소셜 기능 (비목표 고정)
- ❌ 원격 푸시 캠페인 발송 (토큰 수집까지만)
- ❌ 리그 봇 유저 채우기 (초기 유저 적을 때 그룹 미달 허용 — ADR 기록)

## 2. 영향 범위

| 경로 | 변경 |
|------|------|
| `apps/mobile/app/league.tsx` | **신규** 리그 화면 |
| `apps/mobile/lib/notifications.ts` | **신규** 로컬 알림 스케줄러 |
| `apps/mobile/lib/offline/` | **신규** sqlite 캐시 + sync 큐 |
| `apps/mobile/app/(tabs)/index.tsx` | 리그 카드 실데이터 |
| `supabase/migrations/006_league_push.sql` | **신규** 리그 정산 함수 + push_tokens |
| `supabase/functions/league-finalize/` | (pg_cron으로 충분하면 생략) |
| `apps/mobile/app.json`, `eas.json` | 스토어 메타·빌드 프로필 |
| `docs/store/` | **신규** 개인정보처리방침, 스토어 문구 |

## 3. Supabase (migration 006)

```sql
-- league_entries 활용 + 정산 함수
CREATE OR REPLACE FUNCTION finalize_league(p_week_start DATE) ... -- rank 부여, tier 승강등, 새 주 row 생성
SELECT cron.schedule('league-weekly', '0 0 * * 1', $$SELECT finalize_league(...)$$);

CREATE TABLE push_tokens (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  expo_token TEXT NOT NULL,
  platform TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, expo_token)
);
-- XP 적립 시 league_entries upsert (클라이언트 → RLS own-row)
```

## 4. 로컬 알림 정책

| 알림 | 시각 | 조건 |
|------|------|------|
| 복습 리마인더 | 09:00 (설정 가능) | 어제 학습 있었고 오늘 복습 큐 > 0 |
| streak 보호 | 21:00 | 오늘 세션 0 && streak ≥ 3 |
| 리그 마감 | 일요일 20:00 | 리그 참여 중 |

문구는 Ted 톤 ("오늘 복습 12개 남았어!"). 알림 권한 거부 시 조용히 비활성 + 프로필에서 재요청.

## 5. 오프라인 sync 규칙

- 캐시: 코스 단어 전체 + `user_words` 오늘 큐 + 직전 통계 스냅샷
- 오프라인 중 attempts/세션은 sqlite 큐에 적재 → 온라인 복귀 시 순서대로 업로드, 충돌은 last-write-wins (단일 기기 가정, ADR 기록)

## 6. 테스트

| 테스트 | 방법 |
|--------|------|
| 리그 정산 | SQL 함수 단위 — 승급/강등 경계(10위·25위), 동점 처리 |
| 알림 스케줄 | jest mock — 조건별 스케줄/취소 |
| sync 큐 | 오프라인 적재 → 복귀 업로드 순서·중복 방지 |
| Manual E2E | 실기기 — 비행기 모드 학습 → 복귀 sync, 알림 수신 |
| 스토어 | EAS preview 빌드 → TestFlight 설치 → 풀 플로우 |

## 7. 완료 체크리스트

> 구현 완료(2026-06-13, ted-run). migration 번호는 006(P5 회화) 점유로 **007**로 이월. 상세 ADR-0007.

- [x] migration **007** + pg_cron 정산 등록 (`finalize_league` SECURITY DEFINER, 매주 UTC 월요일)
- [x] 리그 화면 + XP 적립 (직접 upsert 아닌 `increment_league_xp` RPC — 치팅 차단, 보드는 `get_league_board` PII 비노출)
- [x] 로컬 알림 3종 + 권한 플로우 (`planNotifications` 순수 + `createExpoScheduler` SDK56)
- [x] push_tokens 수집 (own-row RLS, 발송은 v1.1)
- [x] sqlite 오프라인 캐시 + sync 큐 (`db.web.ts` 플랫폼 스텁으로 web 빌드 안전, `recordAttemptRaw` flush)
- [x] 개인정보처리방침/스토어 문구 (`docs/store/`) — 아이콘/스플래시/스크린샷 **실자산은 제출 시 제작**
- [x] eas.json 프로필 작성 — **EAS preview 실빌드는 외부 계정·서명 필요(범위 밖)**
- [ ] TestFlight/내부 트랙 제출 1회 — **외부 계정·자산 의존(범위 밖, HANDOFF pending)**
- [x] typecheck + 전체 테스트 PASS (shared vitest 213·mobile jest 200·lint 0/0·web export·E2E 14)

### 구현 범위 조정 (사용자 합의)
- 코드로 완결 가능한 부분(리그·알림·오프라인·push 수집·설정/문서)만 구현.
- 스토어 **실제 제출·EAS 실빌드**는 Apple/Google 계정·서명·실 디자인 자산 의존이라 제외 — `eas.json`·`app.json` 메타·정책/문구 문서까지 작성.
- tier=그룹 단순화, group_no 분할은 v1.1.
