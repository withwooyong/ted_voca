-- Ted Voca — P1+P2 계약 보강 (코드리뷰 2a 반영)
-- 1) 레벨 테스트 1회 완료 추적: XP 중복 지급 방지 + 홈 배너 표시 판단
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level_test_done BOOLEAN DEFAULT FALSE;

-- 2) study_module enum에 review / level_test 추가 (세션 모듈 왜곡 방지)
--    (PG 12+: ALTER TYPE ... ADD VALUE는 같은 트랜잭션에서 '사용'만 못 할 뿐 추가는 가능)
ALTER TYPE study_module ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE study_module ADD VALUE IF NOT EXISTS 'level_test';
