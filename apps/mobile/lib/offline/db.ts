// 오프라인 sqlite 캐시 + sync 큐 어댑터 — plan: docs/plans/p6-gamification.md §3
// expo-sqlite SDK 56 (openDatabaseSync 동기 API). 네이티브 의존 → 단위테스트 제외, 타입만 검증.
// 지연 init: getDb() 첫 호출 시 CREATE TABLE IF NOT EXISTS.
// payload는 JSON.stringify로 TEXT 저장, 읽을 때 JSON.parse.

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { SyncItem } from './queue';

const DB_NAME = 'ted-voca.db';

let _db: SQLiteDatabase | null = null;

/** 지연 init + CREATE TABLE IF NOT EXISTS. 첫 호출 시 스키마 생성. */
export function getDb(): SQLiteDatabase {
  if (_db) return _db;

  const db = SQLite.openDatabaseSync(DB_NAME);
  db.execSync(`
    CREATE TABLE IF NOT EXISTS cached_words (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      queued_at TEXT NOT NULL
    );
  `);

  _db = db;
  return db;
}

type CachedWord = { id?: string | number; [key: string]: unknown };

/** 단어 목록을 캐시. 기존 캐시를 비우고 새로 저장(전체 교체). */
export async function cacheWords(words: unknown[]): Promise<void> {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.execAsync('DELETE FROM cached_words');
    for (let i = 0; i < words.length; i += 1) {
      const word = words[i] as CachedWord;
      // id가 없으면 인덱스를 키로 사용(멱등 교체용)
      const id = String(word?.id ?? i);
      await db.runAsync(
        'INSERT OR REPLACE INTO cached_words (id, json) VALUES (?, ?)',
        id,
        JSON.stringify(word),
      );
    }
  });
}

/** 캐시된 단어 목록을 반환. */
export async function getCachedWords(): Promise<unknown[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{ json: string }>(
    'SELECT json FROM cached_words',
  );
  return rows.map((row) => JSON.parse(row.json) as unknown);
}

/** sync 큐에 항목 추가. INSERT OR REPLACE로 id 멱등(last-write-wins). */
export async function enqueue(item: SyncItem): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_queue (id, type, payload, queued_at) VALUES (?, ?, ?, ?)',
    item.id,
    item.type,
    JSON.stringify(item.payload),
    item.queued_at,
  );
}

/** sync 큐 전체를 queued_at asc로 반환. payload는 parse. */
export async function readQueue(): Promise<SyncItem[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    id: string;
    type: string;
    payload: string;
    queued_at: string;
  }>('SELECT id, type, payload, queued_at FROM sync_queue ORDER BY queued_at ASC');

  return rows.map((row) => ({
    id: row.id,
    type: row.type as SyncItem['type'],
    payload: JSON.parse(row.payload) as unknown,
    queued_at: row.queued_at,
  }));
}

/** 업로드 성공한 id들을 큐에서 삭제. */
export async function clearSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(', ');
  await db.runAsync(`DELETE FROM sync_queue WHERE id IN (${placeholders})`, ...ids);
}
