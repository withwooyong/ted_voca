// P6 리그 순수 로직 — 계약 테스트 (vitest)
// 대상: packages/shared/src/league.ts (스텁) — 함수 테스트는 모두 red여야 함
import { describe, expect, it } from 'vitest';

import {
  assignGroupNos,
  buildLeagueView,
  chunkIntoGroups,
  daysUntilWeekEnd,
  LEAGUE_DEMOTE_COUNT,
  LEAGUE_GROUP_SIZE,
  LEAGUE_MAX_XP_PER_SESSION,
  LEAGUE_PROMOTE_COUNT,
  LEAGUE_TIERS,
  nextTier,
  outcomeForRank,
  pickGroupNoForNewEntry,
  rankEntries,
  weekStartKey,
  type LeagueEntryLike,
  type LeagueOutcome,
  type LeagueTier,
  type LeagueView,
  type RankedEntry,
} from '../src/league';

// ────────────────────────────────────────────────────────────
// fixture 팩토리
// ────────────────────────────────────────────────────────────

function entry(over: Partial<LeagueEntryLike> & { user_id: string }): LeagueEntryLike {
  return {
    display_name: null,
    xp: 100,
    tier: 'bronze',
    ...over,
  };
}

// ────────────────────────────────────────────────────────────
// 1. 상수 export 확인 (import 자체가 검증)
// ────────────────────────────────────────────────────────────

describe('상수', () => {
  it('LEAGUE_TIERS는 bronze/silver/gold 순서', () => {
    expect(LEAGUE_TIERS).toEqual(['bronze', 'silver', 'gold']);
  });

  it('LEAGUE_GROUP_SIZE = 30', () => {
    expect(LEAGUE_GROUP_SIZE).toBe(30);
  });

  it('LEAGUE_PROMOTE_COUNT = 10', () => {
    expect(LEAGUE_PROMOTE_COUNT).toBe(10);
  });

  it('LEAGUE_DEMOTE_COUNT = 5', () => {
    expect(LEAGUE_DEMOTE_COUNT).toBe(5);
  });

  it('LEAGUE_MAX_XP_PER_SESSION = 500', () => {
    expect(LEAGUE_MAX_XP_PER_SESSION).toBe(500);
  });
});

// ────────────────────────────────────────────────────────────
// 2. weekStartKey
// ────────────────────────────────────────────────────────────

describe('weekStartKey', () => {
  it('월요일(2026-06-08) → 그 주 월요일 자신', () => {
    // 2026-06-08 is Monday
    const mon = new Date(Date.UTC(2026, 5, 8));
    expect(weekStartKey(mon)).toBe('2026-06-08');
  });

  it('토요일(2026-06-13) → 그 주 월요일(2026-06-08)', () => {
    // 2026-06-13 is Saturday
    const sat = new Date(Date.UTC(2026, 5, 13));
    expect(weekStartKey(sat)).toBe('2026-06-08');
  });

  it('일요일(2026-06-14) → 그 주 월요일(2026-06-08)', () => {
    // 2026-06-14 is Sunday — still same week (UTC Monday start)
    const sun = new Date(Date.UTC(2026, 5, 14));
    expect(weekStartKey(sun)).toBe('2026-06-08');
  });

  it('연·월 경계: 2026-01-04(일) → 2025-12-29(월)', () => {
    // 2026-01-04 is Sunday; Monday of that week = 2025-12-29
    const d = new Date(Date.UTC(2026, 0, 4));
    expect(weekStartKey(d)).toBe('2025-12-29');
  });

  it('연·월 경계: 2026-03-02(월) → 2026-03-02', () => {
    // 2026-03-02 is Monday
    const d = new Date(Date.UTC(2026, 2, 2));
    expect(weekStartKey(d)).toBe('2026-03-02');
  });

  it('ISO 문자열로 생성한 Date도 동일 결과', () => {
    const d = new Date('2026-06-13T10:30:00.000Z');
    expect(weekStartKey(d)).toBe('2026-06-08');
  });
});

// ────────────────────────────────────────────────────────────
// 3. daysUntilWeekEnd
// ────────────────────────────────────────────────────────────

