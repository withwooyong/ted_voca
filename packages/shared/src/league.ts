// 리그 랭킹·티어 승강등·주차 로직 — plan: docs/plans/p6-gamification.md §1.2, §3

export type LeagueTier = 'bronze' | 'silver' | 'gold';
export const LEAGUE_TIERS: readonly LeagueTier[] = ['bronze', 'silver', 'gold'] as const;
export const LEAGUE_GROUP_SIZE = 30;
export const LEAGUE_PROMOTE_COUNT = 10;
export const LEAGUE_DEMOTE_COUNT = 5;
/** 회당 리그 XP 적립 상한 (치팅 완화 — RPC와 동일 값 유지) */
export const LEAGUE_MAX_XP_PER_SESSION = 500;

export type LeagueEntryLike = {
  user_id: string;
  display_name: string | null;
  xp: number; // 주간 누적 XP (league_entries.xp 컬럼)
  tier: LeagueTier;
  group_no?: number; // tier 내 그룹 번호(0-based). 미지정이면 단일 그룹(=0)으로 간주 — v1.0 호환
};
export type RankedEntry = LeagueEntryLike & { rank: number };
export type LeagueOutcome = 'promote' | 'demote' | 'stay';

export type LeagueView = {
  ranked: RankedEntry[]; // 전체 rank 부여 결과
  myRank: number | null; // 본인 없으면 null
  myEntry: RankedEntry | null;
  promoteLineRank: number; // = LEAGUE_PROMOTE_COUNT (이 rank 이하가 승급권)
  demoteLineRank: number; // = groupSize - LEAGUE_DEMOTE_COUNT + 1 (이 rank 이상이 강등권); groupSize<=DEMOTE면 0
  window: RankedEntry[]; // top3 ∪ (myRank±2) 를 rank순 dedupe
  xpToPromote: number; // 승급선(promoteLineRank위)의 xp - 내 xp, 음수면 0(이미 승급권), 본인없으면 0
};

/**
 * now의 UTC 기준 그 주 월요일 날짜를 'YYYY-MM-DD'로 반환.
 * 월요일=주 시작. getUTCDay() 0=일~6=토. offset=(day+6)%7.
 * 예: 2026-06-13(토) → '2026-06-08'(월). 2026-06-08(월) → '2026-06-08'. 2026-06-14(일) → '2026-06-08'.
 */
