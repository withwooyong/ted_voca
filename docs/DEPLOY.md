# 배포 가이드 (Deploy Runbook)

> Ted Voca 실서버 배포 절차. 로컬 Dev Mock 루프는 외부 인프라 없이 동작하므로, 본 문서는 **실서버(Supabase) + 스토어 빌드(EAS)** 단계만 다룬다.
> 코드는 v1.0 전 Phase + v1.1 리그 그룹 분할까지 완결 상태. 남은 것은 아래 5개 외부 단계다.

## 전체 흐름

```
A. Supabase 프로젝트 생성          (1회)
B. 마이그레이션 001~008 적용        (SQL Editor, 번호 순)
C. pg_cron 활성화 + 주간 정산 확인   (007 의존)
D. Edge Function 배포 + secret      (speak-feedback / OPENAI_API_KEY, push-send / PUSH_ADMIN_SECRET)
E. 앱 env 설정 → EAS 빌드 → 스토어 제출
```

각 단계는 앞 단계 완료를 전제로 한다. B(007) → C, B 전체 → D, A+B+D → E.

---

## A. Supabase 프로젝트 생성

1. [supabase.com](https://supabase.com) → New project (region: 사용자 다수 지역, 예: Northeast Asia (Seoul)).
2. 프로젝트 생성 후 **Settings → API** 에서 다음을 확보:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon public` key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → Edge Function용(앱에 절대 넣지 말 것). Supabase 플랫폼이 Edge Function에 자동 주입하므로 별도 설정 불필요(아래 D 참고).
3. **Auth → Providers** 에서 이메일 로그인 활성(기본). Google/Apple 소셜은 선택(MASTER-PLAN 로드맵, 현재 코드는 이메일 기반).

---

## B. 마이그레이션 적용 (001 → 008, 번호 순)

> **정식 경로 = Supabase SQL Editor 수동 실행.** 본 레포 마이그레이션은 `00N_name.sql` 번호 체계로, Supabase CLI(`supabase db push`)가 기대하는 타임스탬프 파일명 규칙과 다르다. CLI 마이그레이션 파이프라인은 사용하지 않는다(CLAUDE.md).
> 모든 파일은 **idempotent**(IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT)하게 작성되어 재실행이 안전하다.

**Dashboard → SQL Editor** 에서 아래 순서로 각 파일 내용을 붙여넣어 실행한다:

| 순서 | 파일 | 내용 | 주의 |
|------|------|------|------|
| 1 | `001_initial_schema.sql` | 전체 스키마(profiles·courses·words·user_words·study_sessions·quiz_attempts·league_entries) + enum + RLS | 최초 1회 |
| 2 | `002_words_seed.sql` | toeic-800 어휘 510단어 INSERT | `ON CONFLICT (course_id, lemma) DO NOTHING` — 재적용 시 기존 행 미갱신(아래 ⚠️) |
| 3 | `003_p1_p2_contract_fixes.sql` | `profiles.level_test_done`, study_module enum에 review/level_test 추가 | `ALTER TYPE ADD VALUE`는 트랜잭션 분리 실행 권장 |
| 4 | `004_grammar.sql` | 문법 콘텐츠(200문항) | — |
| 5 | `005_listening.sql` | 리스닝 콘텐츠(50클립) | — |
| 6 | `006_speaking.sql` | 회화 시나리오(68턴) + usage RLS | — |
| 7 | `007_league_push.sql` | 리그 정산 함수·push_tokens·league_entries 쓰기잠금 + **pg_cron 스케줄** | pg_cron 선행 필요(아래 C) |
| 8 | `008_league_groups.sql` | 리그 `group_no` 30명 분할 | **007 적용 후** 실행 |

### ⚠️ 콘텐츠 재시드 주의 (002·004·005·006)
콘텐츠 SQL은 모두 `ON CONFLICT ... DO NOTHING`이라, **이미 시드된 행의 내용 변경(예: 검수 수정)은 재실행으로 갱신되지 않는다.** 초기 시드 전이면 무관. 이미 시드한 뒤 콘텐츠를 고쳤다면 해당 행만 `UPDATE` 하거나 `DELETE` 후 재INSERT 해야 한다.

### 적용 검증
```sql
SELECT count(*) FROM words;                          -- 510
SELECT count(*) FROM courses;                         -- toeic-800 등
SELECT count(*) FROM league_entries;                  -- 0 (신규)
SELECT column_name FROM information_schema.columns
  WHERE table_name='league_entries' AND column_name='group_no';  -- 1행 (008 적용 확인)
```

---

## C. pg_cron 활성화 + 주간 정산

`007_league_push.sql` 말미는 `CREATE EXTENSION IF NOT EXISTS pg_cron;` 후 매주 **UTC 월요일 00:00** 에 직전 주 리그를 정산하는 cron(`finalize-league-weekly`)을 등록한다.

1. **사전 활성화**: Dashboard → **Database → Extensions** 에서 `pg_cron` 토글 ON. (플랜·권한에 따라 SQL Editor의 `CREATE EXTENSION pg_cron`이 실패할 수 있어, Extensions UI 선행 활성화를 권장.)
2. 007 실행 시 cron job이 등록된다. 확인:
   ```sql
   SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'finalize-league-weekly';
   ```
3. **수동 정산 테스트**(선택, 검증용):
   ```sql
   SELECT finalize_league((date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7));
   ```

> cron은 UTC 기준이다(KST 월요일 09:00에 해당). 정산 로직은 `packages/shared/src/league.ts` 순수 함수와 1:1 일치하도록 관리된다 — SQL만 바꾸지 말 것.

---

## D. Edge Function 배포 (speak-feedback)

회화 LLM 피드백용. 미배포 시 앱은 규칙 기반 폴백 피드백으로 동작(P5 dual-path).

1. Supabase CLI 설치 후 로그인·링크:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <PROJECT_REF>   # Settings → General → Reference ID
   ```
2. OpenAI 키를 secret으로 등록(앱·로그·응답에 절대 노출 금지):
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-...
   ```
   > `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`는 Edge Function 런타임에 **플랫폼이 자동 주입**하므로 별도 설정 불필요. `OPENAI_API_KEY`만 수동 등록한다.
3. 배포:
   ```bash
   supabase functions deploy speak-feedback
   ```
   `supabase/config.toml`의 `[functions.speak-feedback] verify_jwt = true` 가 플랫폼 레벨 JWT 검증을 강제한다(핸들러의 `getUser`와 이중 방어).
4. 검증: 앱 로그인 상태에서 회화 시나리오 1턴 진행 → LLM 피드백 응답 확인(키 미설정/오류 시 폴백 메시지면 키·배포 점검).

### D-2. push-send (v1.1 원격 푸시 캠페인 발송)

수집된 `push_tokens`(007)에 캠페인 푸시를 발송하고 무효 토큰을 자동 정리하는 **관리자 전용** 함수.
미배포여도 앱 동작에는 영향 없다(토큰 수집은 계속됨). 관련 결정: [ADR-0009](ADR/ADR-0009-remote-push-send.md).

1. 관리자 시크릿을 secret으로 등록(절대 앱·로그·클라이언트에 노출 금지, 충분히 긴 난수):
   ```bash
   supabase secrets set PUSH_ADMIN_SECRET="$(openssl rand -hex 32)"
   ```
   > `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`는 런타임에 플랫폼이 자동 주입(토큰 조회·삭제용). `PUSH_ADMIN_SECRET`만 수동 등록.
2. 배포:
   ```bash
   supabase functions deploy push-send
   ```
   `supabase/config.toml`의 `[functions.push-send] verify_jwt = false` 가 적용된다 — 인증은 user JWT가 아니라 `X-Admin-Secret` 헤더(핸들러 `isAdmin` 상수시간 비교)가 단독 담당. env 미설정 시 전면 거부(fail-closed).
3. 호출(운영자가 직접, HTTPS 필수). `tier`는 선택(`bronze`/`silver`/`gold` — 생략 시 전체 발송):
   ```bash
   curl -X POST "https://<PROJECT_REF>.functions.supabase.co/push-send" \
     -H "X-Admin-Secret: $PUSH_ADMIN_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"title":"Ted","body":"오늘 복습 잊지 마세요! 🔥","tier":"silver"}'
   # 응답 예: {"sent":120,"failed":3,"invalidated":2}
   ```
   - `sent`=Expo 접수 성공, `failed`=발송 에러(레이트리밋 등 포함), `invalidated`=DeviceNotRegistered로 삭제한 토큰 수.
   - title ≤100자 / body ≤500자 초과 시 400. 응답에 토큰 값은 절대 포함되지 않는다.
4. **시크릿 로테이션**: 유출 의심 시 1번을 새 난수로 재실행 → 즉시 기존 시크릿 무효화(헤더 갱신 후 재호출).
5. 알려진 한계(ADR-0009): `DeviceNotRegistered`는 주로 receipt 단계에서 확정되므로 일부 무효 토큰이 남을 수 있다(receipt 2차 폴링 미구현). 대량 발송 레이트리밋 재시도/백오프 없음(실패 카운트만).

---

## E. 앱 env → EAS 빌드 → 스토어 제출

### E-1. 환경변수
앱 코드는 `apps/mobile/lib/supabase.ts`에서 두 값만 읽는다:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

- **로컬 개발**: `apps/mobile/.env`에 작성(미설정 시 Dev Mock Auth로 폴백 — dual-mode).
- **EAS 빌드**: ⚠️ `EXPO_PUBLIC_*`는 **빌드 시점 환경에서 인라인**된다. `.env`는 EAS 클라우드 빌드에 자동 포함되지 않으므로, 둘 중 하나로 주입해야 실서버에 붙는다:
  ```bash
  eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://xxx.supabase.co
  eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ...
  ```
  또는 `eas.json`의 각 프로파일에 `"env": { ... }` 블록 추가. (현재 eas.json에는 env 블록이 없다 — 빌드 전 반드시 채울 것.)

### E-2. EAS 빌드
```bash
cd apps/mobile
npm i -g eas-cli
eas login
eas build:configure        # 최초 1회 (projectId 생성)

# 내부 배포용 (TestFlight/내부트랙 전 단계 점검)
eas build --profile preview --platform android   # apk
eas build --profile preview --platform ios       # internal distribution

# 스토어 제출용
eas build --profile production --platform all     # autoIncrement: true
```

프로파일은 `apps/mobile/eas.json` 참조(development/preview/production). app.json: `version 1.0.0`, iOS `com.ted.voca`, Android `com.ted.voca`, 신아키텍처 ON.

### E-3. 스토어 제출
`eas.json`의 `submit.production` 플레이스홀더를 실제 값으로 교체:

| 항목 | 위치 | 값 |
|------|------|-----|
| `appleId` | iOS | Apple 계정 이메일 |
| `ascAppId` | iOS | App Store Connect 앱 ID |
| `appleTeamId` | iOS | Apple Developer Team ID |
| `serviceAccountKeyPath` | Android | `./google-service-account.json`(Play Console 서비스 계정) |

```bash
eas submit --profile production --platform ios       # → TestFlight
eas submit --profile production --platform android    # → internal track
```

### E-4. 스토어 자산·메타데이터
- 메타데이터 초안: [`docs/store/store-listing.md`](store/store-listing.md) (대괄호 플레이스홀더 확정 필요)
- 개인정보 처리방침: [`docs/store/privacy-policy.md`](store/privacy-policy.md) (호스팅 URL 필요)
- 실자산 미준비: 아이콘·스크린샷(`apps/mobile/assets/images/`는 기본 placeholder), 마이크/음성인식 권한 설명은 app.json `infoPlist`에 기재됨.

---

## 배포 후 검증 체크리스트

- [ ] 신규 가입 → 온보딩 → 레벨 테스트 1회(`level_test_done` true 기록) 정상
- [ ] 어휘 퀴즈 정답/distractor 정상(510단어 시드 확인)
- [ ] 문법·리스닝·회화 콘텐츠 로드(004·005·006)
- [ ] 회화 1턴 → Edge Function LLM 피드백 응답(폴백 아님)
- [ ] 리그 XP 적립(`increment_league_xp`) + 보드 조회(`get_league_board`)
- [ ] **유저 30명+ 환경**에서 group_no 분할·보드 격리·주간 정산 재편 확인(v1.1 잔여 검증 항목)
- [ ] cron `finalize-league-weekly` 등록 확인 + 수동 정산 1회 테스트
- [ ] 실기기: iOS 무음 스위치(P4 audio), 마이크·실 STT(P5), 로컬 알림 3종·오프라인 sync(P6)

---

## 알려진 제약 (배포 관련)

- **마이그레이션은 수동 SQL Editor 적용** — CLI 파이프라인 없음. shared 순수 함수 ↔ SQL 1:1 대조로 정합성 보장.
- **콘텐츠 ON CONFLICT DO NOTHING** — 이미 시드한 행은 재실행으로 갱신 안 됨(위 B ⚠️).
- **pg_cron 플랜 의존** — Extensions UI 선행 활성화 권장.
- **리그 그룹 동시 INSERT 초과** — 신규 유저 동시 배정 시 30명 살짝 초과 가능(경미, v1.2 배정 잠금 여지 — ADR-0008).
- **웹은 오프라인 캐시 미지원**(db.web.ts no-op, 의도된 네이티브 전용).
- **EAS env 미설정 시 Dev Mock으로 빌드됨** — E-1 주입 필수.
