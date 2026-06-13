/**
 * STT(음성 인식) 어댑터 — plan: docs/plans/p5-speaking-ai.md §3
 *
 * - expo-speech-recognition 네이티브 모듈 래퍼 (tts.ts와 동일한 모듈 레벨 상태 스타일).
 * - device 어댑터: 권한 요청 → 리스너 등록 → 타임아웃 관리. 결과/에러/정리 1회 보장.
 * - mock 어댑터: 권한·네이티브 없이 setTimeout 후 provideText() 발화 (웹/Expo Go/테스트용).
 * - getSttAdapter: preferMock 또는 인식 불가 시 mock, 아니면 device.
 */
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export type SttErrorCode = 'permission' | 'timeout' | 'unavailable' | 'error';

export type SttOptions = {
  lang?: string;
  timeoutMs?: number;
  onResult: (transcript: string) => void;
  onError: (code: SttErrorCode) => void;
};

export type SttAdapter = {
  kind: 'device' | 'mock';
  isAvailable: () => Promise<boolean>;
  start: (opts: SttOptions) => Promise<void> | void;
  stop: () => void;
};

const DEFAULT_LANG = 'en-US';
const DEFAULT_TIMEOUT_MS = 15000;

type ResultPayload = {
  results?: { transcript?: string }[];
  isFinal?: boolean;
};

// ── Device 어댑터 ───────────────────────────────────────────

export function createDeviceAdapter(): SttAdapter {
  // 현재 인식 세션 상태 (한 어댑터 인스턴스 내 동시 start 안전).
  let listeners: { remove: () => void }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false; // 결과/에러/정리 1회만 — 중복 콜백 방지

  function cleanup(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    for (const l of listeners) l.remove();
    listeners = [];
  }

  async function start(opts: SttOptions): Promise<void> {
    const lang = opts.lang ?? DEFAULT_LANG;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // 이전 세션이 남아 있으면 먼저 정리 — 재시작 시 구 리스너/타이머 누적 방지(리뷰 M-1).
    cleanup();
    settled = false;

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      opts.onError('permission');
      return;
    }

    const finalize = (run: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      run();
    };

    listeners.push(
      ExpoSpeechRecognitionModule.addListener('result', (payload: ResultPayload) => {
        if (!payload?.isFinal) return;
        const transcript = payload.results?.[0]?.transcript ?? '';
        finalize(() => opts.onResult(transcript));
      }),
    );
    listeners.push(
      ExpoSpeechRecognitionModule.addListener('error', () => {
        finalize(() => opts.onError('error'));
      }),
    );
    listeners.push(
      ExpoSpeechRecognitionModule.addListener('end', () => {
        // end만으로는 콜백을 내지 않음 — 결과/타임아웃이 종료를 주도.
      }),
    );

    timer = setTimeout(() => {
      finalize(() => {
        try {
          ExpoSpeechRecognitionModule.stop();
        } catch {
          // ignore
        }
        try {
          ExpoSpeechRecognitionModule.abort();
        } catch {
          // ignore
        }
        opts.onError('timeout');
      });
    }, timeoutMs);

    ExpoSpeechRecognitionModule.start({ lang });
  }

  function stop(): void {
    // stop 시 타임아웃/리스너 정리 — 이후 timeout onError 미발생.
    if (settled) {
      cleanup();
      return;
    }
    settled = true;
    cleanup();
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // ignore
    }
  }

  return {
    kind: 'device',
    isAvailable: async () => ExpoSpeechRecognitionModule.isRecognitionAvailable(),
    start,
    stop,
  };
}

// ── Mock 어댑터 ─────────────────────────────────────────────

export function createMockAdapter(provideText: () => string): SttAdapter {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    kind: 'mock',
    isAvailable: async () => true,
    start: (opts: SttOptions) => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        opts.onResult(provideText());
      }, 300);
    },
    stop: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

// ── 팩토리 ──────────────────────────────────────────────────

export type GetSttAdapterOptions = {
  preferMock?: boolean;
  mockTextProvider?: () => string;
};

export async function getSttAdapter(opts?: GetSttAdapterOptions): Promise<SttAdapter> {
  const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
  if (opts?.preferMock || !available) {
    return createMockAdapter(opts?.mockTextProvider ?? (() => ''));
  }
  return createDeviceAdapter();
}
