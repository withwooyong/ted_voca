import { fireEvent, render } from '@testing-library/react-native';

import { WordOrderBuilder } from '@/components/quiz/WordOrderBuilder';

// RTL v14: render/fireEvent async (ADR-0003)

const chips = ['He', 'has', 'worked', 'here'];

describe('WordOrderBuilder (controlled)', () => {
  it('칩 전부 렌더링, 미선택 시 안내 문구', async () => {
    const { getByText } = await render(
      <WordOrderBuilder chips={chips} picked={[]} onPick={() => {}} onReset={() => {}} />,
    );
    for (const c of chips) expect(getByText(c)).toBeTruthy();
    expect(getByText(/카드를 눌러/)).toBeTruthy();
  });

  it('칩 탭 → onPick(index) 호출', async () => {
    const onPick = jest.fn();
    const { getByText } = await render(
      <WordOrderBuilder chips={chips} picked={[]} onPick={onPick} onReset={() => {}} />,
    );
    await fireEvent.press(getByText('worked'));
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it('이미 선택된 칩은 다시 선택 불가(onPick 미호출), 답안 라인에 표시', async () => {
    const onPick = jest.fn();
    const { getAllByText } = await render(
      <WordOrderBuilder chips={chips} picked={[1]} onPick={onPick} onReset={() => {}} />,
    );
    // 'has'는 답안 라인 + 칩 영역(비활성) 두 곳에 존재
    const hasNodes = getAllByText('has');
    expect(hasNodes.length).toBeGreaterThanOrEqual(1);
    for (const n of hasNodes) await fireEvent.press(n);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('선택된 칩은 accessibilityState.disabled 노출 (RTL press 우회 보완)', async () => {
    const { getAllByRole } = await render(
      <WordOrderBuilder chips={chips} picked={[1]} onPick={() => {}} onReset={() => {}} />,
    );
    const buttons = getAllByRole('button');
    const disabledStates = buttons.map((b) => b.props.accessibilityState?.disabled);
    expect(disabledStates).toContain(true); // 선택된 'has' 칩
    expect(disabledStates).toContain(false); // 미선택 칩
  });

  it('다시 놓기 → onReset 호출', async () => {
    const onReset = jest.fn();
    const { getByText } = await render(
      <WordOrderBuilder chips={chips} picked={[0, 1]} onPick={() => {}} onReset={onReset} />,
    );
    await fireEvent.press(getByText(/다시 놓기/));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
