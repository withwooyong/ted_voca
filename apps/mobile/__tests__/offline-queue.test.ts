/**
 * 오프라인 sync 큐 순수 로직 계약 테스트 — plan: docs/plans/p6-gamification.md §3
 * spec: /tmp/ted_p6/spec.md §3 "오프라인 캐시+sync"
 * 네이티브 의존 없는 순수 함수만 대상. db.ts(expo-sqlite)는 Step1 구현 담당.
 */
import { dedupeQueue, orderForUpload, removeSynced, SyncItem } from '@/lib/offline/queue';
import { flushQueue } from '@/lib/offline/sync';

// ── fixture 팩토리 ─────────────────────────────────────────────────────────────

let _seq = 0;
function makeItem(overrides: Partial<SyncItem> = {}): SyncItem {
  _seq += 1;
  return {
    id: `item-${_seq}`,
    type: 'attempt',
    payload: { data: _seq },
    queued_at: new Date(2026, 0, 1, 0, _seq, 0).toISOString(), // 분 단위로 고유
    ...overrides,
  };
}

beforeEach(() => {
  _seq = 0;
});

// ── dedupeQueue ────────────────────────────────────────────────────────────────

describe('dedupeQueue', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(dedupeQueue([])).toEqual([]);
  });

  it('동일 id는 마지막 항목만 유지(last-write-wins)', () => {
    const first = makeItem({ id: 'dup', queued_at: '2026-01-01T00:01:00.000Z', payload: { v: 1 } });
    const second = makeItem({ id: 'dup', queued_at: '2026-01-01T00:02:00.000Z', payload: { v: 2 } });
    const third = makeItem({ id: 'dup', queued_at: '2026-01-01T00:03:00.000Z', payload: { v: 3 } });

    const result = dedupeQueue([first, second, third]);

    expect(result).toHaveLength(1);
    expect(result[0].payload).toEqual({ v: 3 });
  });

  it('서로 다른 id는 모두 유지', () => {
    const a = makeItem({ id: 'a' });
    const b = makeItem({ id: 'b' });
    const c = makeItem({ id: 'c' });

    const result = dedupeQueue([a, b, c]);

    expect(result).toHaveLength(3);
    expect(result.map((i) => i.id)).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });

  it('결과는 queued_at asc 정렬', () => {
    const early = makeItem({ id: 'x', queued_at: '2026-01-01T00:01:00.000Z' });
    const late = makeItem({ id: 'y', queued_at: '2026-01-01T00:03:00.000Z' });
    const mid = makeItem({ id: 'z', queued_at: '2026-01-01T00:02:00.000Z' });

    const result = dedupeQueue([late, early, mid]);

    expect(result.map((i) => i.id)).toEqual(['x', 'z', 'y']);
  });

  it('dedupe 후 queued_at asc 정렬(혼합)', () => {
    const a1 = makeItem({ id: 'a', queued_at: '2026-01-01T00:05:00.000Z', payload: { v: 'old' } });
    const b = makeItem({ id: 'b', queued_at: '2026-01-01T00:02:00.000Z' });
    const a2 = makeItem({ id: 'a', queued_at: '2026-01-01T00:10:00.000Z', payload: { v: 'new' } });

    const result = dedupeQueue([a1, b, a2]);

    // 'a' 중복 제거(마지막 a2 유지), 정렬: b(02) → a2(10)
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('b');
    expect(result[1].id).toBe('a');
    expect(result[1].payload).toEqual({ v: 'new' });
  });
});

// ── orderForUpload ─────────────────────────────────────────────────────────────

