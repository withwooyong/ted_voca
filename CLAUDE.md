# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ted Voca — React Native(Expo) 영어 학습 앱 (어휘·문법·리스닝·회화, 말해보카 벤치마크). 마스터 계획서는 `docs/MASTER-PLAN.md`, Phase별 작업계획서는 `docs/plans/` (현재 P0 Foundation 완료 단계, P1 Vocab Core가 다음). 문서는 한국어로 작성한다.

## Commands

모바일 앱 작업은 모두 `apps/mobile/`에서 실행:

```bash
cd apps/mobile
npm install
npm start            # expo start (ios/android/web 변형 스크립트 있음)
npm run typecheck    # tsc --noEmit — 현재 유일한 검증 수단 (테스트/린트 미설정)
```

콘텐츠 시드 재생성:

```bash
python3 scripts/generate_toeic_seed.py   # scripts/word_batches/*.txt → content/toeic-800-pack.json
```

DB 스키마는 `supabase/migrations/001_initial_schema.sql`을 Supabase SQL Editor에서 수동 실행 (CLI 마이그레이션 파이프라인 없음).

## Critical: Expo SDK version

**Expo SDK 56** 사용 (React 19, RN 0.85). API가 과거 버전과 다르므로 Expo 관련 코드 작성 전 반드시 https://docs.expo.dev/versions/v56.0.0/ 의 버전별 문서를 확인할 것 (`apps/mobile/AGENTS.md` 참조).

## Architecture

루트는 npm workspace가 **아니다**. `apps/mobile`이 독립 npm 프로젝트이고, `packages/shared`(공유 타입)는 `apps/mobile/tsconfig.json`의 path alias `@ted-voca/shared` → `../../packages/shared/src/types`로 직접 참조된다. shared에 코드를 추가하면 별도 빌드 없이 mobile에서 바로 import된다.

### Dual-mode auth (가장 중요한 패턴)

앱 전체가 Supabase 설정 여부에 따라 두 모드로 동작한다:

- `lib/supabase.ts`의 `getSupabase()`는 `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` 미설정 시 **null**을 반환
- `lib/auth-store.ts`(Zustand)의 모든 액션(signIn/signUp/completeOnboarding 등)은 null이면 AsyncStorage 기반 **Dev Mock Auth**로 폴백
- 새로운 데이터 접근 코드를 추가할 때도 이 두 경로(Supabase / mock·로컬)를 모두 처리해야 로컬 개발이 깨지지 않는다

세션 저장소는 네이티브에서 SecureStore, 웹에서 AsyncStorage (`ExpoSecureStoreAdapter`).

### Routing (Expo Router, file-based)

`app/index.tsx`가 라우팅 게이트: 미로그인 → `(auth)/login`, 온보딩 미완료 → `(onboarding)`, 완료 → `(tabs)`. Route group은 `(auth)` 로그인/가입, `(onboarding)` 목표 설정, `(tabs)` Home/Learn/Review/Profile (Learn·Review는 P1까지 placeholder). 인증 상태는 `useAuthStore` 셀렉터로 구독한다.

### Theme

색상·디자인 토큰은 `constants/theme.ts` (`colors.primary`, `colors.surface` 등). 화면 코드는 NativeWind가 아닌 StyleSheet + 토큰 조합을 사용 중.

### Content pipeline

`scripts/word_batches/batch_NN.txt`는 `lemma|pos|meaning_ko|example_en` 파이프 구분 형식. 파이썬 스크립트가 difficulty(100단어당 +1, 최대 5)·tags·sort_order를 부여해 `content/toeic-800-pack.json`(course + words)으로 출력한다. 단어 추가/수정은 batch 파일을 고치고 스크립트를 재실행한다. JSON → `words` 테이블 import는 P1 범위.

### Database

`supabase/migrations/001_initial_schema.sql`에 전체 스키마(profiles, courses, words, user_words SRS state, study_sessions, quiz_attempts, league_entries 등)와 RLS 정책이 정의되어 있다. `packages/shared/src/types.ts`의 타입(예: `UserProfile`)은 DB 컬럼명(snake_case)과 일치시킨다.

## Workflow

작업계획서 기반 개발 시 `/ted-run` 스킬(TDD → 구현 → 리뷰 → 검증 파이프라인)을 사용한다 — `docs/plans/`의 plan doc이 입력이다.
