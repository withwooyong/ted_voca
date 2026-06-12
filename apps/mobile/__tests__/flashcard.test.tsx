import { fireEvent, render } from '@testing-library/react-native';

import { Flashcard } from '@/components/review/Flashcard';

// @testing-library/react-native v14: render/fireEvent는 async (React 19)

const props = {
  front: 'implement',
  meaning: '시행하다',
  pos: 'verb',
  example: 'They implemented the new policy.',
};

describe('Flashcard (controlled)', () => {
  it('flipped=false: 앞면(단어)만 보이고 뜻은 숨김', async () => {
    const { getByText, queryByText } = await render(
      <Flashcard {...props} flipped={false} onFlip={() => {}} />,
    );
    expect(getByText('implement')).toBeTruthy();
    expect(queryByText('시행하다')).toBeNull();
  });

  it('탭하면 onFlip 호출', async () => {
    const onFlip = jest.fn();
    const { getByText } = await render(<Flashcard {...props} flipped={false} onFlip={onFlip} />);
    await fireEvent.press(getByText('implement'));
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it('flipped=true: 뜻·품사·예문 표시', async () => {
    const { getByText } = await render(<Flashcard {...props} flipped onFlip={() => {}} />);
    expect(getByText('시행하다')).toBeTruthy();
    expect(getByText(/verb/)).toBeTruthy();
    expect(getByText(props.example)).toBeTruthy();
  });

  it('example 없으면 예문 영역 생략', async () => {
    const { queryByText } = await render(
      <Flashcard {...props} example={null} flipped onFlip={() => {}} />,
    );
    expect(queryByText(props.example)).toBeNull();
  });
});
