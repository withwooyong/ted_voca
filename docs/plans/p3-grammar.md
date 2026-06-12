# p3-grammar.md — Grammar (P3)

> 문법 퀴즈(카드 배열·빈칸 선택·오류 찾기)와 문법 사전을 구축한다.
> P1+P2의 세션·기록 인프라를 재사용한다.

## 0. 메타

| 항목 | 값 |
|------|-----|
| Phase | **P3** — Grammar |
| 본 chunk | 문법 퀴즈 3유형 + 오답 해설 + 문법 사전 + 콘텐츠 생성 파이프라인 |
| 트랙 | `apps/mobile` + `packages/shared` + `supabase/` + `scripts/` |
| 의존 | P1+P2 완료 (`study_sessions`/`quiz_attempts` 기록, 테스트 인프라, repository 패턴) |
| UI 레퍼런스 | [프로토타입](../prototype/index.html) `#grammar` |
| ted-run 적용 | ✅ |
| plan doc lifecycle | 본 doc → /ted-run 명시 호출 |

## 1. 목적

### 1.1 현 상태 (problem)

- `grammar_topics`/`grammar_questions` 테이블만 있고 콘텐츠·UI·기록 모두 없음.
- `quiz_attempts`가 `word_id`만 참조해 문법 문항 기록 불가.

### 1.2 목표 (DoD)

1. **퀴즈 3유형** — word_order(칩 탭 배열, 프로토타입 검증 UX — 드래그 아님), blank_choice(빈칸 3~4지선다), error_find(틀린 부분 찾기)
2. **오답 해설** — 2~3문장 해설 + "규칙 보기" 링크 → 문법 사전 토픽으로 이동
3. **문법 사전** — CEFR(A1~C1) 토픽별 설명+예문 목록/상세 화면. Learn 탭에서 진입
4. **기록 연동** — `quiz_attempts.grammar_question_id` 추가(마이그레이션), 세션·XP·streak은 P2 인프라 그대로
5. **콘텐츠 파이프라인** — `scripts/grammar_content/` 배치 텍스트 → `scripts/generate_grammar_seed.py` → 시드 SQL. AI 생성 초안 + **human review 필수** 워크플로 (MASTER-PLAN §6)
6. **1차 콘텐츠** — 토픽 20개(A2~B1 중심) · 문항 200개 시드. 60토픽/600문항은 콘텐츠 트랙에서 증분 (구조만 보장)
7. **약점 연동** — 레벨 테스트 `weak_tags`와 토픽 태그 매칭 → Learn 허브에 "Ted 추천 문법" 노출

### 1.3 명시적 비목표 (out-of-scope)

- ❌ 문법 전용 SRS 큐 (v1.1 — 어휘 SRS와 통합 설계 검토 후. ADR로 기록)
- ❌ 드래그 앤 드롭 정렬 (탭 배열로 충분 — 프로토타입 검증 포인트 결정)
- ❌ 60토픽 전체 콘텐츠 작성 (증분)

## 2. 영향 범위

| 경로 | 변경 |
|------|------|
| `packages/shared/src/grammar.ts` | **신규** 어순 채점·정규화(공백/대소문자) 로직 + 테스트 |
| `apps/mobile/app/quiz/grammar.tsx` | **신규** 퀴즈 3유형 화면 |
| `apps/mobile/app/grammar-dict/` | **신규** 사전 목록/상세 |
| `apps/mobile/app/(tabs)/learn.tsx` | 문법 진입 활성화 + Ted 추천 카드 |
| `apps/mobile/lib/data/grammar.ts` | **신규** repository (dual-mode) |
| `supabase/migrations/003_grammar.sql` | **신규** quiz_attempts 컬럼 추가 + 시드 |
| `scripts/generate_grammar_seed.py` | **신규** 콘텐츠 → SQL |

## 3. 화면·라우팅

```
app/
├── quiz/grammar.tsx         # 세션 5문항, 유형 혼합 (#grammar)
├── grammar-dict/index.tsx   # CEFR 그룹 토픽 목록
└── grammar-dict/[slug].tsx  # 설명 + 예문 + "이 토픽 문제 풀기"
```

## 4. Supabase (migration 003)

```sql
ALTER TABLE quiz_attempts ADD COLUMN grammar_question_id UUID REFERENCES grammar_questions(id) ON DELETE SET NULL;
-- grammar_questions.question_type: 'word_order' | 'blank_choice' | 'error_find'
-- options JSONB: word_order={chips:[]}, blank_choice={choices:[]}, error_find={segments:[]}
-- grammar_topics에 tags TEXT[] 추가 (weak_tags 매칭용)
```

시드: 토픽 20 + 문항 200 INSERT.

## 5. 콘텐츠 형식 (scripts/grammar_content/)

```
topic: present-perfect | 현재완료 | A2 | tense
word_order | 그는 여기서 5년째 일하고 있다. | He has worked here for five years | has worked — 현재완료+for 기간
blank_choice | She ___ finished the work. | has;have;had=has | 3인칭 단수 → has
```

파이프 구분 배치 파일 → 파서가 검증(정답 포함, 칩 셔플 가능 여부) 후 SQL 생성. 단어팩 파이프라인(`generate_toeic_seed.py`)과 동일 패턴.

## 6. 테스트

| 테스트 | 방법 |
|--------|------|
| 어순 채점 단위 | vitest — 정답/부분일치/공백·구두점 정규화 |
| 콘텐츠 파서 | python: 형식 오류·정답 누락 검출 |
| 컴포넌트 | 칩 배열→자동 채점, 오답 해설→사전 링크 이동 |
| Manual E2E | 문법 5문항 세션 → XP 적립 → 사전 탐색 |

## 7. 완료 체크리스트

- [ ] migration 003 적용 (컬럼+시드 토픽 20/문항 200)
- [ ] `grammar.ts` 채점 로직 + 테스트
- [ ] 콘텐츠 생성 스크립트 + 1차 콘텐츠 human review
- [ ] 퀴즈 3유형 화면 + 오답 해설
- [ ] 문법 사전 목록/상세
- [ ] quiz_attempts 기록 + XP/streak 연동
- [ ] weak_tags → Ted 추천 노출
- [ ] typecheck + 전체 테스트 PASS