describe('daysUntilWeekEnd', () => {
  it('월요일 → 7', () => {
    const mon = new Date(Date.UTC(2026, 5, 8)); // 2026-06-08 Monday
    expect(daysUntilWeekEnd(mon)).toBe(7);
  });

  it('일요일 → 1', () => {
    const sun = new Date(Date.UTC(2026, 5, 14)); // 2026-06-14 Sunday
    expect(daysUntilWeekEnd(sun)).toBe(1);
  });

  it('토요일 → 2', () => {
    const sat = new Date(Date.UTC(2026, 5, 13)); // 2026-06-13 Saturday
    expect(daysUntilWeekEnd(sat)).toBe(2);
  });

  it('화요일 → 6', () => {
    const tue = new Date(Date.UTC(2026, 5, 9)); // 2026-06-09 Tuesday
    expect(daysUntilWeekEnd(tue)).toBe(6);
  });

  it('수요일 → 5', () => {
    const wed = new Date(Date.UTC(2026, 5, 10)); // 2026-06-10 Wednesday
    expect(daysUntilWeekEnd(wed)).toBe(5);
  });
});

// ────────────────────────────────────────────────────────────
// 4. rankEntries
// ────────────────────────────────────────────────────────────

describe('rankEntries', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(rankEntries([])).toEqual([]);
  });

  it('xp 내림차순 정렬', () => {
    const entries = [
      entry({ user_id: 'u1', xp: 50 }),
      entry({ user_id: 'u2', xp: 300 }),
      entry({ user_id: 'u3', xp: 150 }),
    ];
    const ranked = rankEntries(entries);
    expect(ranked.map((e) => e.xp)).toEqual([300, 150, 50]);
  });

  it('rank는 1-based 연속 (1, 2, 3, …)', () => {
    const entries = [
      entry({ user_id: 'u1', xp: 100 }),
      entry({ user_id: 'u2', xp: 200 }),
      entry({ user_id: 'u3', xp: 50 }),
    ];
    const ranked = rankEntries(entries);
    expect(ranked.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('동점 시 user_id 사전순(localeCompare) tie-break', () => {
    const entries = [
      entry({ user_id: 'ub', xp: 200 }),
      entry({ user_id: 'ua', xp: 200 }),
      entry({ user_id: 'uc', xp: 200 }),
    ];
    const ranked = rankEntries(entries);
    expect(ranked.map((e) => e.user_id)).toEqual(['ua', 'ub', 'uc']);
  });

  it('동점도 서로 다른 rank (연속 rank)', () => {
    const entries = [
      entry({ user_id: 'ub', xp: 200 }),
      entry({ user_id: 'ua', xp: 200 }),
    ];
    const ranked = rankEntries(entries);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });

  it('원본 배열 불변 (새 배열 반환)', () => {
    const entries = [
      entry({ user_id: 'u1', xp: 50 }),
      entry({ user_id: 'u2', xp: 300 }),
    ];
    const original = [...entries];
    rankEntries(entries);
    expect(entries[0].user_id).toBe(original[0].user_id);
    expect(entries[1].user_id).toBe(original[1].user_id);
  });

  it('단일 엔트리 → rank 1', () => {
    const ranked = rankEntries([entry({ user_id: 'u1', xp: 100 })]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].rank).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// 5. outcomeForRank
// ────────────────────────────────────────────────────────────

describe('outcomeForRank', () => {
  const G = 30; // groupSize

  it('상위 10 (rank 1) bronze → promote', () => {
    expect(outcomeForRank(1, G, 'bronze')).toBe('promote');
  });

  it('상위 10 (rank 10) silver → promote', () => {
    expect(outcomeForRank(10, G, 'silver')).toBe('promote');
  });

  it('상위 10 (rank 10) gold → stay (승급 불가)', () => {
    expect(outcomeForRank(10, G, 'gold')).toBe('stay');
  });

  it('rank 11 bronze → stay (중간권)', () => {
    expect(outcomeForRank(11, G, 'bronze')).toBe('stay');
  });

  it('하위 5 (rank 26) silver → demote', () => {
    // groupSize=30, demoteThreshold = 30-5+1 = 26
    expect(outcomeForRank(26, G, 'silver')).toBe('demote');
  });

  it('하위 5 (rank 30) gold → demote', () => {
    expect(outcomeForRank(30, G, 'gold')).toBe('demote');
  });

  it('하위 5 (rank 26) bronze → stay (강등 불가)', () => {
    expect(outcomeForRank(26, G, 'bronze')).toBe('stay');
  });

  it('작은 그룹(12명) rank 8~10 bronze → promote (승급 우선)', () => {
    // groupSize=12, demote zone: rank > 12-5=7 → rank 8~12
    // promote zone: rank <= 10 → rank 1~10
    // rank 8~10은 두 구간 겹침 → promote 우선
    expect(outcomeForRank(8, 12, 'bronze')).toBe('promote');
    expect(outcomeForRank(10, 12, 'bronze')).toBe('promote');
  });

  it('작은 그룹(12명) rank 11~12 silver → demote (승급권 밖)', () => {
    expect(outcomeForRank(11, 12, 'silver')).toBe('demote');
    expect(outcomeForRank(12, 12, 'silver')).toBe('demote');
  });

  it('그룹이 강등정원(5) 이하면 강등 없음 — 선두/최하위 모두 stay (경계 버그 방지)', () => {
    // groupSize <= LEAGUE_DEMOTE_COUNT 이면 groupSize-5 <= 0 → rank>0 전원이 강등 조건에 걸리던 버그 방지.
    expect(outcomeForRank(1, 5, 'gold')).toBe('stay'); // gold 1위: 승급 불가 + 강등 없음
    expect(outcomeForRank(3, 3, 'gold')).toBe('stay'); // gold 최하위도 강등 안 됨
    expect(outcomeForRank(1, 3, 'silver')).toBe('promote'); // silver 1위는 1<=10 → 승급
    expect(outcomeForRank(5, 5, 'silver')).toBe('promote'); // 5<=10 → 승급(강등 아님)
  });

  it('중간 rank stay', () => {
    expect(outcomeForRank(15, G, 'silver')).toBe('stay');
  });
});

// ────────────────────────────────────────────────────────────
// 6. nextTier
// ────────────────────────────────────────────────────────────

describe('nextTier', () => {
  it('bronze + promote → silver', () => {
    expect(nextTier('bronze', 'promote')).toBe('silver');
  });

  it('silver + promote → gold', () => {
    expect(nextTier('silver', 'promote')).toBe('gold');
  });

  it('gold + promote → gold (clamp)', () => {
    expect(nextTier('gold', 'promote')).toBe('gold');
  });

  it('gold + demote → silver', () => {
    expect(nextTier('gold', 'demote')).toBe('silver');
  });

  it('silver + demote → bronze', () => {
    expect(nextTier('silver', 'demote')).toBe('bronze');
  });

  it('bronze + demote → bronze (clamp)', () => {
    expect(nextTier('bronze', 'demote')).toBe('bronze');
  });

  it('stay → 티어 그대로', () => {
    expect(nextTier('bronze', 'stay')).toBe('bronze');
    expect(nextTier('silver', 'stay')).toBe('silver');
    expect(nextTier('gold', 'stay')).toBe('gold');
  });
});

// ────────────────────────────────────────────────────────────
// 7. chunkIntoGroups
// ────────────────────────────────────────────────────────────

describe('chunkIntoGroups', () => {
  it('빈 배열 → []', () => {
    expect(chunkIntoGroups([])).toEqual([]);
  });

  it('30개 → 그룹 1개(30개)', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const groups = chunkIntoGroups(items, 30);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(30);
  });

  it('31개 → 그룹 2개(30+1)', () => {
    const items = Array.from({ length: 31 }, (_, i) => i);
    const groups = chunkIntoGroups(items, 30);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(30);
    expect(groups[1]).toHaveLength(1);
  });

  it('기본 size는 LEAGUE_GROUP_SIZE(30)', () => {
    const items = Array.from({ length: 45 }, (_, i) => i);
    const groups = chunkIntoGroups(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(30);
    expect(groups[1]).toHaveLength(15);
  });

  it('커스텀 size 5, 13개 → [5,5,3]', () => {
    const items = Array.from({ length: 13 }, (_, i) => i);
    const groups = chunkIntoGroups(items, 5);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveLength(5);
    expect(groups[1]).toHaveLength(5);
    expect(groups[2]).toHaveLength(3);
  });

  it('아이템 내용이 보존됨', () => {
    const items = ['a', 'b', 'c'];
    const groups = chunkIntoGroups(items, 2);
    expect(groups[0]).toEqual(['a', 'b']);
    expect(groups[1]).toEqual(['c']);
  });
});

// ────────────────────────────────────────────────────────────
// 7-1. assignGroupNos (v1.1 group_no 분할)
// ────────────────────────────────────────────────────────────

describe('assignGroupNos', () => {
  const users = (n: number) =>
    // user_id를 zero-pad 해 사전순 == 숫자순이 되도록(정렬 검증 용이)
    Array.from({ length: n }, (_, i) => ({ user_id: `u${String(i).padStart(3, '0')}` }));

  it('빈 배열 → []', () => {
    expect(assignGroupNos([])).toEqual([]);
  });

  it('29명 → 전원 group_no 0', () => {
    const r = assignGroupNos(users(29), 30);
    expect(r).toHaveLength(29);
    expect(r.every((u) => u.group_no === 0)).toBe(true);
  });

  it('30명 → 전원 group_no 0 (경계)', () => {
    const r = assignGroupNos(users(30), 30);
    expect(r.every((u) => u.group_no === 0)).toBe(true);
  });

  it('31명 → 30명 group 0 + 1명 group 1 (경계)', () => {
    const r = assignGroupNos(users(31), 30);
    expect(r.filter((u) => u.group_no === 0)).toHaveLength(30);
    expect(r.filter((u) => u.group_no === 1)).toHaveLength(1);
  });

  it('60명 → group 0/1 각 30명, 61명 → group 2에 1명', () => {
    expect(assignGroupNos(users(60), 30).filter((u) => u.group_no === 1)).toHaveLength(30);
    const r61 = assignGroupNos(users(61), 30);
    expect(r61.filter((u) => u.group_no === 2)).toHaveLength(1);
  });

  it('user_id 사전순 정렬 후 chunk — floor(index/size)', () => {
    const shuffled = [{ user_id: 'c' }, { user_id: 'a' }, { user_id: 'b' }, { user_id: 'd' }];
    const r = assignGroupNos(shuffled, 2);
    // 정렬: a,b → group 0 / c,d → group 1
    expect(r).toEqual([
      { user_id: 'a', group_no: 0 },
      { user_id: 'b', group_no: 0 },
      { user_id: 'c', group_no: 1 },
      { user_id: 'd', group_no: 1 },
    ]);
  });

  it('입력 배열을 변경하지 않음', () => {
    const input = [{ user_id: 'b' }, { user_id: 'a' }];
    const snapshot = JSON.parse(JSON.stringify(input));
    assignGroupNos(input, 2);
    expect(input).toEqual(snapshot);
  });

  it('기본 size는 LEAGUE_GROUP_SIZE(30)', () => {
    const r = assignGroupNos(users(31));
    expect(r.filter((u) => u.group_no === 1)).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────
// 7-2. pickGroupNoForNewEntry (v1.1 group_no 분할)
// ────────────────────────────────────────────────────────────

describe('pickGroupNoForNewEntry', () => {
  it('빈 맵 → 0 (첫 그룹)', () => {
    expect(pickGroupNoForNewEntry(new Map(), 30)).toBe(0);
  });

  it('여유 있는 그룹 → 그 group_no (0에 자리)', () => {
    expect(pickGroupNoForNewEntry(new Map([[0, 5]]), 30)).toBe(0);
  });

  it('group 0 만석 → 1', () => {
    expect(pickGroupNoForNewEntry(new Map([[0, 30]]), 30)).toBe(1);
  });

  it('group 0·1 만석 → 2 (max+1)', () => {
    expect(
      pickGroupNoForNewEntry(
        new Map([
          [0, 30],
          [1, 30],
        ]),
        30,
      ),
    ).toBe(2);
  });

  it('여러 그룹 중 여유 있는 최소 group_no 우선 (0 만석, 1 여유)', () => {
    expect(
      pickGroupNoForNewEntry(
        new Map([
          [0, 30],
          [1, 10],
        ]),
        30,
      ),
    ).toBe(1);
  });

  it('정확히 size면 만석으로 간주(< 비교)', () => {
    expect(pickGroupNoForNewEntry(new Map([[0, 30]]), 30)).toBe(1);
    expect(pickGroupNoForNewEntry(new Map([[0, 29]]), 30)).toBe(0);
  });

  it('기본 size는 LEAGUE_GROUP_SIZE(30)', () => {
    expect(pickGroupNoForNewEntry(new Map([[0, 30]]))).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// 8. buildLeagueView
// ────────────────────────────────────────────────────────────

describe('buildLeagueView', () => {
  // 20명 그룹 (중위권 본인)
  const makeGroup = (myId: string, myXp: number) => {
    const group: LeagueEntryLike[] = Array.from({ length: 20 }, (_, i) => ({
      user_id: `user-${i + 1}`,
      display_name: `User ${i + 1}`,
      xp: (20 - i) * 50, // 1000, 950, 900, ..., 50
      tier: 'silver' as LeagueTier,
    }));
    // 본인을 12위 XP(xp=450)로 교체
    group[11] = { user_id: myId, display_name: '나', xp: myXp, tier: 'silver' };
    return group;
  };

  it('본인 중위권: myRank, myEntry 정확', () => {
    const MY_ID = 'my-user';
    const entries = makeGroup(MY_ID, 450); // 12위 xp
    const view = buildLeagueView(entries, MY_ID);
    expect(view.myEntry?.user_id).toBe(MY_ID);
    expect(view.myRank).toBe(view.myEntry?.rank);
    expect(typeof view.myRank).toBe('number');
  });

  it('ranked는 전체 엔트리에 rank 부여된 배열', () => {
    const MY_ID = 'my-user';
    const entries = makeGroup(MY_ID, 450);
    const view = buildLeagueView(entries, MY_ID);
    expect(view.ranked).toHaveLength(20);
    expect(view.ranked[0].rank).toBe(1);
    expect(view.ranked[19].rank).toBe(20);
  });

  it('promoteLineRank = LEAGUE_PROMOTE_COUNT', () => {
    const view = buildLeagueView(makeGroup('me', 100), 'me');
    expect(view.promoteLineRank).toBe(LEAGUE_PROMOTE_COUNT);
  });

  it('demoteLineRank = groupSize - LEAGUE_DEMOTE_COUNT + 1', () => {
    const entries = makeGroup('me', 100);
    const view = buildLeagueView(entries, 'me');
    expect(view.demoteLineRank).toBe(entries.length - LEAGUE_DEMOTE_COUNT + 1);
  });

  it('본인 1위: myRank=1, window에 본인 포함', () => {
    const MY_ID = 'top-user';
    const entries: LeagueEntryLike[] = [
      { user_id: MY_ID, display_name: '나', xp: 9999, tier: 'gold' },
      ...Array.from({ length: 9 }, (_, i) => ({
        user_id: `u${i}`,
        display_name: `User ${i}`,
        xp: 100 - i * 10,
        tier: 'gold' as LeagueTier,
      })),
    ];
    const view = buildLeagueView(entries, MY_ID);
    expect(view.myRank).toBe(1);
    expect(view.window.some((e) => e.user_id === MY_ID)).toBe(true);
  });

  it('본인 없으면 myRank=null, myEntry=null', () => {
    const entries = [
      entry({ user_id: 'u1', xp: 300 }),
      entry({ user_id: 'u2', xp: 200 }),
      entry({ user_id: 'u3', xp: 100 }),
    ];
    const view = buildLeagueView(entries, 'ghost-user');
    expect(view.myRank).toBeNull();
    expect(view.myEntry).toBeNull();
  });

  it('본인 없으면 xpToPromote=0', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry({ user_id: `u${i}`, xp: (15 - i) * 100 }),
    );
    const view = buildLeagueView(entries, 'ghost-user');
    expect(view.xpToPromote).toBe(0);
  });

  it('본인이 승급권(rank<=10)이면 xpToPromote=0', () => {
    const MY_ID = 'top5';
    const entries: LeagueEntryLike[] = [
      { user_id: MY_ID, display_name: '나', xp: 900, tier: 'silver' },
      ...Array.from({ length: 14 }, (_, i) => ({
        user_id: `u${i}`,
        display_name: null,
        xp: 50 + i * 10,
        tier: 'silver' as LeagueTier,
      })),
    ];
    const view = buildLeagueView(entries, MY_ID);
    expect(view.myRank).not.toBeNull();
    expect(view.myRank!).toBeLessThanOrEqual(LEAGUE_PROMOTE_COUNT);
    expect(view.xpToPromote).toBe(0);
  });

  it('xpToPromote: 10위 XP - 내 XP, 음수면 0', () => {
    const MY_ID = 'rank15-user';
    // 20명 그룹, xp 1000~50 (50씩 감소)
    const entries: LeagueEntryLike[] = Array.from({ length: 20 }, (_, i) => ({
      user_id: i === 14 ? MY_ID : `u${i}`,
      display_name: null,
      xp: (20 - i) * 50, // index 0=1000, 9=550, 14=300
      tier: 'bronze' as LeagueTier,
    }));
    const view = buildLeagueView(entries, MY_ID);
    // 10위 xp = (20-9)*50 = 550, 내 xp = 300 → xpToPromote = 250
    expect(view.xpToPromote).toBe(250);
  });

  it('그룹이 10명 이하(10위 없음) → xpToPromote=0', () => {
    const MY_ID = 'small-group-user';
    const entries: LeagueEntryLike[] = Array.from({ length: 8 }, (_, i) => ({
      user_id: i === 7 ? MY_ID : `u${i}`,
      display_name: null,
      xp: (8 - i) * 100,
      tier: 'bronze' as LeagueTier,
    }));
    const view = buildLeagueView(entries, MY_ID);
    expect(view.xpToPromote).toBe(0);
  });

  it('window: top3 포함', () => {
    const MY_ID = 'mid-user';
    const entries: LeagueEntryLike[] = Array.from({ length: 20 }, (_, i) => ({
      user_id: i === 15 ? MY_ID : `u${i}`,
      display_name: null,
      xp: (20 - i) * 50,
      tier: 'silver' as LeagueTier,
    }));
    const view = buildLeagueView(entries, MY_ID);
    // top3 rank는 1,2,3 이어야 함
    const windowRanks = view.window.map((e) => e.rank);
    expect(windowRanks).toContain(1);
    expect(windowRanks).toContain(2);
    expect(windowRanks).toContain(3);
  });

  it('window: 본인 ±2 포함 (rank 오름차순, 중복 없음)', () => {
    const MY_ID = 'mid-user';
    // 20명, 본인이 index 14 (15위)
    const entries: LeagueEntryLike[] = Array.from({ length: 20 }, (_, i) => ({
      user_id: i === 14 ? MY_ID : `u${i}`,
      display_name: null,
      xp: (20 - i) * 50,
      tier: 'silver' as LeagueTier,
    }));
    const view = buildLeagueView(entries, MY_ID);
    const myRank = view.myRank!;
    const windowRanks = view.window.map((e) => e.rank);
    // 본인 rank ±2 범위가 window에 존재해야 함
    for (const r of [myRank - 2, myRank - 1, myRank, myRank + 1, myRank + 2]) {
      if (r >= 1 && r <= 20) {
        expect(windowRanks).toContain(r);
      }
    }
    // 중복 없음
    expect(new Set(windowRanks).size).toBe(windowRanks.length);
    // rank 오름차순
    for (let i = 1; i < windowRanks.length; i++) {
      expect(windowRanks[i]).toBeGreaterThan(windowRanks[i - 1]);
    }
  });

  it('본인 없을 때 window는 상위 엔트리만', () => {
    const entries: LeagueEntryLike[] = Array.from({ length: 10 }, (_, i) =>
      entry({ user_id: `u${i}`, xp: (10 - i) * 100 }),
    );
    const view = buildLeagueView(entries, 'ghost');
    // 본인 없으므로 top3만 (또는 그 이상이지만 본인 ±2 구간 없음)
    expect(view.window.every((e) => e.user_id !== 'ghost')).toBe(true);
  });

  it('demoteLineRank: groupSize <= DEMOTE_COUNT이면 0', () => {
    // groupSize=5, DEMOTE_COUNT=5 → 5-5+1=1 이지만 spec에서 groupSize<=DEMOTE면 0
    const entries: LeagueEntryLike[] = Array.from({ length: 5 }, (_, i) =>
      entry({ user_id: `u${i}`, xp: (5 - i) * 100 }),
    );
    const view = buildLeagueView(entries, 'u0');
    expect(view.demoteLineRank).toBe(0);
  });
});
