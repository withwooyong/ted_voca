/**
 * DialogueSession 컴포넌트 테스트 — plan p5 §3
 * 대상: apps/mobile/components/speaking/DialogueSession.tsx (미구현) — 모두 red여야 함
 *
 * RTL v14: render/fireEvent 모두 await (ADR-0003 준용)
 * 비동기 결과 반영은 waitFor 사용 (ConcurrentRoot 이슈 안전 — clip-session 패턴)
 */
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { DialogueTurnLike, SpeakFeedback, SpeakingScenarioLike } from '@ted-voca/shared';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// tts mock — speakOnce는 즉시 resolve (onDone 트리거 없이 동기)
jest.mock(
  '@/lib/tts',
  () => ({
    speakOnce: jest.fn((_text: string, opts?: { onDone?: () => void }) => {
      opts?.onDone?.();
    }),
    stopSpeaking: jest.fn(),
    speakQueue: jest.fn().mockResolvedValue('done'),
    ensureAudioMode: jest.fn().mockResolvedValue(undefined),
  }),
  { virtual: true },
);

// eslint-disable-next-line import/first
import * as tts from '@/lib/tts';
// eslint-disable-next-line import/first
import { DialogueSession } from '@/components/speaking/DialogueSession';

const mockSpeakOnce = tts.speakOnce as jest.Mock;

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

const SCENARIO: SpeakingScenarioLike = {
  id: 'sc-uuid-1',
  slug: 'cafe-order',
  title: '카페 주문',
  context: 'You are at a café.',
  difficulty: 1,
  emoji: '☕',
  min_level: 1,
  sort_order: 1,
};

const TURNS: DialogueTurnLike[] = [
  {
    id: 'turn-1',
    scenario_slug: 'cafe-order',
    turn_order: 1,
    speaker: 'ted',
    text_en: 'Hello, what can I get you?',
    hint_ko: null,
  },
  {
    id: 'turn-2',
    scenario_slug: 'cafe-order',
    turn_order: 2,
    speaker: 'user',
    text_en: 'I would like a coffee please.',
    hint_ko: '커피 한 잔 주세요.',
  },
  {
    id: 'turn-3',
    scenario_slug: 'cafe-order',
    turn_order: 3,
    speaker: 'ted',
    text_en: 'Sure! Anything else?',
    hint_ko: null,
  },
  {
    id: 'turn-4',
    scenario_slug: 'cafe-order',
    turn_order: 4,
    speaker: 'user',
    text_en: 'No, thank you.',
    hint_ko: '아니요, 괜찮습니다.',
  },
];

const GOOD_FEEDBACK: { feedback: SpeakFeedback; remainingToday: number } = {
  feedback: { verdict: 'natural', correction: 'Great job!', alternative: 'I would like some coffee.' },
  remainingToday: 9,
};

const OK_FEEDBACK: { feedback: SpeakFeedback; remainingToday: number } = {
  feedback: {
    verdict: 'ok',
    correction: 'I would like a coffee please.',
    alternative: 'Could I have a coffee?',
  },
  remainingToday: 8,
};

const LIMIT_RESPONSE = { error: 'daily_limit' as const, remainingToday: 0 };

function makeRequestFeedback(responses: (typeof GOOD_FEEDBACK | typeof LIMIT_RESPONSE)[]) {
  let idx = 0;
  return jest.fn(async () => responses[Math.min(idx++, responses.length - 1)]);
}

function makeGetUtterance(texts: string[]) {
  let idx = 0;
  return jest.fn(async () => texts[Math.min(idx++, texts.length - 1)]);
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ────────────────────────────────────────────────────────────
// 1. 초기 상태 — 첫 ted 턴 + TTS
// ────────────────────────────────────────────────────────────

describe('DialogueSession — 초기 상태', () => {
  it('첫 ted 턴 버블이 표시됨', async () => {
    const { getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={makeRequestFeedback([GOOD_FEEDBACK, GOOD_FEEDBACK])}
        getUtterance={makeGetUtterance(['I would like a coffee please.', 'No thank you.'])}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(getByText('Hello, what can I get you?')).toBeTruthy();
    });
  });

  it('초기 렌더 시 speakOnce(ted 첫 대사) 호출', async () => {
    await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={makeRequestFeedback([GOOD_FEEDBACK, GOOD_FEEDBACK])}
        getUtterance={makeGetUtterance(['I would like a coffee please.', 'No thank you.'])}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockSpeakOnce).toHaveBeenCalledWith(
        'Hello, what can I get you?',
        expect.any(Object),
      );
    });
  });

  it('진행 표시 노출 (n/총턴 형식)', async () => {
    const { getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={makeRequestFeedback([GOOD_FEEDBACK, GOOD_FEEDBACK])}
        getUtterance={makeGetUtterance(['utterance 1', 'utterance 2'])}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      // 총 4턴(2 ted + 2 user) — 형식은 "1/4" 또는 "1 / 4" 등
      expect(getByText(/\d+\s*\/\s*4/)).toBeTruthy();
    });
  });
});

