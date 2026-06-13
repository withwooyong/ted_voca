-- Ted Voca — P6 Gamification (League finalization + Push tokens)
-- Apply: supabase db push OR run in Supabase SQL Editor
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS /
--             CREATE OR REPLACE FUNCTION / DROP POLICY IF EXISTS / cron unschedule+schedule.
--
-- SQL 정산 로직은 packages/shared/src/league.ts 의 순수 함수와 1:1로 일치해야 한다.
--   weekStartKey   → date_trunc('week', (now() AT TIME ZONE 'UTC'))::date  (ISO 월요일 = UTC Monday)
--   rankEntries    → ROW_NUMBER() OVER (ORDER BY xp DESC, user_id ASC)     (연속 rank, xp desc + user_id asc tie-break)
--   outcomeForRank → 승급 우선: rank<=10 && tier<>'gold' → promote, 아니면 rank>cnt-5 && tier<>'bronze' → demote, 그 외 stay
--   nextTier       → bronze<silver<gold, 양끝 clamp
-- 자세한 대응은 각 함수 주석 참조.

-- ============================================================================
-- 1) profiles.display_name (board 표시명; null이면 'Learner'로 폴백)
--    001에서 이미 정의되어 있으나, 누락 환경 대비 idempotent ADD.
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- ============================================================================
-- 2) push_tokens — Expo push token 수집. own-row RLS (006 B패턴).
--    PK(user_id, expo_token): 같은 토큰 재등록은 upsert 멱등.
-- ============================================================================
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expo_token TEXT NOT NULL,
  platform   TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, expo_token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- own-row 정책 (006 B패턴): DROP POLICY IF EXISTS → TO authenticated.
-- INSERT는 WITH CHECK, SELECT/UPDATE/DELETE는 USING.
DROP POLICY IF EXISTS push_tokens_select_own ON push_tokens;
CREATE POLICY push_tokens_select_own
  ON push_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS push_tokens_insert_own ON push_tokens;
CREATE POLICY push_tokens_insert_own
  ON push_tokens FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS push_tokens_update_own ON push_tokens;
CREATE POLICY push_tokens_update_own
  ON push_tokens FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS push_tokens_delete_own ON push_tokens;
CREATE POLICY push_tokens_delete_own
  ON push_tokens FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- 2.5) league_entries 쓰기 잠금 — 게임화 치팅 차단 (CRITICAL).
--    001 의 league_insert_own / league_update_own own-row 정책은 인증 사용자가
--    supabase-js 로 league_entries 를 직접 INSERT/UPDATE 해 xp·tier·rank 를 임의
--    위조하도록 허용한다 → increment_league_xp 의 cap·week_start 강제·tier 승계가
--    전부 우회된다(P5 동형: "RPC 만 잠가선 부족, 테이블 직접 쓰기도 막아야 cap 강제").
--    쓰기는 오직 SECURITY DEFINER 함수(increment_league_xp / finalize_league, 정책
--    소유자 권한으로 실행되어 own-row 정책 없이 동작)로만 허용한다.
--    SELECT own 은 getLeagueSummary(본인 tier·xp 조회)에 필요하므로 유지.
--    ⚠️ league_entries 에 FORCE ROW LEVEL SECURITY 를 절대 추가하지 말 것 —
--       INSERT 정책을 제거했으므로 FORCE 가 걸리면 SECURITY DEFINER 함수의 적립 INSERT 까지
--       막혀 리그 기능 전체가 깨진다(쓰기 경로는 함수의 owner RLS 우회에 의존).
-- ============================================================================
DROP POLICY IF EXISTS league_insert_own ON league_entries;
DROP POLICY IF EXISTS league_update_own ON league_entries;
-- league_select_own 은 유지 — 본인 행 읽기 전용. 그룹 보드는 get_league_board RPC 가 담당.

