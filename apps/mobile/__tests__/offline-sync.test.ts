/**
 * 오프라인 sync 통합 래퍼 테스트 — plan p6 §3
 * 대상: lib/offline/sync.ts flushPendingQueue (getSupabase + db 큐 + remote.recordAttemptRaw 연동)
 *
 * getSupabase / offline/db / data/remote 를 mock 해 분기·연동을 검증.
 */
import * as remote from '@/lib/data/remote';
import * as db from '@/lib/offline/db';
import { flushPendingQueue } from '@/lib/offline/sync';
import { getSupabase } from '@/lib/supabase';

jest.mock('@/lib/supabase');
jest.mock('@/lib/offline/db');
jest.mock('@/lib/data/remote');

const mockGetSupabase = getSupabase as jest.Mock;
const mockReadQueue = db.readQueue as jest.Mock;
const mockClearSynced = db.clearSynced as jest.Mock;
const mockRecordRaw = remote.recordAttemptRaw as jest.Mock;

function attemptItem(id: string, nowIso = '2026-06-13T00:00:00.000Z') {
  return {
    id,
    type: 'attempt' as const,
    payload: { wordId: 'w1', quizType: 'blank', correct: true, now: nowIso },
    queued_at: nowIso,
  };
}

describe('flushPendingQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordRaw.mockResolvedValue(undefined);
    mockClearSynced.mockResolvedValue(undefined);
  });

  it('local 모드(getSupabase null) → 큐 미접근, 업로드 없음', async () => {
    mockGetSupabase.mockReturnValue(null);
    await flushPendingQueue();
    expect(mockReadQueue).not.toHaveBeenCalled();
    expect(mockRecordRaw).not.toHaveBeenCalled();
    expect(mockClearSynced).not.toHaveBeenCalled();
  });

  it('빈 큐 → recordAttemptRaw·clearSynced 미호출', async () => {
    mockGetSupabase.mockReturnValue({});
    mockReadQueue.mockResolvedValue([]);
    await flushPendingQueue();
    expect(mockRecordRaw).not.toHaveBeenCalled();
    expect(mockClearSynced).not.toHaveBeenCalled();
  });

  it('attempt 업로드 성공 → recordAttemptRaw 호출(now Date 복원)·성공 id clearSynced', async () => {
    mockGetSupabase.mockReturnValue({});
    mockReadQueue.mockResolvedValue([attemptItem('a1'), attemptItem('a2', '2026-06-13T01:00:00.000Z')]);
    await flushPendingQueue();
    expect(mockRecordRaw).toHaveBeenCalledTimes(2);
    // payload.now 가 문자열 → Date 로 복원되어 전달됐는지
    const passed = mockRecordRaw.mock.calls[0][1];
    expect(passed.now).toBeInstanceOf(Date);
    expect(mockClearSynced).toHaveBeenCalledWith(['a1', 'a2']);
  });

  it('업로드 중 실패 → 그 항목부터 중단, 성공분만 clearSynced', async () => {
    mockGetSupabase.mockReturnValue({});
    mockReadQueue.mockResolvedValue([attemptItem('a1'), attemptItem('a2', '2026-06-13T01:00:00.000Z')]);
    mockRecordRaw.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'));
    await flushPendingQueue();
    expect(mockClearSynced).toHaveBeenCalledWith(['a1']); // a2 는 큐 보존
  });

  it('미지원 타입(session) → 업로드 없이 큐 보존(clearSynced 미호출)', async () => {
    mockGetSupabase.mockReturnValue({});
    mockReadQueue.mockResolvedValue([
      { id: 's1', type: 'session', payload: {}, queued_at: '2026-06-13T00:00:00.000Z' },
    ]);
    await flushPendingQueue();
    expect(mockRecordRaw).not.toHaveBeenCalled();
    expect(mockClearSynced).not.toHaveBeenCalled(); // synced 빈 → 무음 삭제 방지
  });

  it('payload.now 누락(손상) → 업로드 안 하고 큐 보존', async () => {
    mockGetSupabase.mockReturnValue({});
    mockReadQueue.mockResolvedValue([
      { id: 'a1', type: 'attempt', payload: { wordId: 'w1' }, queued_at: '2026-06-13T00:00:00.000Z' },
    ]);
    await flushPendingQueue();
    expect(mockRecordRaw).not.toHaveBeenCalled();
    expect(mockClearSynced).not.toHaveBeenCalled();
  });
});
