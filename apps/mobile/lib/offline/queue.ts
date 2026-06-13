// 오프라인 sync 큐 순수 로직 — plan: docs/plans/p6-gamification.md §3
// expo-sqlite 어댑터(db.ts)와 분리된 순수 함수. 네이티브 의존 없음.

export type SyncItem = {
  id: string;          // 클라이언트 생성 식별자(멱등 키)
  type: 'attempt' | 'session';
  payload: unknown;
  queued_at: string;   // ISO
};

/**
 * 같은 id는 마지막 것만 유지(last-write-wins),
 * 결과는 queued_at asc 안정 정렬 후 반환.
 */
export function dedupeQueue(items: SyncItem[]): SyncItem[] {
  // id별 마지막 항목만 유지 (Map은 삽입 순서 보존; 같은 키 재할당 시 마지막 값 유지)
  const byId = new Map<string, SyncItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return orderForUpload([...byId.values()]);
}

/**
 * 업로드 순서: queued_at asc, 동시각이면 입력 순서 유지(안정 정렬).
 */
export function orderForUpload(items: SyncItem[]): SyncItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.queued_at < b.item.queued_at) return -1;
      if (a.item.queued_at > b.item.queued_at) return 1;
      return a.index - b.index; // 동시각이면 입력 순서 유지(안정)
    })
    .map(({ item }) => item);
}

/**
 * 업로드 성공한 id들을 큐에서 제거.
 */
export function removeSynced(items: SyncItem[], syncedIds: string[]): SyncItem[] {
  const synced = new Set(syncedIds);
  return items.filter((item) => !synced.has(item.id));
}