-- ============================================================================
-- 3) increment_league_xp(p_xp INT) — 본인 주간 리그 XP 적립.
--    대응: lib/data/local.ts addLeagueXp + shared weekStartKey.
--    - week_start 는 클라이언트가 아니라 서버가 강제(치팅 완화).
--    - p_xp 는 회당 상한 cap (LEAGUE_MAX_XP_PER_SESSION = 500), 음수는 0.
--    - tier 는 직전 주 본인 tier 승계(없으면 'bronze'). 새 주 첫 적립 시 INSERT.
--    - 같은 주 누적은 ON CONFLICT DO UPDATE 로 원자적 가산(006 increment_speaking_usage 패턴).
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_league_xp(p_xp INT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       UUID := auth.uid();
  v_week       DATE := date_trunc('week', (now() AT TIME ZONE 'UTC'))::date;  -- shared weekStartKey 와 동일(UTC 월요일)
  v_xp         INT  := LEAST(GREATEST(p_xp, 0), 500);                          -- shared LEAGUE_MAX_XP_PER_SESSION cap
  v_prev_tier  TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null';
  END IF;

  -- 직전 주(이번 주 이전 가장 최근) 본인 tier 승계. 없으면 'bronze'.
  SELECT tier INTO v_prev_tier
  FROM league_entries
  WHERE user_id = v_user AND week_start < v_week
  ORDER BY week_start DESC
  LIMIT 1;

  v_prev_tier := COALESCE(v_prev_tier, 'bronze');

  INSERT INTO league_entries (user_id, week_start, xp, tier)
  VALUES (v_user, v_week, v_xp, v_prev_tier)
  ON CONFLICT (user_id, week_start)
  -- INT(32-bit) 오버플로우 방어: 누적 상한 2e9 클램프(봇 반복 호출 시 'integer out of range' 차단).
  DO UPDATE SET xp = LEAST(league_entries.xp + EXCLUDED.xp, 2000000000);
  -- 주의: tier 는 갱신하지 않음 — 같은 주 내 적립은 이미 결정된 tier 유지.
END;
$$;

-- 본인 행만 건드리므로 authenticated 직접 호출 허용.
GRANT EXECUTE ON FUNCTION increment_league_xp(INT) TO authenticated;

-- ============================================================================
-- 4) get_league_board(p_week_start DATE) — 본인 tier 그룹 보드 조회.
--    대응: shared rankEntries (xp desc, user_id asc, 연속 rank=ROW_NUMBER).
--    보안: 타인 user_id·email 절대 미반환. display_name(COALESCE 'Learner')·xp·tier·is_me 만.
--    상위 50명 cap.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_league_board(p_week_start DATE)
RETURNS TABLE(rank INT, display_name TEXT, xp INT, tier TEXT, is_me BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_tier TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'auth.uid() is null';
  END IF;

  -- 호출자의 해당 주 tier 판별. 본인 행이 없으면 보드 비어있음.
  SELECT le.tier INTO v_tier
  FROM league_entries le
  WHERE le.user_id = v_user AND le.week_start = p_week_start;

  IF v_tier IS NULL THEN
    RETURN;  -- 본인이 이번 주 리그에 없음 → 빈 결과
  END IF;

  RETURN QUERY
  SELECT
    -- ROW_NUMBER → shared rankEntries 의 연속 1-based rank (RANK 아님: 동점도 다른 순위)
    (ROW_NUMBER() OVER (ORDER BY le.xp DESC, le.user_id ASC))::INT AS rank,
    COALESCE(p.display_name, 'Learner')                           AS display_name,  -- null → 'Learner'
    le.xp                                                          AS xp,
    le.tier                                                        AS tier,
    (le.user_id = v_user)                                          AS is_me           -- user_id 자체는 미반환
  FROM league_entries le
  LEFT JOIN profiles p ON p.id = le.user_id
  WHERE le.week_start = p_week_start AND le.tier = v_tier
  ORDER BY le.xp DESC, le.user_id ASC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_board(DATE) TO authenticated;

-- ============================================================================
-- 5) finalize_league(p_week_start DATE) — 주간 정산(승강등).
--    대응: shared outcomeForRank + nextTier.
--    각 tier 그룹별:
--      rank = ROW_NUMBER() OVER (PARTITION BY tier ORDER BY xp DESC, user_id ASC)   (연속 rank)
--      cnt  = COUNT(*) OVER (PARTITION BY tier)                                       (그룹 크기 = groupSize)
--    판정(승급 우선, league.ts outcomeForRank 그대로):
--      promote: rank <= 10        AND tier <> 'gold'
--      demote : cnt > 5 AND rank > cnt - 5 AND tier <> 'bronze'  (cnt<=5 면 강등 없음 — 선두까지 강등되는 경계버그 방지)
--      stay   : 그 외
--    nextTier: promote→한 단계 위(gold clamp), demote→한 단계 아래(bronze clamp), stay→유지.
--    결과 기록:
--      - 이번 주(p_week_start) league_entries.rank 갱신(표시용 최종 순위).
--      - 다음 주(p_week_start + 7) 행 INSERT(xp=0, tier=새티어) ON CONFLICT DO UPDATE SET tier=새티어.
--    실행 권한: cron/service role 전용 (REVOKE FROM PUBLIC/authenticated/anon).
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
  -- 1) 그룹별 rank·cnt 산출 후 outcome·new_tier 계산.
  WITH ranked AS (
    SELECT
      le.user_id,
      le.tier,
      -- shared rankEntries: 연속 1-based rank (ROW_NUMBER, RANK 아님)
      ROW_NUMBER() OVER (PARTITION BY le.tier ORDER BY le.xp DESC, le.user_id ASC) AS rnk,
      COUNT(*)     OVER (PARTITION BY le.tier)                                     AS cnt
    FROM league_entries le
    WHERE le.week_start = p_week_start
  ),
  decided AS (
    SELECT
      r.user_id,
      r.tier,
      r.rnk,
      -- outcomeForRank: 승급 우선. CASE 평가 순서로 promote가 demote보다 먼저 판정됨.
      CASE
        WHEN r.rnk <= 10 AND r.tier <> 'gold' THEN
          -- nextTier(promote): bronze→silver, silver→gold (gold는 위에서 제외됨)
          CASE r.tier WHEN 'bronze' THEN 'silver' WHEN 'silver' THEN 'gold' ELSE r.tier END
        WHEN r.cnt > 5 AND r.rnk > r.cnt - 5 AND r.tier <> 'bronze' THEN
          -- nextTier(demote): gold→silver, silver→bronze (bronze는 위에서 제외됨)
          -- cnt > 5 가드: 그룹이 강등정원(5) 이하면 강등 없음(league.ts outcomeForRank 와 동일)
          CASE r.tier WHEN 'gold' THEN 'silver' WHEN 'silver' THEN 'bronze' ELSE r.tier END
        ELSE
          r.tier  -- stay
      END AS new_tier
    FROM ranked r
  )
  -- 2) 이번 주 최종 rank 갱신 + 다음 주 시드 행 생성(승강등 반영) — CTE 결과를 두 번 사용하기 위해 먼저 임시로 모은다.
  -- (Postgres는 단일 statement 안에서 CTE를 여러 DML에 재사용 못 하므로 update는 별도 statement로 분리)
  UPDATE league_entries le
  SET rank = d.rnk
  FROM decided d
  WHERE le.user_id = d.user_id AND le.week_start = p_week_start;

  -- 다음 주 행: 동일 rank/outcome 계산을 다시 수행해 tier 시드.
  INSERT INTO league_entries (user_id, week_start, xp, tier)
  SELECT d.user_id, v_next, 0, d.new_tier
  FROM (
    SELECT
      r.user_id,
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
        ROW_NUMBER() OVER (PARTITION BY le.tier ORDER BY le.xp DESC, le.user_id ASC) AS rnk,
        COUNT(*)     OVER (PARTITION BY le.tier)                                     AS cnt
      FROM league_entries le
      WHERE le.week_start = p_week_start
    ) r
  ) d
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET tier = EXCLUDED.tier;
END;
$$;

-- cron/service role 전용 — 일반 사용자가 임의 정산 트리거 못 하도록 전부 회수.
REVOKE ALL ON FUNCTION finalize_league(DATE) FROM PUBLIC, authenticated, anon;

-- ============================================================================
-- 6) pg_cron — 매주 UTC 월요일 00:00 에 직전 주(p_week_start = 이번 UTC 월요일 - 7) 정산.
--    idempotent: 기존 동일 job 이 있으면 unschedule 후 재등록.
--    cron job 식별은 jobname 'finalize-league-weekly'.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  -- 동일 jobname 존재 시 제거(스케줄/명령 변경 반영 + 중복 방지).
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finalize-league-weekly') THEN
    PERFORM cron.unschedule('finalize-league-weekly');
  END IF;

  PERFORM cron.schedule(
    'finalize-league-weekly',
    '0 0 * * 1',  -- UTC 월요일 00:00 (pg_cron 은 UTC 기준)
    $cron$ SELECT finalize_league((date_trunc('week', now() AT TIME ZONE 'UTC')::date - 7)) $cron$
  );
END $$;
