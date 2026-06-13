/**
 * STT 어댑터 단위 테스트 — plan p5 §3
 * 대상: apps/mobile/lib/stt.ts (미구현) — 모두 red여야 함
 *
 * expo-speech-recognition은 jest.mock으로 완전 모킹.
 * fake timers 사용 — 타임아웃 동작 테스트.
 */

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    getStateAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    isRecognitionAvailable: jest.fn(() => true),
  },
}));

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// eslint-disable-next-line import/first
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
// eslint-disable-next-line import/first
import { createDeviceAdapter, createMockAdapter, getSttAdapter } from '@/lib/stt';

const mockModule = ExpoSpeechRecognitionModule as jest.Mocked<typeof ExpoSpeechRecognitionModule>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();

  // 기본: 권한 granted, 인식 가용
  mockModule.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
  mockModule.isRecognitionAvailable.mockReturnValue(true);
  mockModule.addListener.mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(() => {
  jest.useRealTimers();
});

// ────────────────────────────────────────────────────────────
// Helper: addListener 핸들러 캡처
// ────────────────────────────────────────────────────────────

type ListenerMap = Record<string, (payload: unknown) => void>;

function captureListeners(): ListenerMap {
  const map: ListenerMap = {};
  (mockModule.addListener as jest.Mock).mockImplementation((event: string, handler: (payload: unknown) => void) => {
    map[event] = handler;
    return { remove: jest.fn() };
  });
  return map;
}

// ────────────────────────────────────────────────────────────
// 1. DeviceAdapter — 정상 동작
// ────────────────────────────────────────────────────────────

