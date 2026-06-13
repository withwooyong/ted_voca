/**
 * TTS 래퍼 단위 테스트 — plan p4 §5
 * 대상: apps/mobile/lib/tts.ts (미구현) — 모두 red여야 함
 *
 * expo-speech·expo-audio는 jest.mock으로 완전 모킹.
 */

jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// eslint-disable-next-line import/first
import * as Speech from 'expo-speech';
// eslint-disable-next-line import/first
import * as Audio from 'expo-audio';
// eslint-disable-next-line import/first
import { ensureAudioMode, speakOnce, speakQueue, stopSpeaking } from '@/lib/tts';

const mockSpeak = Speech.speak as jest.Mock;
const mockStop = Speech.stop as jest.Mock;
const mockSetAudioMode = Audio.setAudioModeAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ────────────────────────────────────────────────────────────
// 1. speakOnce — rate 매핑
// ────────────────────────────────────────────────────────────

describe('speakOnce — rate 매핑', () => {
  it('slow rate → Speech.speak에 rate 0.75 전달', () => {
    speakOnce('Hello world', { rate: 'slow' });
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const opts = mockSpeak.mock.calls[0][1];
    expect(opts.rate).toBe(0.75);
  });

  it('normal rate → Speech.speak에 rate 1.0 전달', () => {
    speakOnce('Hello world', { rate: 'normal' });
    const opts = mockSpeak.mock.calls[0][1];
    expect(opts.rate).toBe(1.0);
  });

  it('fast rate → Speech.speak에 rate 1.25 전달', () => {
    speakOnce('Hello world', { rate: 'fast' });
    const opts = mockSpeak.mock.calls[0][1];
    expect(opts.rate).toBe(1.25);
  });

  it('rate 미지정 시 기본값 normal(1.0) 사용', () => {
    speakOnce('Hello world');
    const opts = mockSpeak.mock.calls[0][1];
    expect(opts.rate).toBe(1.0);
  });

  it("language 'en-US'를 항상 전달", () => {
    speakOnce('Good morning');
    const opts = mockSpeak.mock.calls[0][1];
    expect(opts.language).toBe('en-US');
  });

  it('onDone 콜백이 Speech.speak 옵션에 전달됨', () => {
    const onDone = jest.fn();
    speakOnce('Test', { onDone });
    const opts = mockSpeak.mock.calls[0][1];
    // onDone이 Speech.speak 옵션에 연결되어 있어야 함
    expect(typeof opts.onDone).toBe('function');
    opts.onDone();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('onError 콜백이 Speech.speak 옵션에 전달됨', () => {
    const onError = jest.fn();
    speakOnce('Test', { onError });
    const opts = mockSpeak.mock.calls[0][1];
    expect(typeof opts.onError).toBe('function');
    opts.onError();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────
// 2. speakQueue — 순차 재생
// ────────────────────────────────────────────────────────────

describe('speakQueue — 순차 재생', () => {
  it('items 순서대로 Speech.speak 호출', async () => {
    const items = [{ text: 'First sentence.' }, { text: 'Second sentence.' }];

    const promise = speakQueue(items, { rate: 'normal' });

    // 첫 번째 speak 호출 확인
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeak.mock.calls[0][0]).toBe('First sentence.');

    // 첫 번째 onDone 트리거
    const firstOpts = mockSpeak.mock.calls[0][1];
    firstOpts.onDone();

    // pauseAfterMs 기본값 0 → 타이머 0ms 경과
    jest.runAllTimers();
    await Promise.resolve(); // microtask flush

    // 두 번째 speak 호출
    expect(mockSpeak).toHaveBeenCalledTimes(2);
    expect(mockSpeak.mock.calls[1][0]).toBe('Second sentence.');

    // 두 번째 onDone 트리거
    const secondOpts = mockSpeak.mock.calls[1][1];
    secondOpts.onDone();
    jest.runAllTimers();

    const result = await promise;
    expect(result).toBe('done');
  });

  it('pauseAfterMs 대기 후 다음 speak 호출', async () => {
    const items = [{ text: 'Word.', pauseAfterMs: 1000 }, { text: 'Example.' }];

    speakQueue(items);

    // 첫 번째 완료
    const firstOpts = mockSpeak.mock.calls[0][1];
    firstOpts.onDone();

    // 1000ms 경과 전에는 두 번째 speak 없음
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    expect(mockSpeak).toHaveBeenCalledTimes(1);

    // 1000ms 경과 후 두 번째 speak 호출
    jest.advanceTimersByTime(600);
    await Promise.resolve();
    expect(mockSpeak).toHaveBeenCalledTimes(2);
  });

  it('onItemStart(index) 각 아이템 시작 시 호출', async () => {
    const onItemStart = jest.fn();
    const items = [{ text: 'A' }, { text: 'B' }, { text: 'C' }];

    speakQueue(items, { onItemStart });

    // 첫 번째 아이템 시작 → onItemStart(0)
    expect(onItemStart).toHaveBeenCalledWith(0);

    const opts0 = mockSpeak.mock.calls[0][1];
    opts0.onDone();
    jest.runAllTimers();
    await Promise.resolve();

    // 두 번째 아이템 시작 → onItemStart(1)
    expect(onItemStart).toHaveBeenCalledWith(1);

    const opts1 = mockSpeak.mock.calls[1][1];
    opts1.onDone();
    jest.runAllTimers();
    await Promise.resolve();

    // 세 번째 아이템 시작 → onItemStart(2)
    expect(onItemStart).toHaveBeenCalledWith(2);
  });

  it('전체 완료 시 promise가 "done"으로 resolve', async () => {
    const items = [{ text: 'Single.' }];
    const promise = speakQueue(items);

    const opts = mockSpeak.mock.calls[0][1];
    opts.onDone();
    jest.runAllTimers();

    const result = await promise;
    expect(result).toBe('done');
  });

  it('빈 items는 즉시 "done" resolve', async () => {
    const result = await speakQueue([]);
    expect(result).toBe('done');
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('중간에 stopSpeaking() 호출 시 Speech.stop() 호출', async () => {
    const items = [{ text: 'First.' }, { text: 'Second.' }, { text: 'Third.' }];
    const promise = speakQueue(items);

    // 첫 번째 speak 진행 중 stop
    stopSpeaking();
    expect(mockStop).toHaveBeenCalledTimes(1);

    jest.runAllTimers();
    const result = await promise;
    expect(result).toBe('stopped');
  });

  it('stopSpeaking 후 후속 speak 미호출', async () => {
    const items = [{ text: 'First.' }, { text: 'Second.' }];
    const promise = speakQueue(items);

    // 첫 번째 onDone 후 stop
    const opts = mockSpeak.mock.calls[0][1];
    opts.onDone();
    stopSpeaking();
    jest.runAllTimers();
    await promise;

    // 두 번째는 호출되지 않아야 함
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  it('speakQueue에 rate 옵션 적용', () => {
    const items = [{ text: 'Test.' }];
    speakQueue(items, { rate: 'fast' });

    const opts = mockSpeak.mock.calls[0][1];
    expect(opts.rate).toBe(1.25);
  });

  // 리뷰 H-2 회귀: TTS 엔진 오류 시 promise가 hang하지 않아야 함
  it('재생 중 onError 발생 시 "stopped"로 resolve하고 후속 speak 미호출', async () => {
    const items = [{ text: 'First.' }, { text: 'Second.' }];
    const promise = speakQueue(items);

    const opts = mockSpeak.mock.calls[0][1];
    opts.onError(new Error('tts engine error'));
    jest.runAllTimers();

    const result = await promise;
    expect(result).toBe('stopped');
    expect(mockSpeak).toHaveBeenCalledTimes(1);
  });

  // 리뷰 H-1 회귀: 새 큐 시작 후 지연 도착한 구 큐의 onDone이 신 큐를 오염시키지 않아야 함
  it('큐 재시작 후 구 큐의 늦은 onDone이 무시됨', async () => {
    const q1 = speakQueue([{ text: 'old-1' }, { text: 'old-2' }]);
    const oldOpts = mockSpeak.mock.calls[0][1];

    // 구 큐가 진행 중인 채로 새 큐 시작 → 구 큐는 'stopped'로 종료
    const q2 = speakQueue([{ text: 'new-1' }]);
    await expect(q1).resolves.toBe('stopped');
    expect(mockSpeak).toHaveBeenCalledTimes(2);
    expect(mockSpeak.mock.calls[1][0]).toBe('new-1');

    // 네이티브 레이어에서 늦게 발화한 구 onDone — old-2 재생으로 이어지면 안 됨
    oldOpts.onDone();
    jest.runAllTimers();
    await Promise.resolve();
    expect(mockSpeak).toHaveBeenCalledTimes(2);

    // 신 큐는 정상 완주
    const newOpts = mockSpeak.mock.calls[1][1];
    newOpts.onDone();
    jest.runAllTimers();
    await expect(q2).resolves.toBe('done');
  });
});

// ────────────────────────────────────────────────────────────
// 3. ensureAudioMode — 1회 메모이즈
// ────────────────────────────────────────────────────────────

describe('ensureAudioMode', () => {
  beforeEach(() => {
    // 모듈 상태 리셋이 필요하므로 각 테스트에서 mock clear
    mockSetAudioMode.mockClear();
  });

  it('playsInSilentMode: true로 setAudioModeAsync 호출', async () => {
    await ensureAudioMode();
    expect(mockSetAudioMode).toHaveBeenCalledTimes(1);
    // SDK 56 expo-audio의 정식 키는 playsInSilentMode (playsInSilentModeIOS는 expo-av 시절 키)
    expect(mockSetAudioMode).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true }),
    );
  });

  it('2회 호출해도 setAudioModeAsync는 1회만 실행 (메모이즈)', async () => {
    await ensureAudioMode();
    await ensureAudioMode();
    // 모듈 레벨 메모이즈 → 한 테스트 내에서만 검증 가능
    // 2회 호출 시 setAudioModeAsync 1회 이하 (이미 한 번 호출됐으면 0회 추가)
    expect(mockSetAudioMode.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('setAudioModeAsync가 reject해도 throw하지 않고 resolve', async () => {
    mockSetAudioMode.mockRejectedValueOnce(new Error('Audio mode error'));
    await expect(ensureAudioMode()).resolves.toBeUndefined();
  });
});
