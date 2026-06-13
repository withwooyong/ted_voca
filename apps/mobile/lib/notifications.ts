/**
 * 로컬 알림 — 순수 결정 함수 + expo-notifications 어댑터
 * plan: docs/plans/p6-gamification.md §4
 *
 * - planNotifications: ReminderState → PlannedNotification[] 순수 결정 함수(§4 조건표)
 * - syncNotifications: 권한 확보 → 전체 취소 → 재스케줄 오케스트레이터
 * - createExpoScheduler: expo-notifications(SDK 56) 기반 기본 스케줄러 (구현부, 테스트 제외)
 */
import * as Notifications from 'expo-notifications';

export type NotificationKind = 'review_reminder' | 'streak_guard' | 'league_deadline';

export type ReminderState = {
  studiedToday: boolean;     // 오늘 세션 1+ 있었나
  studiedYesterday: boolean; // 어제 세션 1+ 있었나
  dueCount: number;          // 오늘 복습 큐 개수
  streak: number;
  inLeague: boolean;
  reminderHour: number;      // 복습 리마인더 시각, 기본 9
};

export type PlannedNotification = {
  kind: NotificationKind;
  title: string;             // "Ted"
  body: string;
  hour: number;
  minute: number;
  weekday?: number;          // 1=일 … 7=토 (expo CalendarTrigger 규약). 없으면 매일.
};

const TITLE = 'Ted';

/**
 * plan §4 조건표를 그대로 구현. 결정론적 순수 함수.
 *
 * 반환 순서: review_reminder → streak_guard → league_deadline
 *
 * 조건:
 * - review_reminder: studiedYesterday && dueCount > 0
 *     body: `오늘 복습 ${dueCount}개 남았어! 5분이면 충분해 💪`
 *     hour=reminderHour, minute=0
 * - streak_guard: !studiedToday && streak >= 3
 *     body: `streak ${streak}일 꺼지기 3시간 전! 한 문제라도 풀자 🔥`
 *     hour=21, minute=0
 * - league_deadline: inLeague
 *     body: `이번 주 리그 마감 임박! 순위 지킬 시간이야 🏆`
 *     weekday=1(일요일), hour=20, minute=0
 */
export function planNotifications(state: ReminderState): PlannedNotification[] {
  const planned: PlannedNotification[] = [];

  if (state.studiedYesterday && state.dueCount > 0) {
    planned.push({
      kind: 'review_reminder',
      title: TITLE,
      body: `오늘 복습 ${state.dueCount}개 남았어! 5분이면 충분해 💪`,
      hour: state.reminderHour,
      minute: 0,
    });
  }

  if (!state.studiedToday && state.streak >= 3) {
    planned.push({
      kind: 'streak_guard',
      title: TITLE,
      body: `streak ${state.streak}일 꺼지기 3시간 전! 한 문제라도 풀자 🔥`,
      hour: 21,
      minute: 0,
    });
  }

  if (state.inLeague) {
    planned.push({
      kind: 'league_deadline',
      title: TITLE,
      body: '이번 주 리그 마감 임박! 순위 지킬 시간이야 🏆',
      hour: 20,
      minute: 0,
      weekday: 1, // 일요일
    });
  }

  return planned;
}

export type NotificationScheduler = {
  requestPermission: () => Promise<boolean>;
  cancelAll: () => Promise<void>;
  schedule: (n: PlannedNotification) => Promise<void>;
};

/**
 * 권한 확보 → 기존 전체 취소 → planNotifications 결과 재스케줄.
 * 권한 거부 시 조용히 false 반환(스케줄 안 함 · cancelAll도 안 함).
 */
export async function syncNotifications(
  state: ReminderState,
  scheduler: NotificationScheduler,
): Promise<boolean> {
  const granted = await scheduler.requestPermission();
  if (!granted) return false;

  await scheduler.cancelAll();

  const planned = planNotifications(state);
  for (const n of planned) {
    await scheduler.schedule(n);
  }

  return true;
}

/**
 * 실제 expo-notifications(SDK 56) 기반 기본 스케줄러 (구현부, 테스트 제외).
 *
 * - requestPermission: getPermissionsAsync로 기존 권한 확인 후 미부여 시 requestPermissionsAsync.
 *   NotificationPermissionsStatus.granted (또는 iOS PROVISIONAL)로 판정.
 * - schedule: PlannedNotification → SDK56 trigger 변환.
 *     weekday 있으면 WEEKLY(weekday/hour/minute), 없으면 DAILY(hour/minute).
 * - cancelAll: cancelAllScheduledNotificationsAsync.
 */
export function createExpoScheduler(): NotificationScheduler {
  const isGranted = (status: Notifications.NotificationPermissionsStatus): boolean =>
    status.granted ||
    status.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

  return {
    requestPermission: async () => {
      const current = await Notifications.getPermissionsAsync();
      if (isGranted(current)) return true;
      const requested = await Notifications.requestPermissionsAsync();
      return isGranted(requested);
    },

    cancelAll: async () => {
      await Notifications.cancelAllScheduledNotificationsAsync();
    },

    schedule: async (n: PlannedNotification) => {
      const trigger: Notifications.NotificationTriggerInput =
        n.weekday !== undefined
          ? {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: n.weekday,
              hour: n.hour,
              minute: n.minute,
            }
          : {
              type: Notifications.SchedulableTriggerInputTypes.DAILY,
              hour: n.hour,
              minute: n.minute,
            };

      await Notifications.scheduleNotificationAsync({
        content: { title: n.title, body: n.body },
        trigger,
      });
    },
  };
}
