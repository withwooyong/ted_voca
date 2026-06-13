/**
 * 로컬 알림 단위 테스트 — plan p6 §4
 * 대상: apps/mobile/lib/notifications.ts (스텁) — planNotifications/syncNotifications 모두 red여야 함.
 *
 * expo-notifications, expo-device는 jest.mock으로 무력화.
 * syncNotifications는 mock NotificationScheduler(jest.fn())로 검증.
 */

import {
  planNotifications,
  syncNotifications,
  type ReminderState,
  type PlannedNotification,
  type NotificationScheduler,
} from '@/lib/notifications';

// expo-notifications/expo-device 무력화 (createExpoScheduler import 평가 시 안전하도록).
// jest.mock 은 babel-jest-hoist 가 import 위로 끌어올리므로 선언 위치는 무관.
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  AndroidNotificationPriority: {},
  IosAlertStyle: {},
}));

jest.mock('expo-device', () => ({
  isDevice: false,
  osName: 'iOS',
}));

// ────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────

function makeState(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    studiedToday: false,
    studiedYesterday: false,
    dueCount: 0,
    streak: 0,
    inLeague: false,
    reminderHour: 9,
    ...overrides,
  };
}

function makeScheduler(): jest.Mocked<NotificationScheduler> {
  return {
    requestPermission: jest.fn(),
    cancelAll: jest.fn(),
    schedule: jest.fn(),
  };
}

// ────────────────────────────────────────────────────────────
// 1. planNotifications — 개별 조건
// ────────────────────────────────────────────────────────────

describe('planNotifications — review_reminder', () => {
  it('studiedYesterday=true, dueCount>0 → review_reminder 포함', () => {
    const result = planNotifications(makeState({ studiedYesterday: true, dueCount: 5 }));
    const n = result.find((r) => r.kind === 'review_reminder');
    expect(n).toBeDefined();
    expect(n?.title).toBe('Ted');
    expect(n?.body).toBe('오늘 복습 5개 남았어! 5분이면 충분해 💪');
    expect(n?.hour).toBe(9);
    expect(n?.minute).toBe(0);
    expect(n?.weekday).toBeUndefined();
  });

  it('studiedYesterday=false → review_reminder 제외', () => {
    const result = planNotifications(makeState({ studiedYesterday: false, dueCount: 5 }));
    expect(result.find((r) => r.kind === 'review_reminder')).toBeUndefined();
  });

  it('dueCount=0 → review_reminder 제외', () => {
    const result = planNotifications(makeState({ studiedYesterday: true, dueCount: 0 }));
    expect(result.find((r) => r.kind === 'review_reminder')).toBeUndefined();
  });

  it('studiedYesterday=false, dueCount=0 → review_reminder 제외', () => {
    const result = planNotifications(makeState({ studiedYesterday: false, dueCount: 0 }));
    expect(result.find((r) => r.kind === 'review_reminder')).toBeUndefined();
  });

  it('reminderHour 커스텀 적용', () => {
    const result = planNotifications(
      makeState({ studiedYesterday: true, dueCount: 3, reminderHour: 14 }),
    );
    const n = result.find((r) => r.kind === 'review_reminder');
    expect(n?.hour).toBe(14);
  });

  it('body에 dueCount 값 반영', () => {
    const result = planNotifications(makeState({ studiedYesterday: true, dueCount: 12 }));
    const n = result.find((r) => r.kind === 'review_reminder');
    expect(n?.body).toBe('오늘 복습 12개 남았어! 5분이면 충분해 💪');
  });
});

