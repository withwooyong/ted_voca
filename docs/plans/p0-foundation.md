# p0-foundation.md — Ted Voca Foundation (P0)

> Expo 모바일 앱 골격, Supabase Auth, 온보딩, 홈 탭 shell 을 구축한다.
> P1 어휘 퀴즈·레벨 테스트는 본 chunk 범위 밖.

## 0. 메타

| 항목 | 값 |
|------|-----|
| Phase | **P0** — Foundation |
| 본 chunk | Expo 프로젝트 + 디자인 토큰 + Auth + 온보딩 + Tab shell |
| 트랙 | `apps/mobile` + `supabase/` |
| 의존 | Supabase 프로젝트 (로컬: `.env` placeholder) |
| ted-run 적용 | ✅ |
| plan doc lifecycle | 본 doc → /ted-run 명시 호출 |

## 1. 목적

### 1.1 현 상태 (problem)

- `ted_voca` 저장소가 비어 있음. 실행 가능한 앱·백엔드 스키마·콘텐츠 시드 없음.

### 1.2 목표 (DoD)

1. **Expo 앱 부트스트랩** — TypeScript, Expo Router, NativeWind
2. **인증 플로우** — 이메일 회원가입/로그인 (Supabase Auth); 미설정 시 dev mock auth
3. **온보딩** — 목표(exam/conversation/business), 일일 목표(5/10/20분), `profiles` 저장
4. **Tab shell** — Home / Learn / Review / Profile (Learn·Review는 placeholder)
5. **홈 대시보드** — streak, XP, 오늘 할 일 카드 (mock 데이터)
6. **Ted 마스코트** — SVG placeholder 컴포넌트
7. **공유 패키지** — `packages/shared` types + constants
8. **E2E 스모크** — TypeScript compile + Expo export web smoke

### 1.3 명시적 비목표 (out-of-scope)

- ❌ 레벨 테스트 20문항 (P1)
- ❌ 어휘 퀴즈 UI (P1)
- ❌ SM-2 SRS (P2)
- ❌ Apple/Google 소셜 로그인 (P0.5)
- ❌ EAS TestFlight 실제 배포 (운영 단계)

## 2. 영향 범위

| 경로 | 변경 |
|------|------|
| `apps/mobile/` | **신규** Expo 앱 전체 |
| `packages/shared/` | **신규** types, constants |
| `supabase/migrations/001_initial_schema.sql` | **신규** (P0: profiles RLS) |
| `apps/mobile/.env.example` | **신규** |

## 3. 화면·라우팅

```
app/
├── _layout.tsx          # Root: auth gate, theme
├── index.tsx            # Redirect → splash logic
├── (auth)/
│   ├── login.tsx
│   └── signup.tsx
├── (onboarding)/
│   └── index.tsx        # 3-step wizard
└── (tabs)/
    ├── _layout.tsx      # Tab bar
    ├── index.tsx        # Home
    ├── learn.tsx
    ├── review.tsx
    └── profile.tsx
```

**Auth gate**

- `session == null` → `(auth)/login`
- `session && !profile.onboarding_complete` → `(onboarding)`
- else → `(tabs)`

## 4. Supabase (P0 subset)

P0 에서 사용하는 테이블:

- `profiles` — `id`, `display_name`, `goal`, `daily_goal_minutes`, `onboarding_complete`, `xp`, `streak`, `level`

Trigger: `auth.users` insert → `profiles` row 자동 생성.

## 5. 디자인 토큰

| 토큰 | 값 | 용도 |
|------|-----|------|
| primary | `#4F46E5` | CTA, Ted 브랜드 |
| accent | `#F59E0B` | XP, streak |
| surface | `#F8FAFC` | 배경 |
| text | `#0F172A` | 본문 |

## 6. 테스트

| 테스트 | 방법 |
|--------|------|
| TypeScript | `cd apps/mobile && npx tsc --noEmit` |
| Lint | `npm run lint` (expo default) |
| Manual | Expo Go / iOS Simulator — signup → onboarding → home |

## 7. 완료 체크리스트

- [ ] `npx create-expo-app` 완료
- [ ] NativeWind 설정
- [ ] Supabase client + auth hooks
- [ ] Login / Signup screens
- [ ] Onboarding 3-step
- [ ] Tab navigation 4 screens
- [ ] Home dashboard mock cards
- [ ] TedMascot component
- [ ] `.env.example` documented
- [ ] `tsc --noEmit` PASS