export function weekStartKey(now: Date): string {
  const offset = (now.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset),
  );
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const d = String(monday.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 다음 주 월요일 00:00 UTC까지 남은 "일" 수(올림, 최소 1). 마감 카운트다운용.
 * 월요일 → 7, 일요일 → 1, 토요일 → 2.
 * 정의: 7 - ((getUTCDay()+6)%7).
 */
export function daysUntilWeekEnd(now: Date): number {
  return 7 - ((now.getUTCDay() + 6) % 7);
}

/**
 * xp 내림차순, 동점 시 user_id 사전순(localeCompare) tie-break. rank는 1-based 연속.
 * 입력 불변(원본 미변경, 새 배열 반환). 빈 배열 → 빈 배열.
 */
export function rankEntries(entries: LeagueEntryLike[]): RankedEntry[] {
  return [...entries]
    .sort((a, b) => {
      if (b.xp !== a.xp) return b.xp - a.xp;
      return a.user_id.localeCompare(b.user_id);
    })
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

/**
 * 승급 우선 평가: rank <= LEAGUE_PROMOTE_COUNT && tier !== 'gold' → 'promote'.
 * 아니면 강등: rank > groupSize - LEAGUE_DEMOTE_COUNT && tier !== 'bronze' → 'demote'.
 * 그 외 'stay'.
 */
export function outcomeForRank(
  rank: number,
  groupSize: number,
  tier: LeagueTier,
): LeagueOutcome {
  if (rank <= LEAGUE_PROMOTE_COUNT && tier !== 'gold') return 'promote';
  // 그룹이 강등 정원 이하면 강등 없음 — groupSize - DEMOTE <= 0 이면 선두(rank 1)까지
  // 강등 조건(rank > 0)에 걸리는 경계 버그를 막는다.
  if (
    groupSize > LEAGUE_DEMOTE_COUNT &&
    rank > groupSize - LEAGUE_DEMOTE_COUNT &&
    tier !== 'bronze'
  ) {
    return 'demote';
  }
  return 'stay';
}

/**
 * promote → 한 단계 위(gold에서 clamp), demote → 한 단계 아래(bronze에서 clamp), stay → 그대로.
 */
export function nextTier(tier: LeagueTier, outcome: LeagueOutcome): LeagueTier {
  const idx = LEAGUE_TIERS.indexOf(tier);
  if (outcome === 'promote') {
    return LEAGUE_TIERS[Math.min(idx + 1, LEAGUE_TIERS.length - 1)];
  }
  if (outcome === 'demote') {
    return LEAGUE_TIERS[Math.max(idx - 1, 0)];
  }
  return tier;
}

/**
 * size개씩 분할. 마지막 그룹은 미달 허용. 빈 입력 → [].
 */
export function chunkIntoGroups<T>(items: T[], size = LEAGUE_GROUP_SIZE): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

/**
 * 한 tier 내 유저들을 user_id 사전순(ASC)으로 정렬한 뒤 size명씩 그룹에 배정.
 * group_no = floor(index / size). 입력 불변(새 배열·새 객체 반환). 빈 입력 → [].
 *
 * 주간 정산(finalize_league)에서 *다음 주* 시드 행의 group_no를 정하는 SQL과 1:1 대응:
 *   floor((ROW_NUMBER() OVER (PARTITION BY new_tier ORDER BY user_id ASC) - 1) / size)
 * user_id 정렬은 결정적(replay 안전)이며 실력과 무관하게 그룹을 분산시킨다.
 */
export function assignGroupNos<T extends { user_id: string }>(
  users: T[],
  size = LEAGUE_GROUP_SIZE,
): Array<T & { group_no: number }> {
  return [...users]
    .sort((a, b) => a.user_id.localeCompare(b.user_id))
    .map((u, i) => ({ ...u, group_no: Math.floor(i / size) }));
}

/**
 * 신규 엔트리(이번 주 처음 적립하는 유저)에게 배정할 group_no 결정.
 * `counts`는 해당 (week, tier)의 기존 group_no→인원수 맵.
 *   - 빈 맵 → 0 (첫 그룹)
 *   - 여유(인원 < size) 있는 그룹 중 가장 작은 group_no
 *   - 모든 그룹이 만석이면 max(group_no) + 1 (새 그룹)
 *
 * increment_league_xp의 INSERT 경로 SQL과 1:1 대응(finalize가 시드하지 않은 첫 주·주중 신규 가입 처리).
 */
export function pickGroupNoForNewEntry(
  counts: Map<number, number>,
  size = LEAGUE_GROUP_SIZE,
): number {
  if (counts.size === 0) return 0;
  const keys = [...counts.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    if ((counts.get(k) ?? 0) < size) return k;
  }
  return keys[keys.length - 1] + 1;
}

/**
 * 전체 rank 부여 + 본인 rank/entry + 승급·강등선 + window + xpToPromote 계산.
 * window: 상위 3명 + (본인 rank-2 ~ rank+2) 합집합을 rank 오름차순으로 중복 제거. 본인 없으면 상위 window만.
 * xpToPromote: promoteLineRank번째(10위) 엔트리의 xp에서 내 xp를 뺀 값(0 미만이면 0). 그룹이 10명 이하라 10위가 없으면 0.
 */
export function buildLeagueView(entries: LeagueEntryLike[], myUserId: string): LeagueView {
  const ranked = rankEntries(entries);
  const groupSize = ranked.length;

  const myEntry = ranked.find((e) => e.user_id === myUserId) ?? null;
  const myRank = myEntry ? myEntry.rank : null;

  const promoteLineRank = LEAGUE_PROMOTE_COUNT;
  const demoteLineRank =
    groupSize <= LEAGUE_DEMOTE_COUNT ? 0 : groupSize - LEAGUE_DEMOTE_COUNT + 1;

  // window: top3 ∪ (myRank±2), rank 오름차순 dedupe
  const selected = new Map<number, RankedEntry>();
  for (const e of ranked) {
    if (e.rank <= 3) selected.set(e.rank, e);
  }
  if (myRank !== null) {
    for (const e of ranked) {
      if (e.rank >= myRank - 2 && e.rank <= myRank + 2) selected.set(e.rank, e);
    }
  }
  const window = [...selected.values()].sort((a, b) => a.rank - b.rank);

  // xpToPromote: 승급선(10위) xp - 내 xp, 음수면 0. 본인 없거나 10위 미존재 시 0.
  let xpToPromote = 0;
  if (myEntry) {
    const promoteEntry = ranked.find((e) => e.rank === promoteLineRank);
    if (promoteEntry) {
      xpToPromote = Math.max(0, promoteEntry.xp - myEntry.xp);
    }
  }

  return {
    ranked,
    myRank,
    myEntry,
    promoteLineRank,
    demoteLineRank,
    window,
    xpToPromote,
  };
}