describe('orderForUpload', () => {
  it('빈 배열 → 빈 배열', () => {
    expect(orderForUpload([])).toEqual([]);
  });

  it('queued_at asc 정렬', () => {
    const a = makeItem({ id: 'a', queued_at: '2026-01-01T00:03:00.000Z' });
    const b = makeItem({ id: 'b', queued_at: '2026-01-01T00:01:00.000Z' });
    const c = makeItem({ id: 'c', queued_at: '2026-01-01T00:02:00.000Z' });

    const result = orderForUpload([a, b, c]);

    expect(result.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('동시각이면 입력 순서 유지(안정 정렬)', () => {
    const sameTime = '2026-01-01T00:05:00.000Z';
    const first = makeItem({ id: 'first', queued_at: sameTime });
    const second = makeItem({ id: 'second', queued_at: sameTime });
    const third = makeItem({ id: 'third', queued_at: sameTime });

    const result = orderForUpload([first, second, third]);

    // 안정 정렬: 동시각이면 입력 순서 그대로
    expect(result.map((i) => i.id)).toEqual(['first', 'second', 'third']);
  });

  it('동시각 항목이 섞인 경우 안정 정렬', () => {
    const sameTime = '2026-01-01T00:05:00.000Z';
    const early = makeItem({ id: 'early', queued_at: '2026-01-01T00:01:00.000Z' });
    const same1 = makeItem({ id: 'same1', queued_at: sameTime });
    const same2 = makeItem({ id: 'same2', queued_at: sameTime });
    const late = makeItem({ id: 'late', queued_at: '2026-01-01T00:10:00.000Z' });

    const result = orderForUpload([same2, early, late, same1]);

    // early 먼저, 그 다음 same2/same1(입력 순서 유지), 마지막 late
    expect(result[0].id).toBe('early');
    expect(result[3].id).toBe('late');
    expect(result[1].id).toBe('same2'); // 입력에서 same2가 same1보다 앞에 있었음
    expect(result[2].id).toBe('same1');
  });

  it('원본 배열을 변경하지 않는다', () => {
    const items = [
      makeItem({ id: 'a', queued_at: '2026-01-01T00:03:00.000Z' }),
      makeItem({ id: 'b', queued_at: '2026-01-01T00:01:00.000Z' }),
    ];
    const originalIds = items.map((i) => i.id);

    orderForUpload(items);

    expect(items.map((i) => i.id)).toEqual(originalIds);
  });
});

// ── removeSynced ───────────────────────────────────────────────────────────────

describe('removeSynced', () => {
  it('빈 ids → 원본 그대로 반환', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];

    const result = removeSynced(items, []);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('빈 큐 + ids → 빈 배열', () => {
    expect(removeSynced([], ['a', 'b'])).toEqual([]);
  });

  it('모든 id 제거', () => {
    const a = makeItem({ id: 'a' });
    const b = makeItem({ id: 'b' });

    const result = removeSynced([a, b], ['a', 'b']);

    expect(result).toEqual([]);
  });

  it('부분 제거 — 성공한 id만 제거, 나머지 유지', () => {
    const a = makeItem({ id: 'a' });
    const b = makeItem({ id: 'b' });
    const c = makeItem({ id: 'c' });

    const result = removeSynced([a, b, c], ['b']);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('큐에 없는 id를 syncedIds에 포함해도 에러 없이 동작', () => {
    const a = makeItem({ id: 'a' });

    const result = removeSynced([a], ['nonexistent', 'a']);

    expect(result).toEqual([]);
  });

  it('순서를 유지한다', () => {
    const items = ['x', 'y', 'z', 'w'].map((id) => makeItem({ id }));

    const result = removeSynced(items, ['y', 'w']);

    expect(result.map((i) => i.id)).toEqual(['x', 'z']);
  });
});

// ── flushQueue ─────────────────────────────────────────────────────────────────

describe('flushQueue', () => {
  it('빈 큐 → [], uploader 0회', async () => {
    const uploader = jest.fn().mockResolvedValue(undefined);

    const result = await flushQueue([], uploader);

    expect(result).toEqual([]);
    expect(uploader).toHaveBeenCalledTimes(0);
  });

  it('전부 성공 → 전체 id, orderForUpload 순서대로 호출', async () => {
    const a = makeItem({ id: 'a', queued_at: '2026-01-01T00:03:00.000Z' });
    const b = makeItem({ id: 'b', queued_at: '2026-01-01T00:01:00.000Z' });
    const c = makeItem({ id: 'c', queued_at: '2026-01-01T00:02:00.000Z' });
    const uploader = jest.fn().mockResolvedValue(undefined);

    // 입력 순서는 a,b,c지만 queued_at asc는 b,c,a
    const result = await flushQueue([a, b, c], uploader);

    expect(result).toEqual(['b', 'c', 'a']);
    expect(uploader).toHaveBeenCalledTimes(3);
    // 호출 인자·순서 검증
    expect(uploader.mock.calls.map((call) => call[0].id)).toEqual(['b', 'c', 'a']);
    expect(uploader).toHaveBeenNthCalledWith(1, b);
    expect(uploader).toHaveBeenNthCalledWith(2, c);
    expect(uploader).toHaveBeenNthCalledWith(3, a);
  });

  it('중간 실패 → 그 전까지 id만, 실패 이후 항목은 호출 안 됨', async () => {
    // 업로드 순서(queued_at asc): first(01) → boom(02) → after(03)
    const first = makeItem({ id: 'first', queued_at: '2026-01-01T00:01:00.000Z' });
    const boom = makeItem({ id: 'boom', queued_at: '2026-01-01T00:02:00.000Z' });
    const after = makeItem({ id: 'after', queued_at: '2026-01-01T00:03:00.000Z' });
    const uploader = jest.fn(async (item: SyncItem) => {
      if (item.id === 'boom') throw new Error('network');
    });

    const result = await flushQueue([first, boom, after], uploader);

    // first만 성공, boom에서 중단, after는 호출 안 함
    expect(result).toEqual(['first']);
    expect(uploader).toHaveBeenCalledTimes(2);
    expect(uploader.mock.calls.map((call) => call[0].id)).toEqual(['first', 'boom']);
    expect(uploader.mock.calls.some((call) => call[0].id === 'after')).toBe(false);
  });
});
