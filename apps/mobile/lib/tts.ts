/**
 * TTS 래퍼 (expo-speech + expo-audio, SDK 56) — plan: docs/plans/p4-listening.md §2, §4
 *
 * - 오디오 파일 없이 expo-speech 실시간 합성. rate 프리셋(slow/normal/fast).
 * - speakQueue: Memory Booster용 순차 재생 (onDone → pause → 다음).
 * - stopSpeaking: 진행 중 큐 중단 + 후속 speak 차단.
 * - ensureAudioMode: iOS 무음 스위치 대응 (expo-audio), 1회 메모이즈.
 */
import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';

import { LISTENING_RATES, type ListeningRate } from '@ted-voca/shared';

export type SpeakOnceOptions = {
  rate?: ListeningRate;
  onDone?: () => void;
  onError?: (error?: unknown) => void;
};

export type QueueItem = {
  text: string;
  /** 이 아이템 재생 완료 후 다음으로 넘어가기 전 대기(ms). 기본 0 */
  pauseAfterMs?: number;
};

export type SpeakQueueOptions = {
  rate?: ListeningRate;
  /** 각 아이템 재생 시작 직전 호출 (index 전달) */
  onItemStart?: (index: number) => void;
};

export type QueueResult = 'done' | 'stopped';

// ── 모듈 레벨 상태 (진행 중 큐 제어) ─────────────────────────
// generation: stopSpeaking/새 큐 시작 시 증가 — 네이티브 레이어에서 늦게 발화하는
// 구 큐의 onDone/타이머 콜백을 세대 불일치로 무효화한다 (재시작 시 큐 오염 방지).
let generation = 0;
let activeTimer: ReturnType<typeof setTimeout> | null = null;
let resolveActiveQueue: ((result: QueueResult) => void) | null = null;

function clearActiveTimer(): void {
  if (activeTimer !== null) {
    clearTimeout(activeTimer);
    activeTimer = null;
  }
}

function buildSpeechOptions(
  rate: ListeningRate,
  extra?: { onDone?: () => void; onError?: (error?: unknown) => void },
): Speech.SpeechOptions {
  return {
    rate: LISTENING_RATES[rate],
    language: 'en-US',
    // iOS: 앱 오디오 세션 사용 → ensureAudioMode의 무음 모드 설정이 적용되게 함
    useApplicationAudioSession: true,
    onDone: extra?.onDone,
    onError: extra?.onError,
  };
}

/** 단발 재생 — rate 매핑 + en-US, onDone/onError 패스스루 */
export function speakOnce(text: string, options: SpeakOnceOptions = {}): void {
  const rate = options.rate ?? 'normal';
  Speech.speak(
    text,
    buildSpeechOptions(rate, { onDone: options.onDone, onError: options.onError }),
  );
}

/**
 * 순차 재생: items를 차례로 speak.
 * 각 아이템 onDone → setTimeout(pauseAfterMs) → 다음 아이템.
 * stopSpeaking() 호출 시 'stopped'로 resolve, 후속 speak 차단.
 */
export function speakQueue(
  items: QueueItem[],
  options: SpeakQueueOptions = {},
): Promise<QueueResult> {
  const rate = options.rate ?? 'normal';

  // 이전 큐가 진행 중이면 보장 종료 — 구 발화 중단 + 'stopped' resolve + 세대 무효화
  if (resolveActiveQueue) {
    stopSpeaking();
  }
  const myGen = ++generation;

  return new Promise<QueueResult>((resolve) => {
    resolveActiveQueue = resolve;

    const finish = (result: QueueResult) => {
      if (myGen !== generation) return; // 이미 다른 큐/stop으로 넘어감
      clearActiveTimer();
      resolveActiveQueue = null;
      resolve(result);
    };

    const speakAt = (index: number) => {
      if (myGen !== generation) return; // stopSpeaking이 이미 'stopped'로 resolve함
      if (index >= items.length) {
        finish('done');
        return;
      }

      const item = items[index];
      options.onItemStart?.(index);

      Speech.speak(
        item.text,
        buildSpeechOptions(rate, {
          onDone: () => {
            if (myGen !== generation) return; // 구 큐의 늦은 onDone 무시
            const pause = item.pauseAfterMs ?? 0;
            activeTimer = setTimeout(() => {
              activeTimer = null;
              speakAt(index + 1);
            }, pause);
          },
          // 엔진 오류 시 promise hang 방지 — 'stopped'로 종료
          onError: () => finish('stopped'),
        }),
      );
    };

    speakAt(0);
  });
}

/** 재생 중단: Speech.stop + 대기 타이머 clear + 진행 중 큐를 'stopped'로 resolve */
export function stopSpeaking(): void {
  generation++; // 진행 중 큐의 모든 후속 콜백 무효화
  clearActiveTimer();
  Speech.stop();
  if (resolveActiveQueue) {
    const resolve = resolveActiveQueue;
    resolveActiveQueue = null;
    resolve('stopped');
  }
}

// ── 오디오 모드 (iOS 무음 스위치) ───────────────────────────
let audioModePromise: Promise<void> | null = null;

/**
 * iOS 무음 모드에서도 TTS가 들리게 오디오 세션 설정. 1회만 실행(메모이즈).
 * 실패 시(웹 등) console.warn만 — throw하지 않음.
 */
export function ensureAudioMode(): Promise<void> {
  if (audioModePromise) return audioModePromise;
  audioModePromise = (async () => {
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch (e) {
      console.warn('[tts] setAudioModeAsync 실패 — 무음 모드 설정 생략', e);
    }
  })();
  return audioModePromise;
}
