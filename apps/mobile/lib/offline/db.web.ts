// 오프라인 sqlite 는 네이티브 전용 — web 은 expo-sqlite 의 wa-sqlite(worker/wasm) 의존이
// 번들에서 깨지고, 웹 빌드는 온라인(AsyncStorage local) 가정이라 오프라인 캐시·큐가 불필요하다.
// Metro 가 web 플랫폼에서 db.ts 대신 이 파일을 resolve 한다(.web.ts 우선).
// 모든 함수는 no-op/빈 결과 — flushPendingQueue 는 readQueue()=[] 로 즉시 종료된다.
// expo-sqlite 는 import 하지 않는다(type 포함) — web 번들에서 wasm 을 끌어오지 않기 위함.
import type { SyncItem } from './queue';

export function getDb(): never {
  throw new Error('expo-sqlite 는 web 에서 미지원 (오프라인 캐시는 네이티브 전용)');
}

export async function cacheWords(_words: unknown[]): Promise<void> {
  /* web no-op */
}

export async function getCachedWords(): Promise<unknown[]> {
  return [];
}

export async function enqueue(_item: SyncItem): Promise<void> {
  /* web no-op */
}

export async function readQueue(): Promise<SyncItem[]> {
  return [];
}

export async function clearSynced(_ids: string[]): Promise<void> {
  /* web no-op */
}
