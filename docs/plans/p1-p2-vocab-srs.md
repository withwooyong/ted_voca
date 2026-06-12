# p1-p2-vocab-srs.md — Vocab Core + SRS + Stats (P1+P2 통합)

> 레벨 테스트, 어휘 퀴즈 3종, 단어팩 import, SM-2 복습, streak/XP/통계를 구축한다.
> 퀴즈 결과(`quiz_attempts`)가 곧 SRS 입력이므로 P1·P2를 한 chunk로 통합 실행한다.

## 0. 메타

| 항목 | 값 |
|------|-----|
| Phase | **P1+P2** — Vocab Core + SRS + Stats |
| 본 chunk | 레벨 테스트 + 어휘 퀴즈 + 단어 import + SM-2 + 복습 큐 + 통계 |
| 트랙 | `apps/mobile` + `packages/shared` + `supabase/` |
| 의존 | P0 완료 (Auth, 온보딩, Tab shell), `content/toeic-800-pack.json` (510 단어) |
| UI 레퍼런스 | [프로토타입](../prototype/index.html) `#leveltest` `#vocab` `#review` `#stats` |
| ted-run 적용 | ✅ |
| plan doc lifecycle | 본 doc → /ted-run 명시 호출 |

## 1. 목적

### 1.1 현 상태 (problem)

- Learn/Review 탭이 placeholder. 학습 기능이 하나도 없어 앱의 핵심 가치(어휘→복습 루프)가 비어 있음.
- `words` 테이블이 비어 있음 (시드 JSON만 존재). 레벨 테스트·SRS·통계 미구현.
- 테스트 인프라 부재 — TDD 파이프라인(ted-run)을 위한 러너 설정 필요.

### 1.2 목표 (DoD)

1. **테스트 인프라** — `packages/shared`: vitest(순수 로직), `apps/mobile`: jest-expo + RTL (SDK 56 문서로 설정 검증)
2. **단어팩 import** — `toeic-800-pack.json` → `words` 테이블 시드 SQL 생성 스크립트 (`scripts/generate_words_seed_sql.py`)
3. **데이터 레이어** — `lib/data/` repository 패턴: Supabase ↔ 로컬 mock(AsyncStorage) 분기를 한 곳으로 통일 (auth-store 패턴 준용)
4. **레벨 테스트** — 20문항, 정답률 기반 3단계 난이도 조절, 문항당 즉시 피드백(프로토타입 UX), 결과로 `profiles.user_level`(CEFR) + `weak_tags` 저장. "나중에 하기" 시 A2 기본 배정
5. **어휘 퀴즈 3종** — 빈칸(blank)·4지선다 뜻(multiple_choice)·철자 입력(spelling). 보기(distractor)는 같은 코스·같은 품사에서 3개 추출. 세션 10문항, 최근 10문항 정답률로 easy/normal/hard 조절
6. **퀴즈 기록** — 세션 시작/종료 → `study_sessions`, 문항별 → `quiz_attempts`. 오답·신규 단어는 `user_words` upsert
7. **SM-2 SRS** — `packages/shared/src/srs.ts` 순수 함수 (ease_factor/interval_days/repetitions, Anki 호환). 4단계 평가: again/hard/good/easy. 버튼에 다음 복습일 노출(프로토타입 결정 — 투명성 차별점)
8. **복습 큐** — `next_review_at <= now()` 카드 플래시카드 UI(플립 → 평가). Review 탭 실구현
9. **streak/XP** — XP 정책표 기반 적립(아래 §6), `profiles.last_study_date`로 streak 계산(하루 1세션). 홈 대시보드 실데이터 연결
10. **통계 화면** — 7일 정답률, 학습 단어/마스터 수, 주간 학습 시간 차트, 자주 틀리는 단어 Top 5, 다가오는 복습 큐 수

### 1.3 명시적 비목표 (out-of-scope)

- ❌ 문법/리스닝/회화 (P3~P5)
- ❌ 리그·푸시 알림 (P6)
- ❌ expo-sqlite 오프라인 캐시 (P2.5 — repository 인터페이스만 캐시 가능한 형태로 설계)
- ❌ Memory Booster 자동 재생 (P4에서 TTS와 함께)
- ❌ 추가 코스(수능·일상·비즈) 콘텐츠 — 구조만 멀티 코스 지원

## 2. 영향 범위