describe('planNotifications — streak_guard', () => {
  it('studiedToday=false, streak>=3 → streak_guard 포함', () => {
    const result = planNotifications(makeState({ studiedToday: false, streak: 3 }));
    const n = result.find((r) => r.kind === 'streak_guard');
    expect(n).toBeDefined();
    expect(n?.title).toBe('Ted');
    expect(n?.body).toBe('streak 3일 꺼지기 3시간 전! 한 문제라도 풀자 🔥');
    expect(n?.hour).toBe(21);
    expect(n?.minute).toBe(0);
    expect(n?.weekday).toBeUndefined();
  });

  it('studiedToday=true → streak_guard 제외 (오늘 학습 완료)', () => {
    const result = planNotifications(makeState({ studiedToday: true, streak: 10 }));
    expect(result.find((r) => r.kind === 'streak_guard')).toBeUndefined();
  });

  it('streak=2 (< 3) → streak_guard 제외', () => {
    const result = planNotifications(makeState({ studiedToday: false, streak: 2 }));
    expect(result.find((r) => r.kind === 'streak_guard')).toBeUndefined();
  });

  it('streak=0 → streak_guard 제외', () => {
    const result = planNotifications(makeState({ studiedToday: false, streak: 0 }));
    expect(result.find((r) => r.kind === 'streak_guard')).toBeUndefined();
  });

  it('streak=5, body에 streak 값 반영', () => {
    const result = planNotifications(makeState({ studiedToday: false, streak: 5 }));
    const n = result.find((r) => r.kind === 'streak_guard');
    expect(n?.body).toBe('streak 5일 꺼지기 3시간 전! 한 문제라도 풀자 🔥');
  });
});