describe('createDeviceAdapter — 정상 동작', () => {
  it('kind === "device"', () => {
    const adapter = createDeviceAdapter();
    expect(adapter.kind).toBe('device');
  });

  it('권한 granted → start 시 ExpoSpeechRecognitionModule.start 호출 (lang en-US)', async () => {
    const listeners = captureListeners();
    const adapter = createDeviceAdapter();
    const onResult = jest.fn();
    const onError = jest.fn();

    const startPromise = Promise.resolve(adapter.start({ onResult, onError }));

    await Promise.resolve(); // requestPermissionsAsync await
    await Promise.resolve();

    expect(mockModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-US' }),
    );

    // result 이벤트 발화
    listeners['result']?.({ results: [{ transcript: 'hello world' }], isFinal: true });

    await startPromise.catch(() => {});
    expect(onResult).toHaveBeenCalledWith('hello world');
  });

  it('result 이벤트(final) 수신 → onResult 1회 + 리스너 remove 호출', async () => {
    const removeMocks: jest.Mock[] = [];
    mockModule.addListener.mockImplementation(() => {
      const rm = jest.fn();
      removeMocks.push(rm);
      return { remove: rm };
    });

    const listeners: ListenerMap = {};
    (mockModule.addListener as jest.Mock).mockImplementation((event: string, handler: (payload: unknown) => void) => {
      listeners[event] = handler;
      const rm = jest.fn();
      removeMocks.push(rm);
      return { remove: rm };
    });

    const adapter = createDeviceAdapter();
    const onResult = jest.fn();
    const onError = jest.fn();

    adapter.start({ onResult, onError });
    await Promise.resolve();
    await Promise.resolve();

    listeners['result']?.({ results: [{ transcript: 'test transcript' }], isFinal: true });
    await Promise.resolve();

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('test transcript');
    // 리스너가 하나 이상 remove됨
    const removedCount = removeMocks.filter((rm) => rm.mock.calls.length > 0).length;
    expect(removedCount).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────
// 2. DeviceAdapter — 권한 거부
// ────────────────────────────────────────────────────────────

describe('createDeviceAdapter — 권한 거부', () => {
  it('requestPermissionsAsync가 {granted:false} → onError("permission") + start 미호출', async () => {
    mockModule.requestPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: 'denied',
    } as never);

    const adapter = createDeviceAdapter();
    const onResult = jest.fn();
    const onError = jest.fn();

    await adapter.start({ onResult, onError });

    expect(onError).toHaveBeenCalledWith('permission');
    expect(mockModule.start).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// 3. DeviceAdapter — 타임아웃
// ────────────────────────────────────────────────────────────

describe('createDeviceAdapter — 타임아웃', () => {
  it('timeoutMs 경과까지 result 없으면 stop/abort 호출 + onError("timeout")', async () => {
    captureListeners(); // 리스너 등록만 — result 미발화
    const adapter = createDeviceAdapter();
    const onResult = jest.fn();
    const onError = jest.fn();

    adapter.start({ onResult, onError, timeoutMs: 5000 });
    await Promise.resolve();
    await Promise.resolve();

    // 5초 경과
    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith('timeout');
    // stop 또는 abort 중 하나 이상 호출
    const stopOrAbort = mockModule.stop.mock.calls.length + mockModule.abort.mock.calls.length;
    expect(stopOrAbort).toBeGreaterThan(0);
    expect(onResult).not.toHaveBeenCalled();
  });

  it('stop() 호출 후 타임아웃 경과해도 onError("timeout") 미호출', async () => {
    captureListeners();
    const adapter = createDeviceAdapter();
    const onResult = jest.fn();
    const onError = jest.fn();

    adapter.start({ onResult, onError, timeoutMs: 5000 });
    await Promise.resolve();
    await Promise.resolve();

    // stop 먼저 호출
    adapter.stop();

    // 5초 경과
    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    // timeout onError 미발생
    expect(onError).not.toHaveBeenCalledWith('timeout');
  });
});

// ────────────────────────────────────────────────────────────
// 4. DeviceAdapter — error 이벤트
// ────────────────────────────────────────────────────────────

describe('createDeviceAdapter — error 이벤트', () => {
  it('error 이벤트 수신 → onError("error")', async () => {
    const listeners = captureListeners();
    const adapter = createDeviceAdapter();
    const onResult = jest.fn();
    const onError = jest.fn();

    adapter.start({ onResult, onError });
    await Promise.resolve();
    await Promise.resolve();

    listeners['error']?.({ error: 'audio' });
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith('error');
    expect(onResult).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// 5. MockAdapter
// ────────────────────────────────────────────────────────────

describe('createMockAdapter', () => {
  it('kind === "mock"', () => {
    const adapter = createMockAdapter(() => 'hello');
    expect(adapter.kind).toBe('mock');
  });

  it('isAvailable() → true', async () => {
    const adapter = createMockAdapter(() => 'hello');
    expect(await adapter.isAvailable()).toBe(true);
  });

  it('start → 타이머 진행 후 onResult(provideText() 값) 호출', async () => {
    const adapter = createMockAdapter(() => 'mock utterance');
    const onResult = jest.fn();
    const onError = jest.fn();

    adapter.start({ onResult, onError });

    // 즉시는 미호출
    expect(onResult).not.toHaveBeenCalled();

    // 타이머 진행
    jest.runAllTimers();
    await Promise.resolve();

    expect(onResult).toHaveBeenCalledWith('mock utterance');
    expect(onError).not.toHaveBeenCalled();
  });

  it('provideText()가 매번 호출되어 동적 값 사용 가능', async () => {
    let call = 0;
    const adapter = createMockAdapter(() => `text-${++call}`);
    const onResult = jest.fn();

    adapter.start({ onResult, onError: jest.fn() });
    jest.runAllTimers();
    await Promise.resolve();

    adapter.start({ onResult, onError: jest.fn() });
    jest.runAllTimers();
    await Promise.resolve();

    expect(onResult).toHaveBeenNthCalledWith(1, 'text-1');
    expect(onResult).toHaveBeenNthCalledWith(2, 'text-2');
  });
});

// ────────────────────────────────────────────────────────────
// 6. getSttAdapter
// ────────────────────────────────────────────────────────────

describe('getSttAdapter', () => {
  it('preferMock: true → mock 어댑터 반환', async () => {
    const adapter = await getSttAdapter({ preferMock: true });
    expect(adapter.kind).toBe('mock');
  });

  it('isRecognitionAvailable false → mock 어댑터 반환', async () => {
    mockModule.isRecognitionAvailable.mockReturnValue(false);
    const adapter = await getSttAdapter();
    expect(adapter.kind).toBe('mock');
  });

  it('isRecognitionAvailable true → device 어댑터 반환', async () => {
    mockModule.isRecognitionAvailable.mockReturnValue(true);
    const adapter = await getSttAdapter();
    expect(adapter.kind).toBe('device');
  });

  it('mockTextProvider 함수가 mock 어댑터에 연결됨', async () => {
    const provider = jest.fn(() => 'provided text');
    const adapter = await getSttAdapter({ preferMock: true, mockTextProvider: provider });

    const onResult = jest.fn();
    adapter.start({ onResult, onError: jest.fn() });
    jest.runAllTimers();
    await Promise.resolve();

    expect(provider).toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith('provided text');
  });
});