| 경로 | 변경 |
|------|------|
| `packages/shared/src/srs.ts` | **신규** SM-2 순수 함수 + 단위 테스트 |
| `packages/shared/src/quiz.ts` | **신규** 문항 생성(distractor)·난이도 조절 로직 + 테스트 |
| `apps/mobile/lib/data/` | **신규** words/userWords/sessions/stats repository (dual-mode) |
| `apps/mobile/app/(tabs)/learn.tsx` | placeholder → 학습 허브 |
| `apps/mobile/app/(tabs)/review.tsx` | placeholder → SRS 복습 |
| `apps/mobile/app/(tabs)/index.tsx` | mock → 실데이터 (오늘 할 일, streak, XP) |
| `apps/mobile/app/quiz/`, `app/level-test/`, `app/stats/` | **신규** 스택 화면 |
| `supabase/migrations/002_words_seed.sql` | **신규** 단어 510개 시드 |
| `scripts/generate_words_seed_sql.py` | **신규** JSON → SQL 변환 |

## 3. 화면·라우팅

```
app/
├── (tabs)/learn.tsx        # 코스 진행률 + 모듈 목록 (#learn)
├── (tabs)/review.tsx       # 복습 큐 → 플래시카드 (#review)
├── level-test/index.tsx    # 인트로 → 20문항 → 결과 (#leveltest)
├── quiz/vocab.tsx          # 퀴즈 3종 + 피드백 시트 + 단어 카드 bottom sheet (#vocab)
├── quiz/complete.tsx       # 세션 완료: XP·정답률·streak (#vocab-done)
└── stats/index.tsx         # 통계 (#stats, 프로필에서 진입)
```

## 4. Supabase

사용 테이블(스키마 기존): `words`, `user_words`, `study_sessions`, `quiz_attempts`, `profiles(user_level, weak_tags, xp, streak, last_study_date)`.

- **신규 마이그레이션 002**: words 시드 INSERT (course `toeic-800` FK 연결)
- XP·streak 갱신은 클라이언트 계산 후 `profiles` UPDATE (RLS own-row). 동시성 이슈는 1인 사용자 특성상 v1.0 허용 — RPC 전환은 ADR로 기록만

## 5. SM-2 명세 (packages/shared/src/srs.ts)

```
grade: again(0) | hard(3) | good(4) | easy(5)
- again: repetitions=0, interval=0 (10분 내 재출제), ease -0.2 (min 1.3)
- hard:  interval = max(1, interval*1.2), ease -0.15
- good:  rep 1→1일, rep 2→3일(프로토타입 표기 기준), 이후 interval*ease
- easy:  good 계산 *1.3 (rep 1이면 7일), ease +0.15
status: new → learning(rep<2) → review → mastered(rep≥4 && ease≥2.5 && correct_streak≥4)
```

순수 함수 `applyGrade(state, grade, now): SrsState` — 단위 테스트로 경계값(ease 하한, again 루프, mastered 승급) 전수 검증.

## 6. XP 정책

| 행동 | XP |
|------|-----|
| 어휘 퀴즈 정답 | +3 / 문항 |
| 복습 평가 (again 제외) | +5 / 카드 |
| 세션 완료 보너스 | +10 |
| 레벨 테스트 완료 | +20 (1회) |

레벨: `level = floor(sqrt(xp/100)) + 1` (Lv.1~100 단조 증가).

## 7. 테스트

| 테스트 | 방법 |
|--------|------|
| SM-2 단위 | `packages/shared`: vitest — 등급별 interval/ease 표 기반 케이스 |
| 문항 생성 단위 | distractor 중복·정답 포함 여부, 난이도 버킷 |
| 컴포넌트 | jest-expo + RTL: 퀴즈 정답/오답 피드백, 플래시카드 플립 |
| TypeScript | `npm run typecheck` |
| Manual E2E | 시뮬레이터: 레벨테스트 → 퀴즈 10문항 → 복습 → 홈 수치 갱신 확인 |

## 8. 완료 체크리스트

- [ ] vitest(shared) + jest-expo(mobile) 설정, 샘플 테스트 GREEN
- [ ] `srs.ts` SM-2 + 테스트 (경계값 포함)
- [ ] `quiz.ts` 문항 생성·난이도 조절 + 테스트
- [ ] words 시드 SQL 생성·적용 (510 rows)
- [ ] repository dual-mode (Supabase/mock) 동작
- [ ] 레벨 테스트 20문항 → user_level/weak_tags 저장
- [ ] 어휘 퀴즈 3종 + 피드백 시트 + 단어 카드
- [ ] study_sessions/quiz_attempts/user_words 기록
- [ ] Review 탭 플래시카드 + 4단계 평가 + 다음 복습일 노출
- [ ] 홈 대시보드 실데이터 (오늘 할 일·streak·XP)
- [ ] 통계 화면 5개 위젯
- [ ] `tsc --noEmit` + 전체 테스트 PASS