// ────────────────────────────────────────────────────────────
// 2. user 턴 — 힌트 + 마이크 버튼
// ────────────────────────────────────────────────────────────

describe('DialogueSession — user 턴', () => {
  async function renderAndAdvanceToUserTurn() {
    const requestFeedback = makeRequestFeedback([GOOD_FEEDBACK, GOOD_FEEDBACK]);
    const getUtterance = makeGetUtterance(['I would like a coffee please.', 'No thank you.']);
    const onComplete = jest.fn();

    const utils = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={onComplete}
      />,
    );
    // ted 첫 턴 → speakOnce onDone 즉시 → user 턴으로 자동 진행
    await waitFor(() => {
      // 마이크 버튼 또는 hint_ko 노출 확인
      const { queryByText } = utils;
      expect(queryByText('커피 한 잔 주세요.')).not.toBeNull();
    });
    return { ...utils, requestFeedback, getUtterance, onComplete };
  }

  it('user 턴에 hint_ko 텍스트 표시', async () => {
    const { getByText } = await renderAndAdvanceToUserTurn();
    expect(getByText('커피 한 잔 주세요.')).toBeTruthy();
  });

  it('user 턴에 마이크 버튼 표시 (testID 또는 accessibilityLabel)', async () => {
    const { queryByTestId, queryAllByRole } = await renderAndAdvanceToUserTurn();
    // 마이크 버튼은 testID="mic-button" 또는 role="button"으로 찾음
    const hasMic =
      queryByTestId('mic-button') !== null ||
      queryAllByRole('button').some(
        (b) =>
          b.props.accessibilityLabel?.includes('마이크') ||
          b.props.testID === 'mic-button',
      );
    expect(hasMic).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────
// 3. 발화 → 피드백 카드 노출
// ────────────────────────────────────────────────────────────

describe('DialogueSession — 발화 및 피드백', () => {
  it('마이크 탭 → getUtterance() 호출 → requestFeedback(turnOrder, expectedText) 호출', async () => {
    const requestFeedback = makeRequestFeedback([GOOD_FEEDBACK, GOOD_FEEDBACK]);
    const getUtterance = makeGetUtterance(['I would like a coffee please.', 'No thank you.']);

    const { queryByTestId, queryAllByRole } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={jest.fn()}
      />,
    );

    // user 턴 마이크 버튼 대기
    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some(
          (b) =>
            b.props.accessibilityLabel?.includes('마이크') ||
            b.props.testID === 'mic-button',
        );
      expect(hasMic).toBe(true);
    });

    // 마이크 버튼 탭
    const micButton =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) =>
          b.props.accessibilityLabel?.includes('마이크') ||
          b.props.testID === 'mic-button',
      );
    if (micButton) {
      await fireEvent.press(micButton);
    }

    await waitFor(() => {
      expect(getUtterance).toHaveBeenCalled();
      expect(requestFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          turnOrder: 2, // turn_order of user turn
          expectedText: 'I would like a coffee please.',
        }),
      );
    });
  });

  it('피드백 카드 — verdict 라벨 노출', async () => {
    const requestFeedback = makeRequestFeedback([OK_FEEDBACK, GOOD_FEEDBACK]);
    const getUtterance = makeGetUtterance(['I want coffee.', 'No thank you.']);

    const { queryByTestId, queryAllByRole, getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some((b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'));
      expect(hasMic).toBe(true);
    });

    const micButton =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
      );
    if (micButton) await fireEvent.press(micButton);

    await waitFor(() => {
      // verdict "ok" 라벨 또는 correction 텍스트 노출
      expect(getByText(/ok|자연스럽|다소/i)).toBeTruthy();
    });
  });

  it('피드백 카드 — correction 텍스트 노출', async () => {
    const requestFeedback = makeRequestFeedback([OK_FEEDBACK, GOOD_FEEDBACK]);
    const getUtterance = makeGetUtterance(['I want coffee.', 'No thank you.']);

    const { queryByTestId, queryAllByRole, getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some((b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'));
      expect(hasMic).toBe(true);
    });

    const micButton =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
      );
    if (micButton) await fireEvent.press(micButton);

    await waitFor(() => {
      expect(getByText('I would like a coffee please.')).toBeTruthy();
    });
  });

  it('피드백 카드 후 "다음" 버튼 노출', async () => {
    const requestFeedback = makeRequestFeedback([GOOD_FEEDBACK, GOOD_FEEDBACK]);
    const getUtterance = makeGetUtterance(['I would like a coffee please.', 'No thank you.']);

    const { queryByTestId, queryAllByRole, getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some((b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'));
      expect(hasMic).toBe(true);
    });

    const micButton =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
      );
    if (micButton) await fireEvent.press(micButton);

    await waitFor(() => {
      expect(getByText(/다음/)).toBeTruthy();
    });
  });

  it('"다음" 탭 → 다음 ted 턴 버블 + TTS 재호출', async () => {
    const requestFeedback = makeRequestFeedback([GOOD_FEEDBACK, GOOD_FEEDBACK]);
    const getUtterance = makeGetUtterance(['I would like a coffee please.', 'No thank you.']);

    const { queryByTestId, queryAllByRole, getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some((b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'));
      expect(hasMic).toBe(true);
    });

    const micButton =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
      );
    if (micButton) await fireEvent.press(micButton);

    await waitFor(() => {
      expect(getByText(/다음/)).toBeTruthy();
    });

    mockSpeakOnce.mockClear();
    await fireEvent.press(getByText(/다음/));

    await waitFor(() => {
      expect(mockSpeakOnce).toHaveBeenCalledWith('Sure! Anything else?', expect.any(Object));
    });
  });
});

