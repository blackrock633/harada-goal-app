import { fireEvent, render, screen } from '@testing-library/react-native';

import { CheckCircle } from '@/ui';

describe('CheckCircle', () => {
  it('is a checkbox with the caller label and unchecked state', async () => {
    const onPress = jest.fn();
    await render(<CheckCircle checked={false} accessibilityLabel="Complete: Write" onPress={onPress} />);
    const c = screen.getByRole('checkbox', { name: 'Complete: Write' });
    expect(c).not.toBeChecked();
    await fireEvent.press(c);
    expect(onPress).toHaveBeenCalled();
  });

  it('reports checked', async () => {
    await render(<CheckCircle checked accessibilityLabel="Reopen: Write" />);
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('reports checked + busy and ignores presses while busy', async () => {
    const onPress = jest.fn();
    await render(<CheckCircle checked busy accessibilityLabel="Reopen: Write" onPress={onPress} />);
    const c = screen.getByRole('checkbox');
    expect(c.props.accessibilityState).toMatchObject({ checked: true, busy: true });
    await fireEvent.press(c);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('has a 44pt hit area around a 28pt circle', async () => {
    await render(<CheckCircle checked={false} accessibilityLabel="x" />);
    const style = Object.assign({}, ...[screen.getByRole('checkbox').props.style].flat(Infinity));
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
  });
});
