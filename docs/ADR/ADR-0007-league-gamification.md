# ADR-0007: Gamification — 리그 쓰기는 RPC 전용·보드 PII 비노출, 로컬 알림, 오프라인 큐(플랫폼 분기)

- 상태: 승인됨
- 날짜: 2026-06-13
- 관련: [p6-gamification.md](../plans/p6-gamification.md), [ADR-0002](ADR-0002-dual-mode-repository.md), [ADR-0006](ADR-0006-speaking-ai-edge-function.md)

## 컨텍스트

P6는 v1.0 마지막 Phase로 주간 리그(경쟁·리텐션), 로컬 알림(복습/streak/리그마감), 오프라인 캐시+sync, 스토어 준비를 다룬다. 리그는 **타인 데이터(랭킹) 조회**와 **XP·tier 위조(게임화 치팅)**라는 새 공격 표면을 연다. 알림·sqlite는 Expo 네이티브 모듈이라 web 번들·테스트와 충돌한다. (스토어 실제 제출·EAS 실빌드는 외부 계정·자산 의존이라 본 chunk 범위 밖 — eas.json·메타·정책 문서까지만.)

## 결정

### 1. 리그 쓰기는 SECURITY DEFINER RPC 전용 — `league_entries` 직접 쓰기 RLS 회수 (보안 핵심)

001의 `league_insert_own`/`league_update_own` own-row 정책은 인증 사용자가 supabase-js로 `league_entries`를 직접 INSERT/UPDATE해 **xp·tier·rank를 임의 위조**하게 한다 → RPC의 cap·week_start 강제·tier 승계가 전부 우회된다(2b 적대적 리뷰 CRITICAL). 007에서 두 정책을 `DROP`하고 쓰기는 오직 `increment_league_xp`(적립)·`finalize_league`(정산) SECURITY DEFINER 함수로만 허용한다. 함수는 owner 권한으로 실행돼 RLS를 우회하므로 INSERT 정책 없이 동작한다(`FORCE ROW LEVEL SECURITY` 부재 의존 — **FORCE 추가 금지**를 마이그레이션 주석에 명시). `league_select_own`은 본인 행 조회(getLeagueSummary)에 필요해 유지. **P5와 동형 교훈: RPC만 잠가선 부족, 테이블 직접 쓰기 경로까지 막아야 cap이 강제된다.**

- `increment_league_xp(p_xp)`: 회당 `LEAST(GREATEST(p_xp,0),500)` cap + week_start 서버 강제(UTC 월요일) + 누적 `LEAST(..., 2e9)`로 INT32 오버플로우 방어 + `ON CONFLICT DO UPDATE`로 원자적 가산.

### 2. 보드는 `get_league_board` SECURITY DEFINER로 PII 비노출

리그 랭킹은 본질적으로 타인 데이터인데 RLS는 own-row뿐이다. `get_league_board(p_week_start)`가 호출자 `auth.uid()`의 tier 그룹만 `(rank, display_name, xp, tier, is_me)`로 반환 — **user_id·email은 절대 반환하지 않는다**. 호출자가 임의 주·다른 tier를 넘봐도 본인 그룹 외엔 빈 결과. 클라이언트는 user_id를 `'me'`/`'other-N'`으로만 본다.

### 3. tier = 그룹 (group_no 분할은 v1.1)

plan은 "tier 내 30명 그룹"이나 초기 유저가 적어(plan 비목표 "그룹 미달 허용") **tier 하나를 한 그룹으로 단순화**한다. 유저 30명 초과 시 `group_no` 분할 도입은 v1.1. 승급 상위 10·강등 하위 5, **그룹이 강등 정원(5) 이하면 강등 없음**(`groupSize > DEMOTE` 가드 — 없으면 `groupSize-5≤0`으로 선두까지 강등되는 경계 버그, 2a CRITICAL). shared `outcomeForRank`와 SQL `finalize_league`의 승강등 로직을 1:1로 일치시킨다(승급 우선, ROW_NUMBER 연속 rank, xp desc+user_id asc).

