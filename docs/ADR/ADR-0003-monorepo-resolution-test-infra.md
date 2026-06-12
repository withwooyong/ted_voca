# ADR-0003 — 모노레포 모듈 해석(file: 의존성)과 테스트 인프라

- 상태: 채택 (2026-06-12, P1+P2)

## 모듈 해석

npm workspaces 없이 `@ted-voca/shared`를 **`file:../../packages/shared` 의존성(symlink)** 으로 설치하고,
`metro.config.js`에 `watchFolders: [저장소 루트]`를 추가했다.

근거: tsconfig paths만으로는 tsc/jest는 통과하지만 **Metro가 scoped 패키지를 해석하지 못해
런타임(번들)에서 깨진다** — Step 3-5 스모크(`expo export --platform web`)에서 실증.
extraNodeModules 매핑도 실패했고, file: symlink가 Expo 공식 모노레포 가이드와 호환되는 최소 해법.
정식 npm workspaces 전환은 패키지가 늘어나는 시점(P3+)에 재검토.

## 테스트 인프라

| 위치 | 러너 | 비고 |
|------|------|------|
| packages/shared | vitest + @vitest/coverage-v8 | thresholds 80% (현재 line 100%) |
| apps/mobile | jest-expo + @testing-library/react-native **v14** | RTL v14는 `render`/`fireEvent`가 **async** (React 19) — 모든 테스트 await 필수 |

jest 설정 요점 (apps/mobile/package.json):
- `moduleNameMapper`: `@ted-voca/shared` → 소스 직접, async-storage → **`/jest`** (v3에서 mock 경로 변경됨), `@babel/runtime/*` → mobile node_modules (루트 밖 shared 파일의 헬퍼 해석)
- 데이터 레이어 테스트는 `jest.mock('@/lib/supabase')`로 local 모드 강제

## ESLint

eslint 9 flat config + eslint-config-expo. `react-hooks/purity`가 컴포넌트 스코프의 `Date.now()`를
플래그하므로 이벤트 핸들러에서도 `new Date()`를 만들어 재사용하는 컨벤션을 따른다.
