# ADR-0004 — 문법 콘텐츠 파이프라인과 P3 설계 결정

- 상태: 채택 (2026-06-12, P3)
- 관련: [p3-grammar.md](../plans/p3-grammar.md), [ADR-0002](ADR-0002-dual-mode-repository.md)

## 결정 1 — 배치 텍스트 → JSON + SQL 이중 출력

`scripts/grammar_content/batch_*.txt`(파이프 구분, 사람이 읽고 고치기 쉬운 형식)를 단일 소스로 두고
`scripts/generate_grammar_seed.py`가 **두 출력을 동시 생성**한다:
- `content/grammar-pack.json` — local(mock) 모드 번들 (단어팩과 동일 패턴, id = `{slug}:{n}`)
- `supabase/migrations/004_grammar.sql` — 스키마 보강 + 시드 (멱등: ON CONFLICT, DO 블록 제약 검사)

근거: dual-mode 원칙(ADR-0002)상 콘텐츠도 두 모드에 공급돼야 하며, 소스를 하나로 유지해야
local/remote 콘텐츠 불일치가 구조적으로 불가능하다. 생성기 검증(정답 포함, 칩-정답 일치,
칩 중복 단어, 중복 slug)은 실제로 AI 초안 오류 6건을 차단했다 (파서 unittest 16개).

## 결정 2 — DB 계약 (migration 004)

- `quiz_attempts.grammar_question_id` 추가 — 단일 attempts 스트림 유지 (word_id와 상호 배타적 사용)
- `quiz_type` enum에 통합 값 `'grammar'` 추가 — 유형 3종을 enum으로 세분하지 않음
  (유형은 grammar_questions.question_type이 이미 보유, attempts에선 분석 단위가 "문법"이면 충분)
- `grammar_topics.tags` — 레벨 테스트 `weak_tags`와 같은 어휘를 사용해 추천 매칭 (`recommendTopics`)
- `grammar_questions.sort_order` + `UNIQUE(topic_id, sort_order)` — 시드 멱등성 확보
- 어휘 난이도 조절 입력(`getRecentResults`)은 word attempts만 사용 — 문법 기록이 오염시키지 않도록 양 모드에서 필터

## 결정 3 — 문법은 SRS 비대상 (v1.0)

plan 비목표 그대로: 문법 문항은 `user_words` 같은 SRS 상태를 갖지 않는다.
v1.1에서 어휘 SRS와 통합 설계(공통 카드 모델)를 검토한 뒤 도입한다.
세션·XP·streak은 P2 인프라(`completeSession({module:'grammar'})`)를 그대로 재사용.

## 결정 4 — 어순 UI는 탭 배열(controlled)

프로토타입 검증대로 드래그 미도입. `WordOrderBuilder`는 picked(index 배열)를 부모가 소유하는
controlled 컴포넌트이며, 칩이 모두 놓이면 자동 채점한다. 셔플(`shuffleChips`)은 항등 결과 시
결정적 회전으로 정답 순서 노출을 방지한다.