// ────────────────────────────────────────────────────────────
// 4. daily_limit 응답 → 한도 안내 + 마이크 비활성
// ────────────────────────────────────────────────────────────

describe('DialogueSession — daily_limit', () => {
  it('limit 응답 → 한도 안내 텍스트 포함 (한도 또는 10회)', async () => {
    const requestFeedback = makeRequestFeedback([LIMIT_RESPONSE]);
    const getUtterance = makeGetUtterance(['I would like a coffee please.']);

    const { queryByTestId, queryAllByRole, getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some((b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'));
      expect(hasMic).toBe(true);
    });

    const micButton =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
      );
    if (micButton) await fireEvent.press(micButton);

    await waitFor(() => {
      expect(getByText(/한도|10회|daily limit/i)).toBeTruthy();
    });
  });

  it('limit 후 마이크 버튼 disabled', async () => {
    const requestFeedback = makeRequestFeedback([LIMIT_RESPONSE]);
    const getUtterance = makeGetUtterance(['utterance']);

    const { queryByTestId, queryAllByRole } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={TURNS}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={jest.fn()}
      />,
    );

    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some((b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'));
      expect(hasMic).toBe(true);
    });

    const micButtonBefore =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
      );
    if (micButtonBefore) await fireEvent.press(micButtonBefore);

    await waitFor(() => {
      const micAfter =
        queryByTestId('mic-button') ||
        queryAllByRole('button').find(
          (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
        );
      if (micAfter) {
        expect(micAfter.props.accessibilityState?.disabled).toBe(true);
      }
    });
  });
});

// ────────────────────────────────────────────────────────────
// 5. 완주 → onComplete
// ────────────────────────────────────────────────────────────

describe('DialogueSession — 완주', () => {
  it('모든 턴 소진 → onComplete({userTurns, feedbacks})', async () => {
    // 단순화: user 턴 1개짜리 시나리오
    const simpleTurns: DialogueTurnLike[] = [
      { id: 't1', scenario_slug: 'cafe-order', turn_order: 1, speaker: 'ted', text_en: 'Hi!', hint_ko: null },
      {
        id: 't2',
        scenario_slug: 'cafe-order',
        turn_order: 2,
        speaker: 'user',
        text_en: 'Hello there.',
        hint_ko: '안녕하세요.',
      },
    ];

    const requestFeedback = makeRequestFeedback([GOOD_FEEDBACK]);
    const getUtterance = makeGetUtterance(['Hello there.']);
    const onComplete = jest.fn();

    const { queryByTestId, queryAllByRole, getByText } = await render(
      <DialogueSession
        scenario={SCENARIO}
        turns={simpleTurns}
        requestFeedback={requestFeedback}
        getUtterance={getUtterance}
        onComplete={onComplete}
      />,
    );

    // user 턴 마이크 탭
    await waitFor(() => {
      const hasMic =
        queryByTestId('mic-button') !== null ||
        queryAllByRole('button').some((b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'));
      expect(hasMic).toBe(true);
    });

    const micButton =
      queryByTestId('mic-button') ||
      queryAllByRole('button').find(
        (b) => b.props.testID === 'mic-button' || b.props.accessibilityLabel?.includes('마이크'),
      );
    if (micButton) await fireEvent.press(micButton);

    // "다음" 탭
    await waitFor(() => {
      expect(getByText(/다음/)).toBeTruthy();
    });
    await fireEvent.press(getByText(/다음/));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          userTurns: 1,
          feedbacks: expect.arrayContaining([
            expect.objectContaining({ verdict: expect.any(String) }),
          ]),
        }),
      );
    });
  });
});
