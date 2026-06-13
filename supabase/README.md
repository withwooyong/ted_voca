# Supabase

전체 배포 절차(마이그레이션·pg_cron·Edge Function·EAS)는 **[`docs/DEPLOY.md`](../docs/DEPLOY.md)** 참조. 아래는 빠른 요약.

## 빠른 시작

1. [Supabase](https://supabase.com) 프로젝트 생성 → Settings → API에서 URL·anon key 확보
2. **SQL Editor**에서 `migrations/`를 번호 순으로 실행(정식 경로, CLI 파이프라인 없음):
   - `001_initial_schema.sql` — 스키마 + RLS
   - `002_words_seed.sql` — toeic-800 어휘 510단어
   - `003_p1_p2_contract_fixes.sql` — level_test_done + enum 보강
   - `004_grammar.sql` / `005_listening.sql` / `006_speaking.sql` — 콘텐츠 시드
   - `007_league_push.sql` — 리그 정산·push_tokens·pg_cron (pg_cron 선행 활성화 필요)
   - `008_league_groups.sql` — 리그 group_no 분할 (**007 이후**)
3. `apps/mobile/.env`(로컬) 또는 EAS env(빌드)에 설정:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   미설정 시 앱은 Dev Mock Auth로 폴백(dual-mode).

## 주의

- 모든 마이그레이션은 idempotent(재실행 안전). 단, 콘텐츠 시드(002·004·005·006)는 `ON CONFLICT DO NOTHING`이라 **이미 시드된 행은 재실행으로 갱신되지 않는다**(검수 수정 반영 시 별도 UPDATE 필요).
- `007`의 pg_cron은 Dashboard → Database → Extensions에서 선행 활성화 권장.
- Edge Function `speak-feedback` 배포·secret은 [`docs/DEPLOY.md`](../docs/DEPLOY.md) §D 참조.
