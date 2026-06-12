// Streak — 하루 1세션 이상이면 유지. plan: docs/plans/p1-p2-vocab-srs.md §1.2.9

/** date-only 비교 (로컬 'YYYY-MM-DD' 문자열) */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** lastStudyDate('YYYY-MM-DD')와 today 사이의 일수 차 (today - last) */
function dayDiff(lastStudyDate: string, today: Date): number {
  const [y, m, d] = lastStudyDate.split('-').map(Number);
  const last = new Date(y, m - 1, d);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((todayMidnight.getTime() - last.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * 세션 완료 시 streak 계산.
 * lastStudyDate: 'YYYY-MM-DD' | null — 직전 학습일
 * - 오늘 이미 학습 → 유지
 * - 어제 학습 → +1
 * - 그 외(첫 학습/이틀 이상 공백) → 1
 */
export function nextStreak(lastStudyDate: string | null, prevStreak: number, today: Date): number {
  if (lastStudyDate === null) return 1;
  const diff = dayDiff(lastStudyDate, today);
  if (diff === 0) return prevStreak; // 오늘 이미 학습 → 유지
  if (diff === 1) return prevStreak + 1; // 어제 학습 → +1
  return 1; // 이틀 이상 공백 → 리셋
}

/** 홈 표시용: 마지막 학습이 어제 이전이면 streak은 끊긴 것으로 보여준다 (오늘 학습 전 0 표시 아님 — 어제까지 유지면 그대로) */
export function displayStreak(lastStudyDate: string | null, streak: number, today: Date): number {
  if (lastStudyDate === null) return 0;
  const diff = dayDiff(lastStudyDate, today);
  // 오늘/어제 학습이면 유지, 이틀 이상 공백이면 끊김(0)
  return diff <= 1 ? streak : 0;
}
