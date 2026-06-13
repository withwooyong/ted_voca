// 오프라인 sync 큐 비우기 순수 로직 — plan: docs/plans/p6-gamification.md §3
// spec: /tmp/ted_p6/spec.md §3 "오프라인 캐시+sync"
// I/O는 uploader에 위임. orderForUpload 순으로 업로드, 첫 실패에서 중단.

import { getSupabase } from '@/lib/supabase';
import { recordAttemptRaw } from '@/lib/data/remote';
import type { AttemptInput } from '@/lib/data/types';

import { clearSynced, readQueue } from './db';
import { orderForUpload, type SyncItem } from './queue';

export type SyncUploader = (item: SyncItem) => Promise<void>;

/**
 * 큐 항목을 orderForUpload 순으로 uploader에 전달.
 * 성공한 id를 누적해 반환(호출부가 clearSynced).
 * 한 항목 실패(reject) 시 그 항목부터 중단(이후 호출 안 함) — 순서 보존·다음 기회 재시도.
 * 그때까지 성공한 id만 반환. 빈 큐 → [].
 */
export async function flushQueue(items: SyncItem[], uploader: SyncUploader): Promise<string[]> {
  const ordered = orderForUpload(items);
  const synced: string[] = [];
  for (const item of ordered) {
    try {
      await uploader(item);
    } catch {
      // 이 항목부터 중단 — 다음 기회에 재시도
      break;
    }
    synced.push(item.id);
  }
  return synced;
}

/**
 * 앱 부트/홈 포커스 시 호출되는 DB 연동 flush 래퍼 (인자 없음, best-effort).
 * Supabase 미설정(local 모드)이면 즉시 종료 — 오프라인 큐는 remote 경로에서만 적재된다.
 * 큐를 읽어 폴백 없는 recordAttemptRaw로 재업로드하고, 성공한 항목만 큐에서 제거한다.
 * (recordAttempt가 아닌 *Raw*를 쓰는 이유: 폴백판은 실패 시 같은 id로 재적재해 clearSynced와 충돌하므로.)
 */
export async function flushPendingQueue(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return; // local 모드 — 큐 미사용
  const items = await readQueue();
  if (items.length === 0) return;
  const synced = await flushQueue(items, async (item) => {
    // 미지원 타입(예: 'session')은 throw → flushQueue가 큐에 보존한다.
    // (그냥 통과시키면 성공으로 간주돼 clearSynced가 무음 삭제 → 데이터 소실)
    if (item.type !== 'attempt') {
      throw new Error(`unsupported sync item type: ${item.type}`);
    }
    const raw = item.payload as AttemptInput;
    // payload는 JSON 직렬화로 now가 문자열이 됨 → Date 복원. now 누락(손상 payload)이면 보존.
    if (raw?.now == null) {
      throw new Error('sync item payload missing now');
    }
    await recordAttemptRaw(sb, { ...raw, now: new Date(raw.now as unknown as string) });
  });
  if (synced.length > 0) await clearSynced(synced);
}
