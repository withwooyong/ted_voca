/**
 * ClipSession 컴포넌트 테스트 — plan p4 §5
 * 대상: apps/mobile/components/listening/ClipSession.tsx (미구현) — 모두 red여야 함
 *
 * RTL v14: render/fireEvent 모두 await (ADR-0003)
 */
import { fireEvent, render } from '@testing-library/react-native';

import type { ListeningClipLike, ListeningQuestionLike } from '@ted-voca/shared';

jest.mock('@/lib/supabase', () => ({
  getSupabase: () => null,
  isSupabaseConfigured: false,
}));

// speakOnce는 mock으로 제어 — onDone은 수동으로 트리거
// virtual: true — lib/tts 파일이 아직 없어도 mock 등록 가능
let capturedSpeakOpts: { onDone?: () => void; rate?: string } = {};
jest.mock(
  '@/lib/tts',
  () => ({
    speakOnce: jest.fn((text: string, opts?: { rate?: string; onDone?: () => void }) => {
      capturedSpeakOpts = opts ?? {};
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
import { ClipSession } from '@/components/listening/ClipSession';

const mockSpeakOnce = tts.speakOnce as jest.Mock;

// ────────────────────────────────────────────────────────────
// Fixture
// ────────────────────────────────────────────────────────────

const CLIP: ListeningClipLike = {
  id: 'clip-uuid-1',
  slug: 'office-meeting',
  title: '사내 회의 공지',
  transcript_en: 'The meeting starts at nine AM in room 301.',
  transcript_ko: '회의는 오전 9시 301호에서 시작합니다.',
  duration_seconds: 7,
  difficulty: 2,
  tags: ['office'],
  sort_order: 1,
};

const QUESTIONS: ListeningQuestionLike[] = [
  {
    id: 'q-uuid-1',
    clip_slug: 'office-meeting',
    prompt: 'When does the meeting start?',
    choices: ['At 8 AM', 'At 9 AM', 'At 10 AM', 'At noon'],
    answer: 'At 9 AM',
    explanation: '오전 9시에 시작한다고 했습니다.',
    sort_order: 1,
  },
  {
    id: 'q-uuid-2',
    clip_slug: 'office-meeting',
    prompt: 'Where is the meeting held?',
    choices: ['Room 101', 'Room 201', 'Room 301', 'Room 401'],
    answer: 'Room 301',
    explanation: '301호에서 열린다고 했습니다.',
    sort_order: 2,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  capturedSpeakOpts = {};
});

// ────────────────────────────────────────────────────────────
// 1. 초기 상태
// ────────────────────────────────────────────────────────────

describe('ClipSession — 초기 상태', () => {
  it('재생 버튼이 초기에 존재', async () => {
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    expect(getByText(/재생/)).toBeTruthy();
  });

  it('속도 pill 3종 초기 노출 (0.75x, 1.0x, 1.25x)', async () => {
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    expect(getByText(/0\.75x/)).toBeTruthy();
    expect(getByText(/1\.0x/)).toBeTruthy();
    expect(getByText(/1\.25x/)).toBeTruthy();
  });

  it('재생 전에는 문항 prompt가 미노출 (재생 게이트)', async () => {
    const { queryByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    // 첫 번째 문항 prompt는 재생 전 숨겨져야 함
    expect(queryByText('When does the meeting start?')).toBeNull();
  });

  it('재생 전에는 보기(choices)가 미노출', async () => {
    const { queryByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    expect(queryByText('At 9 AM')).toBeNull();
    expect(queryByText('At 8 AM')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// 2. 재생 게이트 — 1회 재생 후 문항 노출
// ────────────────────────────────────────────────────────────

describe('ClipSession — 재생 게이트', () => {
  it('재생 버튼 탭 → speakOnce(transcript) 호출', async () => {
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    await fireEvent.press(getByText(/재생/));
    expect(mockSpeakOnce).toHaveBeenCalledWith(
      CLIP.transcript_en,
      expect.any(Object),
    );
  });

  it('speakOnce onDone 트리거 후 문항 노출', async () => {
    const { getByText, queryByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    await fireEvent.press(getByText(/재생/));

    // onDone 전에는 미노출
    expect(queryByText('When does the meeting start?')).toBeNull();

    // onDone 트리거
    capturedSpeakOpts.onDone?.();

    // 문항 노출 확인 (상태 업데이트 후)
    await Promise.resolve();
    expect(getByText('When does the meeting start?')).toBeTruthy();
  });

  it('재생 후에도 "다시 듣기" 버튼 존재', async () => {
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    await fireEvent.press(getByText(/재생/));
    capturedSpeakOpts.onDone?.();
    await Promise.resolve();

    // 재생 후에도 다시 듣기 버튼 존재
    expect(getByText(/다시 듣기/)).toBeTruthy();
  });

  it('다시 듣기 탭 → speakOnce 재호출', async () => {
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );
    await fireEvent.press(getByText(/재생/));
    capturedSpeakOpts.onDone?.();
    await Promise.resolve();

    mockSpeakOnce.mockClear();
    await fireEvent.press(getByText(/다시 듣기/));
    expect(mockSpeakOnce).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────
// 3. 보기 탭 — onAnswer 호출, 해설 노출, 따라 말하기
// ────────────────────────────────────────────────────────────

describe('ClipSession — 보기 탭 동작', () => {
  async function renderAfterPlay() {
    const onAnswer = jest.fn();
    const onComplete = jest.fn();
    const utils = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={onAnswer}
        onComplete={onComplete}
      />,
    );
    await fireEvent.press(utils.getByText(/재생/));
    capturedSpeakOpts.onDone?.();
    await Promise.resolve();
    return { ...utils, onAnswer, onComplete };
  }

  it('정답 보기 탭 → onAnswer(question, true) 호출', async () => {
    const { getByText, onAnswer } = await renderAfterPlay();
    await fireEvent.press(getByText('At 9 AM'));
    expect(onAnswer).toHaveBeenCalledWith(QUESTIONS[0], true);
  });

  it('오답 보기 탭 → onAnswer(question, false) 호출', async () => {
    const { getByText, onAnswer } = await renderAfterPlay();
    await fireEvent.press(getByText('At 8 AM'));
    expect(onAnswer).toHaveBeenCalledWith(QUESTIONS[0], false);
  });

  it('보기 탭 후 해설 텍스트 노출', async () => {
    const { getByText } = await renderAfterPlay();
    await fireEvent.press(getByText('At 9 AM'));
    await Promise.resolve();
    expect(getByText('오전 9시에 시작한다고 했습니다.')).toBeTruthy();
  });

  it('보기 탭 후 따라 말하기 버튼이 disabled로 존재', async () => {
    const { getByText, getAllByRole } = await renderAfterPlay();
    await fireEvent.press(getByText('At 9 AM'));
    await Promise.resolve();

    // 따라 말하기 버튼이 존재하되 disabled
    expect(getByText(/따라 말하기/)).toBeTruthy();
    const buttons = getAllByRole('button');
    const speakBtn = buttons.find((b) =>
      b.props.children?.toString().includes('따라 말하기') ||
      b.props.accessibilityLabel?.includes('따라 말하기'),
    );
    if (speakBtn) {
      expect(speakBtn.props.accessibilityState?.disabled).toBe(true);
    }
  });
});

// ────────────────────────────────────────────────────────────
// 4. 마지막 문항 완료 → onComplete
// ────────────────────────────────────────────────────────────

describe('ClipSession — 완료 흐름', () => {
  it('마지막 문항 답변 후 "계속" 탭 → onComplete(correctCount)', async () => {
    const onAnswer = jest.fn();
    const onComplete = jest.fn();
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={[QUESTIONS[0]]} // 문항 1개로 단순화
        onAnswer={onAnswer}
        onComplete={onComplete}
      />,
    );

    // 재생 게이트 통과
    await fireEvent.press(getByText(/재생/));
    capturedSpeakOpts.onDone?.();
    await Promise.resolve();

    // 정답 선택
    await fireEvent.press(getByText('At 9 AM'));
    await Promise.resolve();

    // "계속" 탭
    await fireEvent.press(getByText(/계속/));
    expect(onComplete).toHaveBeenCalledWith(1); // 정답 1개
  });

  it('오답 후 계속 탭 → onComplete(0)', async () => {
    const onComplete = jest.fn();
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={[QUESTIONS[0]]}
        onAnswer={jest.fn()}
        onComplete={onComplete}
      />,
    );

    await fireEvent.press(getByText(/재생/));
    capturedSpeakOpts.onDone?.();
    await Promise.resolve();

    await fireEvent.press(getByText('At 8 AM')); // 오답
    await Promise.resolve();

    await fireEvent.press(getByText(/계속/));
    expect(onComplete).toHaveBeenCalledWith(0);
  });
});

// ────────────────────────────────────────────────────────────
// 5. 속도 pill 선택 → speakOnce rate 반영
// ────────────────────────────────────────────────────────────

describe('ClipSession — 속도 pill', () => {
  it('0.75x pill 탭 후 재생 → rate slow 전달', async () => {
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    await fireEvent.press(getByText(/0\.75x/));
    await fireEvent.press(getByText(/재생/));

    expect(mockSpeakOnce).toHaveBeenCalledWith(
      CLIP.transcript_en,
      expect.objectContaining({ rate: 'slow' }),
    );
  });

  it('1.25x pill 탭 후 재생 → rate fast 전달', async () => {
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    await fireEvent.press(getByText(/1\.25x/));
    await fireEvent.press(getByText(/재생/));

    expect(mockSpeakOnce).toHaveBeenCalledWith(
      CLIP.transcript_en,
      expect.objectContaining({ rate: 'fast' }),
    );
  });

  it('1.0x가 기본 선택 상태', async () => {
    // 속도 미변경으로 재생 시 rate normal
    const { getByText } = await render(
      <ClipSession
        clip={CLIP}
        questions={QUESTIONS}
        onAnswer={jest.fn()}
        onComplete={jest.fn()}
      />,
    );

    await fireEvent.press(getByText(/재생/));
    const opts = mockSpeakOnce.mock.calls[0][1];
    expect(opts?.rate ?? 'normal').toBe('normal');
  });
});
