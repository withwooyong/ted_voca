# ADR-0008: 리그 group_no 분할 — tier 내 30명 단위 그룹 (v1.1)

- 상태: 승인됨
- 날짜: 2026-06-13
- 관련: [ADR-0007](ADR-0007-league-gamification.md), [p6-gamification.md](../plans/p6-gamification.md)

## 컨텍스트

ADR-0007 §3은 초기 유저가 적다는 이유로 **tier 자체를 경쟁 그룹**으로 단순화하고, 유저 30명 초과 시의 `group_no` 분할을 v1.1로 미뤘다. 그 결과 한 tier 인원이 `LEAGUE_GROUP_SIZE(30)`를 넘으면 전원이 한 보드에서 경쟁하고 승급 상위 10·강등 하위 5 규칙이 tier 전체에 적용된다(보드 50행 cap, 경쟁 체감 저하). v1.1은 각 tier를 30명 단위 그룹으로 쪼개 랭킹·승강등·보드를 `(tier, group_no)` 단위로 동작시킨다.

## 결정

### 1. 경쟁 단위 = `(tier, group_no)`, shared ↔ SQL 1:1 유지

`league_entries`에 `group_no INT NOT NULL DEFAULT 0` 추가(기존 행은 0 = 단일 그룹, v1.0 호환). 랭킹·승강등 판정의 `ROW_NUMBER()`·`COUNT(*)` PARTITION을 `(tier)` → `(tier, group_no)`로 변경. `outcomeForRank`(승급 rank≤10, 강등 rank>cnt−5, **cnt≤5 강등 없음**)·`nextTier`는 ADR-0007 그대로이되 rank·cnt가 **그룹 기준**이 된다 — shared 순수 함수는 이미 "한 그룹의 엔트리"를 받으므로 시그니처 변경이 없다(007의 1:1 원칙 계승).

### 2. 그룹 배정 기준 = `user_id ASC` 정렬 후 30명씩 chunk

주간 정산(`finalize_league`)이 다음 주 행을 시드할 때, 각 *새 tier*별로 유저를 `user_id ASC`로 정렬해 `group_no = floor(index/30)`을 부여한다. shared `assignGroupNos`와 SQL `floor((ROW_NUMBER() OVER (PARTITION BY new_tier ORDER BY user_id ASC) − 1)/30)`이 1:1.

- **왜 user_id 정렬인가**: 결정적(SQL 재실행/replay 안전 — `now()`/random 불가 원칙과 동일 정신)이며, 실력과 무관해 강자가 한 그룹에 쏠리지 않고 자연 분산된다. xp 기반 실력 균형(snake-draft)은 초기 규모상 과설계라 **v1.2 후순위**.
- **승강등 시 재편**: 다음 주 group_no는 *새 tier* 기준으로 전원 재chunk되므로, 승급·강등으로 tier가 바뀐 유저도 새 tier의 그룹에 자연스럽게 합류한다.

### 3. 신규/첫 주 엔트리는 `increment_league_xp` INSERT 경로에서 배정

`finalize`가 시드하지 않은 행(서비스 최초 주, 또는 주중 신규 가입)은 적립 시점에 group_no를 정한다. shared `pickGroupNoForNewEntry`와 SQL 1:1: `(week, tier)` 그룹별 인원에서 **여유(<30) 있는 최소 group_no → 없으면 max+1 → 그룹 자체가 없으면 0**. `ON CONFLICT`(같은 주 누적) 경로는 group_no 미변경 — 이미 배정된 그룹 유지.

### 4. 보드 격리

`get_league_board`가 호출자 행의 `group_no`도 조회해 `WHERE tier = v_tier AND group_no = v_group`로 본인 그룹만 반환. PII 비노출(ADR-0007 §2) 그대로.

## 결과

- shared: `assignGroupNos`·`pickGroupNoForNewEntry` 추가(+테스트 15, vitest 213→228). `LeagueEntryLike.group_no?` 옵셔널.
- migration 008: `group_no` 컬럼 + `increment_league_xp`/`get_league_board`/`finalize_league` 교체(007 idempotent 패턴). pg_cron은 함수만 `CREATE OR REPLACE`되어 재등록 불필요.
- 데이터 레이어: `LeagueSummary.groupNo` 노출(remote me-row select에 group_no, local Dev Mock=0). UI는 `groupNo>0`일 때만 "그룹 N" 라벨(단일 그룹 환경은 깔끔하게 미표시).

## 트레이드오프 / 알려진 한계

- **동시 INSERT 시 그룹 초과 가능**: 두 신규 유저가 동시에 같은 group_no를 골라 30명을 살짝 넘길 수 있다. 보드·랭킹은 여전히 그룹 스코프로 정상 동작하므로 경미한 불균형이며("그룹 미달/초과 허용" 단순화), v1.2에서 배정 잠금/균형 재조정으로 개선 여지.
- **SQL은 로컬 테스트 파이프라인 없음**(수동 SQL Editor) — shared 1:1 대응 + 리뷰 라인 대조로 정합성 보장(007 전략 계승).
- **적용 순서**: 008은 007 적용 후 실행(`league_entries`·함수 존재 전제). HANDOFF 마이그레이션 목록 001~008.
