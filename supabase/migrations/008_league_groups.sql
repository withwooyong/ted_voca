-- Ted Voca — v1.1 리그 group_no 분할 (tier 내 30명 단위 그룹)
-- Apply: supabase db push OR run in Supabase SQL Editor (007 적용 후 실행)
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE FUNCTION.
--
-- 배경: 007 까지는 tier 자체가 경쟁 그룹이라 한 tier 인원이 LEAGUE_GROUP_SIZE(30) 를
--   넘어도 전원이 한 보드에서 경쟁하고 승급 상위10·강등 하위5 가 tier 전체에 적용됐다.
--   008 은 각 tier 를 group_no(0-based) 로 30명씩 쪼개 랭킹·승강등·보드를 (tier, group_no)
--   단위로 동작시킨다. SQL ↔ shared 1:1 원칙(007 계승):
--     assignGroupNos         → floor((ROW_NUMBER() OVER (PARTITION BY new_tier ORDER BY user_id ASC) - 1) / 30)
--     pickGroupNoForNewEntry → (week,tier) 그룹별 count 에서 여유(<30) 최소 group_no, 없으면 max+1, 비면 0
--     outcomeForRank/nextTier→ 007 과 동일하되 rank·cnt 가 (tier, group_no) 그룹 기준
--   (자세한 대응은 packages/shared/src/league.ts 주석 참조)

-- ============================================================================
-- 1) league_entries.group_no — tier 내 그룹 번호. 기존 행은 0(단일 그룹 = v1.0 호환).
-- ============================================================================
ALTER TABLE league_entries ADD COLUMN IF NOT EXISTS group_no INT NOT NULL DEFAULT 0;

