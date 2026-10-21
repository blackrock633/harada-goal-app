import { fireEvent, render, screen } from '@testing-library/react-native';

import { IconButton } from '@/ui';

describe('IconButton', () => {
  it('exposes its accessibilityLabel as a button and is 44pt', async () => {
    const onPress = jest.fn();
    await render(<IconButton accessibilityLabel="Account menu" onPress={onPress} />);
    const b = screen.getByRole('button', { name: 'Account menu' });
    await fireEvent.press(b);
    expect(onPress).toHaveBeenCalled();
    const style = Object.assign({}, ...[b.props.style].flat(Infinity));
    expect(style.width).toBeGreaterThanOrEqual(44);
    expect(style.height).toBeGreaterThanOrEqual(44);
  });
});
