import { fireEvent, render } from '@testing-library/react-native';

import { QuizOption } from '@/components/quiz/QuizOption';

// @testing-library/react-native v14: render/fireEvent는 async (React 19)

describe('QuizOption', () => {
  it('label을 렌더링한다', async () => {
    const { getByText } = await render(<QuizOption label="implement" onPress={() => {}} />);
    expect(getByText('implement')).toBeTruthy();
  });

  it('탭하면 onPress가 호출된다', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<QuizOption label="implement" onPress={onPress} />);
    await fireEvent.press(getByText('implement'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled면 onPress가 호출되지 않는다', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(<QuizOption label="implement" onPress={onPress} disabled />);
    await fireEvent.press(getByText('implement'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('state=correct → ✓ 마커, state=wrong → ✗ 마커 표시', async () => {
    const ok = await render(<QuizOption label="a" state="correct" onPress={() => {}} />);
    expect(ok.getByText('✓')).toBeTruthy();

    const no = await render(<QuizOption label="b" state="wrong" onPress={() => {}} />);
    expect(no.getByText('✗')).toBeTruthy();
  });

  it('기본 state는 마커 없음', async () => {
    const { queryByText } = await render(<QuizOption label="a" onPress={() => {}} />);
    expect(queryByText('✓')).toBeNull();
    expect(queryByText('✗')).toBeNull();
  });
});