-- ============================================================================
-- 2) increment_league_xp(p_xp INT) — 본인 주간 리그 XP 적립 + 신규 행 group_no 배정.
--    007 대비 추가: INSERT(신규 엔트리) 시 group_no 를 pickGroupNoForNewEntry 로 결정.
--    ON CONFLICT(같은 주 누적) 경로는 group_no 미변경 — 이미 배정된 그룹 유지.
--    cap·week_start 강제·tier 승계·INT 오버플로우 가드는 007 그대로.
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_league_xp(p_xp INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       UUID := auth.uid();
  v_week       DATE := date_trunc('week', (now() AT TIME ZONE 'UTC'))::date;  -- shared weekStartKey (UTC 월요일)
  v_xp         INT  := LEAST(GREATEST(p_xp, 0), 500);                          -- shared LEAGUE_MAX_XP_PER_SESSION cap
  v_prev_tier  TEXT;
  v_group      INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null';
  END IF;

  -- 직전 주 본인 tier 승계(없으면 'bronze').
  SELECT tier INTO v_prev_tier
  FROM league_entries
  WHERE user_id = v_user AND week_start < v_week
  ORDER BY week_start DESC
  LIMIT 1;

  v_prev_tier := COALESCE(v_prev_tier, 'bronze');

  -- 신규 엔트리에 배정할 group_no — pickGroupNoForNewEntry 와 1:1.
  --   여유(<30) 있는 최소 group_no → 없으면 max(group_no)+1 → 그룹 자체가 없으면 0.
  -- finalize 가 시드한 행이 이미 있으면(ON CONFLICT) 이 값은 무시되고 기존 group_no 유지.
  WITH g AS (
    SELECT group_no, COUNT(*) AS c
    FROM league_entries
    WHERE week_start = v_week AND tier = v_prev_tier
    GROUP BY group_no
  )
  SELECT COALESCE(
    (SELECT group_no FROM g WHERE c < 30 ORDER BY group_no LIMIT 1),
    (SELECT MAX(group_no) + 1 FROM g),
    0
  ) INTO v_group;

  INSERT INTO league_entries (user_id, week_start, xp, tier, group_no)
  VALUES (v_user, v_week, v_xp, v_prev_tier, v_group)
  ON CONFLICT (user_id, week_start)
  -- INT(32-bit) 오버플로우 방어: 누적 상한 2e9 클램프. tier·group_no 는 유지(미갱신).
  DO UPDATE SET xp = LEAST(league_entries.xp + EXCLUDED.xp, 2000000000);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_league_xp(INT) TO authenticated;

-- ============================================================================
-- 3) get_league_board(p_week_start DATE) — 본인 (tier, group_no) 그룹 보드 조회.
--    007 대비 추가: 호출자의 group_no 도 조회해 WHERE 에 AND group_no = v_group.
--    ROW_NUMBER 은 WHERE 로 좁혀진 단일 그룹 내 연속 rank. PII 비노출(007 §4) 유지.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_league_board(p_week_start DATE)
RETURNS TABLE(rank INT, display_name TEXT, xp INT, tier TEXT, is_me BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_tier  TEXT;
  v_group INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null';
  END IF;

  -- 호출자의 해당 주 tier·group_no 판별. 본인 행이 없으면 보드 비어있음.
  SELECT le.tier, le.group_no INTO v_tier, v_group
  FROM league_entries le
  WHERE le.user_id = v_user AND le.week_start = p_week_start;

  IF v_tier IS NULL THEN
    RETURN;  -- 본인이 이번 주 리그에 없음 → 빈 결과
  END IF;

  RETURN QUERY
  SELECT
    (ROW_NUMBER() OVER (ORDER BY le.xp DESC, le.user_id ASC))::INT AS rank,  -- 그룹 내 연속 1-based rank
    COALESCE(p.display_name, 'Learner')                           AS display_name,
    le.xp                                                          AS xp,
    le.tier                                                        AS tier,
    (le.user_id = v_user)                                          AS is_me
  FROM league_entries le
  LEFT JOIN profiles p ON p.id = le.user_id
  WHERE le.week_start = p_week_start AND le.tier = v_tier AND le.group_no = v_group
  ORDER BY le.xp DESC, le.user_id ASC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_board(DATE) TO authenticated;

-- ============================================================================
-- 4) finalize_league(p_week_start DATE) — 주간 정산(승강등) + 다음 주 그룹 재편.
--    007 대비:
--      - 이번 주 rank·cnt 의 PARTITION 을 (tier) → (tier, group_no) 로 변경(그룹 내 경쟁).
--      - 다음 주 시드 행의 group_no 를 새 tier 기준으로 재배정(assignGroupNos 와 1:1):
--          floor((ROW_NUMBER() OVER (PARTITION BY new_tier ORDER BY user_id ASC) - 1) / 30)
--        → 승강등으로 tier 가 바뀐 유저도 새 tier 의 그룹에 자연스럽게 재편됨.
--    판정(승급 우선)·nextTier 는 007 과 동일(rank·cnt 만 그룹 기준).
--    실행 권한: cron/service role 전용.
-- ============================================================================
CREATE OR REPLACE FUNCTION finalize_league(p_week_start DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next DATE := p_week_start + 7;
BEGIN
  -- 1) 이번 주 그룹 내 rank 로 최종 rank 갱신(표시용).
  WITH ranked AS (
    SELECT
      le.user_id,
      ROW_NUMBER() OVER (PARTITION BY le.tier, le.group_no ORDER BY le.xp DESC, le.user_id ASC) AS rnk
    FROM league_entries le
    WHERE le.week_start = p_week_start
  )
  UPDATE league_entries le
  SET rank = r.rnk
  FROM ranked r
  WHERE le.user_id = r.user_id AND le.week_start = p_week_start;

  -- 2) 다음 주 시드: 그룹 내 rank·cnt 로 new_tier 판정 → 새 tier 기준 group_no 재배정.
  INSERT INTO league_entries (user_id, week_start, xp, tier, group_no)
  SELECT
    d.user_id,
    v_next,
    0,
    d.new_tier,
    -- assignGroupNos: 새 tier 내 user_id 정렬 후 30명씩 → floor((row_number-1)/30)
    (FLOOR((ROW_NUMBER() OVER (PARTITION BY d.new_tier ORDER BY d.user_id ASC) - 1) / 30))::INT
  FROM (
    SELECT
      r.user_id,
      -- outcomeForRank + nextTier (007 과 동일, rank·cnt 는 그룹 기준)
      CASE
        WHEN r.rnk <= 10 AND r.tier <> 'gold' THEN
          CASE r.tier WHEN 'bronze' THEN 'silver' WHEN 'silver' THEN 'gold' ELSE r.tier END
        WHEN r.cnt > 5 AND r.rnk > r.cnt - 5 AND r.tier <> 'bronze' THEN
          CASE r.tier WHEN 'gold' THEN 'silver' WHEN 'silver' THEN 'bronze' ELSE r.tier END
        ELSE r.tier
      END AS new_tier
    FROM (
      SELECT
        le.user_id,
        le.tier,
        ROW_NUMBER() OVER (PARTITION BY le.tier, le.group_no ORDER BY le.xp DESC, le.user_id ASC) AS rnk,
        COUNT(*)     OVER (PARTITION BY le.tier, le.group_no)                                     AS cnt
      FROM league_entries le
      WHERE le.week_start = p_week_start
    ) r
  ) d
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET tier = EXCLUDED.tier, group_no = EXCLUDED.group_no;
END;
$$;

REVOKE ALL ON FUNCTION finalize_league(DATE) FROM PUBLIC, authenticated, anon;

-- ============================================================================
-- 5) pg_cron — 변경 없음.
--    007 의 'finalize-league-weekly' job 이 finalize_league(...) 를 호출하며,
--    CREATE OR REPLACE 로 함수 본문만 교체되므로 cron 은 자동으로 새 정의를 실행한다.
--    (스케줄·jobname·인자 동일 → 재등록 불필요)
-- ============================================================================
