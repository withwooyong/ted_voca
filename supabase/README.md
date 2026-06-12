# Supabase

1. [Supabase](https://supabase.com) 프로젝트 생성
2. `migrations/001_initial_schema.sql` 실행
3. `apps/mobile/.env`에 URL·anon key 설정:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Word seed import (P1)

`content/toeic-800-pack.json`을 `words` 테이블에 넣는 SQL/Edge Function은 P1에서 추가합니다.
