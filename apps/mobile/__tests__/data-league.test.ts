/**
 * 리그 데이터 레이어(local mock 모드) 계약 테스트 — plan p6 §4
 * data-speaking.test.ts 패턴 준용. 실제 동작 검증.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// eslint-disable-next-line import/first -- jest.mock 호이스팅
import * as data from '@/lib/data';

const NOW = new Date('2026-06-13T12:00:00.000Z'); // 토요일 UTC (주 시작 2026-06-08)
const NEXT_MON = new Date('2026-06-15T00:00:00.000Z'); // 다음 주 월요일 UTC

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ────────────────────────────────────────────────────────────
// 1. addLeagueXp
// ────────────────────────────────────────────────────────────

describe('addLeagueXp — XP 적립', () => {
  it('addLeagueXp 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof data.addLeagueXp).toBe('function');
  });

  it('적립 누적: 100xp + 200xp = 300xp', async () => {
    await data.addLeagueXp(100, NOW);
    await data.addLeagueXp(200, NOW);
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(300);
  });

  it('상한 clamp: 회당 500 초과분 무시 (501 → 500)', async () => {
    await data.addLeagueXp(501, NOW);
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(500);
  });

  it('상한은 회당 적용: 500 + 500 = 1000 누적 가능', async () => {
    await data.addLeagueXp(1000, NOW); // clamp → 500
    await data.addLeagueXp(1000, NOW); // clamp → 500
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(1000);
  });

  it('음수 delta → 0으로 처리 (xp 감소 없음)', async () => {
    await data.addLeagueXp(100, NOW);
    await data.addLeagueXp(-50, NOW);
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(100);
  });

  it('주 바뀌면 xp 리셋 후 적립 (tier 유지)', async () => {
    await data.addLeagueXp(300, NOW); // 2026-06-08 주
    await data.addLeagueXp(100, NEXT_MON); // 2026-06-15 주 → 리셋 후 100
    const summary = await data.getLeagueSummary(NEXT_MON);
    expect(summary.myXp).toBe(100);
    expect(summary.tier).toBe('bronze');
  });
});

// ────────────────────────────────────────────────────────────
// 2. getLeagueSummary
// ────────────────────────────────────────────────────────────

describe('getLeagueSummary — 리그 요약 조회', () => {
  it('getLeagueSummary 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof data.getLeagueSummary).toBe('function');
  });

  it('본인 rank=1, board 1행 (단일 사용자)', async () => {
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myRank).toBe(1);
    expect(summary.board).toHaveLength(1);
    expect(summary.board[0].rank).toBe(1);
  });

  it('daysLeft: 토요일(NOW) → 2일 남음', async () => {
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.daysLeft).toBe(2);
  });

  it('board 1행 구조: {user_id:me, display_name:나, xp, tier, rank:1}', async () => {
    await data.addLeagueXp(120, NOW);
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.board[0]).toEqual({
      user_id: 'me',
      display_name: '나',
      xp: 120,
      tier: 'bronze',
      rank: 1,
    });
    expect(summary.weekStart).toBe('2026-06-08');
  });

  it('적립 후 xp(myXp·board) 반영', async () => {
    await data.addLeagueXp(75, NOW);
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(75);
    expect(summary.board[0].xp).toBe(75);
  });

  it('새 주 시작(NEXT_MON) → 직전 주 적립분은 0 취급', async () => {
    await data.addLeagueXp(300, NOW); // 이전 주
    const summary = await data.getLeagueSummary(NEXT_MON);
    expect(summary.myXp).toBe(0);
    expect(summary.board[0].xp).toBe(0);
    expect(summary.weekStart).toBe('2026-06-15');
  });
});

// ────────────────────────────────────────────────────────────
// 3. savePushToken
// ────────────────────────────────────────────────────────────

describe('savePushToken — 푸시 토큰 저장', () => {
  it('savePushToken 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof data.savePushToken).toBe('function');
  });

  it('토큰 저장: tv_push_token 키에 저장됨', async () => {
    const input = { expoToken: 'ExponentPushToken[test-token]', platform: 'ios' };
    await data.savePushToken(input);
    const raw = await AsyncStorage.getItem('tv_push_token');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(input);
  });
});

// ────────────────────────────────────────────────────────────
// 4. completeSession 연동 — best-effort (try/catch)
// ────────────────────────────────────────────────────────────

describe('completeSession → league xp 연동 (best-effort)', () => {
  it('completeSession 함수가 lib/data에 export 되어 있음', () => {
    expect(typeof data.completeSession).toBe('function');
  });

  it('completeSession 후 getLeagueSummary의 xp가 xpEarned만큼 증가', async () => {
    const result = await data.completeSession({
      module: 'vocab',
      itemsCompleted: 10,
      itemsCorrect: 8,
      xpEarned: 50,
      now: NOW,
    });

    expect(result).toMatchObject({
      xp: expect.any(Number),
      level: expect.any(Number),
      streak: expect.any(Number),
    });
    expect(result.xp).toBeGreaterThanOrEqual(50);

    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(50);
  });

  it('xpEarned=0이면 league xp 적립 안 함 (completeSession 성공)', async () => {
    const result = await data.completeSession({
      module: 'vocab',
      itemsCompleted: 5,
      itemsCorrect: 3,
      xpEarned: 0,
      now: NOW,
    });

    expect(result).toMatchObject({
      xp: expect.any(Number),
      level: expect.any(Number),
    });

    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(0);
  });

  it('여러 세션 누적: 30 + 40 = 70 league xp', async () => {
    await data.completeSession({
      module: 'vocab',
      itemsCompleted: 5,
      itemsCorrect: 5,
      xpEarned: 30,
      now: NOW,
    });
    await data.completeSession({
      module: 'grammar',
      itemsCompleted: 5,
      itemsCorrect: 4,
      xpEarned: 40,
      now: NOW,
    });
    const summary = await data.getLeagueSummary(NOW);
    expect(summary.myXp).toBe(70);
  });
});
