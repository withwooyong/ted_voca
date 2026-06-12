# ADR-0001 — 학습 로직(SM-2 포함)을 packages/shared 순수 함수로 분리

- 상태: 채택 (2026-06-12, P1+P2)
- 관련: [p1-p2-vocab-srs.md](../plans/p1-p2-vocab-srs.md)

## 결정

SM-2(SRS), 문항 생성, XP 정책, streak, 레벨 테스트 채점을 모두 `packages/shared`의 **순수 함수**로 구현한다. React Native·Supabase 의존 없음. 시간은 항상 `now: Date` 파라미터로 주입한다.

## 근거

- vitest로 초고속 단위 테스트 (67 케이스, line 100%) — 경계값(ease 1.3 하한, mastered 전이, 월 경계 streak)을 시뮬레이터 없이 검증
- local/remote 데이터 레이어가 **같은 함수**를 호출 → 두 모드의 SRS 계산 결과가 구조적으로 일치
- P3+(문법 SRS 통합 검토 시) 재사용 가능

## SM-2 스펙 (테스트가 진실의 원천 — tests/srs.test.ts)

| 평가 | interval | ease | 비고 |
|------|----------|------|------|
| again | 0 (10분 뒤) | -0.2 | reps·streak 리셋, learning 강등 |
| hard | max(1, ×1.2) | -0.15 | pass 취급 (streak +1) |
| good | rep1→1일, rep2→3일, 이후 ×ease | 불변 | |
| easy | rep1→7일, 이후 ×ease×1.3 | +0.15 | |

mastered: reps≥4 && ease≥2.5 && correct_streak≥4. ease 하한 1.3.
`previewIntervals()`가 평가 버튼에 다음 복습일을 노출 (투명성 차별점 ②).

## XP 정책

퀴즈 정답 +3/문항, 복습 카드 +5(again 제외), 세션 보너스 +10, 레벨 테스트 +20(1회).
`level = floor(sqrt(xp/100)) + 1`.