### 4. 정산은 pg_cron (매주 UTC 월요일 00:00)

`finalize_league`를 `cron.schedule('finalize-league-weekly','0 0 * * 1', ...)`로 직전 주 정산. `REVOKE ALL FROM PUBLIC/authenticated/anon`로 cron/service role 전용. 멱등(unschedule 후 schedule). 주 경계는 클라이언트 표시(`weekStartKey`)와 cron 모두 **UTC 월요일**로 통일(streak은 로컬이지만 리그는 UTC).

### 5. 로컬 알림 = 순수 결정 함수 + expo-notifications 어댑터

`planNotifications(state)`(순수)가 plan §4 조건표(복습: 어제학습&오늘큐>0, streak보호: 오늘미학습&streak≥3, 리그마감: 참여중 일요일 20시)를 PlannedNotification[]로 결정 — 100% 테스트. `createExpoScheduler`(SDK56 `SchedulableTriggerInputTypes.DAILY/WEEKLY`)는 어댑터로 분리해 `syncNotifications`가 권한→cancelAll→재스케줄. 권한 거부 시 조용히 비활성. 원격 푸시는 `push_tokens` 수집만(own-row RLS) — 발송은 v1.1.

### 6. 오프라인 = 순수 큐 + 플랫폼 분기 sqlite, recordAttempt 폴백/Raw 분리

`queue.ts`(dedupe/order/removeSynced)·`sync.ts`(`flushQueue` 첫 실패서 중단·`flushPendingQueue` DB연동 래퍼)는 순수/주입형으로 테스트. `db.ts`(expo-sqlite)는 **web에서 wa-sqlite worker/wasm가 번들을 깨므로 `db.web.ts` no-op 스텁으로 플랫폼 분기**(웹은 온라인·AsyncStorage 가정). `recordAttempt`는 실패 시 큐 적재(폴백), `recordAttemptRaw`는 폴백 없는 원본 — flush는 Raw를 써서 "성공으로 오인→재enqueue→무음 삭제" 충돌을 차단. 미지원 타입(`session`)·손상 payload는 throw해 큐 보존(2a HIGH). 단일 기기 last-write-wins.

### 7. Dev Mock 전 플로우 동작 (ADR-0002 승계)

Supabase 미설정 시 리그는 본인 1명 보드(local, AsyncStorage `tv_league`, 주 경계 리셋), 알림은 mock scheduler, 오프라인 큐는 local 모드라 미사용(flushPendingQueue 즉시 종료). AI/서버 없이 가입→온보딩→리그→알림설정 E2E 가능.

## 결과

- 장점: 치팅 차단(쓰기 RPC 전용+cap+오버플로우 방어), 보드 PII 비노출, 알림/큐 순수 로직 100% 테스트, web/native 플랫폼 분기로 빌드 안전, Dev Mock 전 플로우
- 단점: pg_cron은 Supabase Extensions 활성화 필요(플랜별 권한). tier=그룹 단순화로 유저 증가 시 group_no 분할 필요(v1.1). 웹은 오프라인 캐시 미지원. 알림/실 STT/실 sync는 실기기 검증 영역
- 검증: shared league cov 100%(vitest 213), mobile jest 200, lint 0/0, typecheck clean, web export 성공, **2a·2b 이중 리뷰 PASS — CRITICAL 3(치팅 RLS·gold 강등 경계·xpToPromote 마스킹)·HIGH 3(flush 무음삭제·INT 오버플로우·이중적립) 전건 수정 후 재리뷰 PASS**, E2E 14케이스(리그·알림 플로우) PASS
- 잔여: pg_cron 활성화·migration 001~007 실서버 적용, EAS 실빌드·TestFlight/내부트랙 제출(외부 계정·자산), 실기기 알림 수신·오프라인 sync·권한 플로우, 스토어 자산(아이콘/스크린샷)·정책 문서 실값 교체, 콘텐츠 human review(이월)