describe('planNotifications — league_deadline', () => {
  it('inLeague=true → league_deadline 포함', () => {
    const result = planNotifications(makeState({ inLeague: true }));
    const n = result.find((r) => r.kind === 'league_deadline');
    expect(n).toBeDefined();
    expect(n?.title).toBe('Ted');
    expect(n?.body).toBe('이번 주 리그 마감 임박! 순위 지킬 시간이야 🏆');
    expect(n?.hour).toBe(20);
    expect(n?.minute).toBe(0);
    expect(n?.weekday).toBe(1); // 일요일
  });

  it('inLeague=false → league_deadline 제외', () => {
    const result = planNotifications(makeState({ inLeague: false }));
    expect(result.find((r) => r.kind === 'league_deadline')).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 2. planNotifications — 조건 없음
// ────────────────────────────────────────────────────────────

describe('planNotifications — 빈 조건', () => {
  it('모든 조건 off → 빈 배열', () => {
    const result = planNotifications(makeState());
    expect(result).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────
// 3. planNotifications — 복합(여러 알림 동시)
// ────────────────────────────────────────────────────────────

describe('planNotifications — 복합 조건', () => {
  it('review_reminder + streak_guard 동시', () => {
    const result = planNotifications(
      makeState({ studiedYesterday: true, dueCount: 7, studiedToday: false, streak: 4 }),
    );
    expect(result.find((r) => r.kind === 'review_reminder')).toBeDefined();
    expect(result.find((r) => r.kind === 'streak_guard')).toBeDefined();
    expect(result.find((r) => r.kind === 'league_deadline')).toBeUndefined();
  });

  it('3가지 알림 모두 동시', () => {
    const result = planNotifications(
      makeState({
        studiedYesterday: true,
        dueCount: 3,
        studiedToday: false,
        streak: 5,
        inLeague: true,
      }),
    );
    expect(result.length).toBe(3);
    expect(result.find((r) => r.kind === 'review_reminder')).toBeDefined();
    expect(result.find((r) => r.kind === 'streak_guard')).toBeDefined();
    expect(result.find((r) => r.kind === 'league_deadline')).toBeDefined();
  });

  it('반환 순서: review_reminder → streak_guard → league_deadline', () => {
    const result = planNotifications(
      makeState({
        studiedYesterday: true,
        dueCount: 2,
        studiedToday: false,
        streak: 3,
        inLeague: true,
      }),
    );
    expect(result[0].kind).toBe('review_reminder');
    expect(result[1].kind).toBe('streak_guard');
    expect(result[2].kind).toBe('league_deadline');
  });

  it('review_reminder + league_deadline (streak 조건 불충족)', () => {
    const result = planNotifications(
      makeState({ studiedYesterday: true, dueCount: 1, streak: 1, inLeague: true }),
    );
    expect(result.find((r) => r.kind === 'review_reminder')).toBeDefined();
    expect(result.find((r) => r.kind === 'league_deadline')).toBeDefined();
    expect(result.find((r) => r.kind === 'streak_guard')).toBeUndefined();
  });

  it('streak_guard + league_deadline (review 조건 불충족)', () => {
    const result = planNotifications(
      makeState({ studiedToday: false, streak: 7, inLeague: true }),
    );
    expect(result.find((r) => r.kind === 'streak_guard')).toBeDefined();
    expect(result.find((r) => r.kind === 'league_deadline')).toBeDefined();
    expect(result.find((r) => r.kind === 'review_reminder')).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// 4. syncNotifications — mock scheduler
// ────────────────────────────────────────────────────────────

describe('syncNotifications — 권한 허용', () => {
  it('권한 true → cancelAll 1회 호출', async () => {
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(true);
    scheduler.cancelAll.mockResolvedValue(undefined);
    scheduler.schedule.mockResolvedValue(undefined);

    const state = makeState({ studiedYesterday: true, dueCount: 5 });
    await syncNotifications(state, scheduler);

    expect(scheduler.cancelAll).toHaveBeenCalledTimes(1);
  });

  it('권한 true → schedule이 planNotifications 개수만큼 호출됨', async () => {
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(true);
    scheduler.cancelAll.mockResolvedValue(undefined);
    scheduler.schedule.mockResolvedValue(undefined);

    // planNotifications → [review_reminder, streak_guard] = 2개
    const state = makeState({
      studiedYesterday: true,
      dueCount: 3,
      studiedToday: false,
      streak: 4,
    });
    await syncNotifications(state, scheduler);

    const planned = planNotifications(state);
    // 스텁 상태: planNotifications도 throw → 이 줄은 red. 함수 계약 검증용.
    expect(scheduler.schedule).toHaveBeenCalledTimes(planned.length);
  });

  it('권한 true → true 반환', async () => {
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(true);
    scheduler.cancelAll.mockResolvedValue(undefined);
    scheduler.schedule.mockResolvedValue(undefined);

    const result = await syncNotifications(makeState({ inLeague: true }), scheduler);
    expect(result).toBe(true);
  });

  it('schedule에 PlannedNotification 객체 전달됨', async () => {
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(true);
    scheduler.cancelAll.mockResolvedValue(undefined);
    scheduler.schedule.mockResolvedValue(undefined);

    const state = makeState({ inLeague: true });
    await syncNotifications(state, scheduler);

    const calls = scheduler.schedule.mock.calls;
    // 각 call의 첫 인자는 PlannedNotification 형태
    for (const [arg] of calls) {
      const n = arg as PlannedNotification;
      expect(typeof n.kind).toBe('string');
      expect(n.title).toBe('Ted');
      expect(typeof n.body).toBe('string');
      expect(typeof n.hour).toBe('number');
      expect(typeof n.minute).toBe('number');
    }
  });

  it('cancelAll은 schedule보다 먼저 호출됨(순서 보장)', async () => {
    const callOrder: string[] = [];
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(true);
    scheduler.cancelAll.mockImplementation(async () => { callOrder.push('cancelAll'); });
    scheduler.schedule.mockImplementation(async () => { callOrder.push('schedule'); });

    const state = makeState({ inLeague: true });
    await syncNotifications(state, scheduler);

    const cancelIdx = callOrder.indexOf('cancelAll');
    const scheduleIdx = callOrder.indexOf('schedule');
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(scheduleIdx).toBeGreaterThan(cancelIdx);
  });
});

describe('syncNotifications — 권한 거부', () => {
  it('권한 false → schedule 0회 호출', async () => {
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(false);

    const state = makeState({ studiedYesterday: true, dueCount: 5, inLeague: true, streak: 5 });
    await syncNotifications(state, scheduler);

    expect(scheduler.schedule).not.toHaveBeenCalled();
  });

  it('권한 false → false 반환', async () => {
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(false);

    const result = await syncNotifications(makeState({ inLeague: true }), scheduler);
    expect(result).toBe(false);
  });

  it('권한 false → cancelAll 미호출(스케줄 안 함)', async () => {
    const scheduler = makeScheduler();
    scheduler.requestPermission.mockResolvedValue(false);

    await syncNotifications(makeState(), scheduler);
    expect(scheduler.cancelAll).not.toHaveBeenCalled();
  });
});
