# ADR-0002 — 데이터 레이어 dual-mode repository + DB 계약 (migration 003)

- 상태: 채택 (2026-06-12, P1+P2)
- 관련: [ADR-0001](ADR-0001-srs-shared-pure-logic.md)

## 결정

화면 코드는 `@/lib/data` 단일 모듈만 import한다. 내부에서 `getSupabase()` null 여부로
`remote.ts`(Supabase, RLS own-row) / `local.ts`(AsyncStorage, 단일 로컬 사용자)로 분기한다
— P0 auth-store의 Dev Mock 패턴을 데이터 전체로 확장.

- local 저장 키: `tv_user_words` / `tv_attempts`(최근 1000) / `tv_sessions`(최근 200) / `tv_progress`
- local 단어 소스: 번들 JSON (`content/toeic-800-pack.json`, id = `toeic-800:{lemma}`)
- 두 모드의 계약 일치는 `__tests__/data-local.test.ts`가 local을 고정하고, remote는 같은 shared 함수를 사용해 보장

## DB 계약 변경 (코드리뷰 2a 반영)

`migrations/003_p1_p2_contract_fixes.sql`:
1. `profiles.level_test_done BOOLEAN DEFAULT FALSE` — 레벨 테스트 XP(+20) 중복 지급 방지와 홈 배너 판단을 휴리스틱(last_study_date/user_level) 대신 명시 플래그로
2. `study_module` enum에 `'review'`, `'level_test'` 추가 — 세션 모듈 강제 매핑('vocab')으로 인한 통계 왜곡 제거

## 기록해 둔 수용 사항

- XP/streak 갱신은 클라이언트 read-modify-write (1인 사용 v1.0 수용, 동시성 필요 시 RPC 전환)
- remote 통계의 quiz_attempts 조회는 최신 500건 (7일 500건 초과는 비현실적이라 수용)
- 001의 `user_words.status` DEFAULT 'learning' vs 코드 initial 'new' — 코드가 항상 status를 명시 upsert하므로 무해, P3 마이그레이션 때 'new'로 통일 예정
- 오프라인 캐시(expo-sqlite)는 P6 — repository 인터페이스는 캐시 삽입 가능한 형태 유지
