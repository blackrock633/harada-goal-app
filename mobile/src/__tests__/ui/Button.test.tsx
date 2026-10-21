import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/ui';

describe('Button', () => {
  it('is a button named by its title and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button title="Sign in" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('has a 44pt minimum height', async () => {
    await render(<Button title="Save" />);
    const style = Object.assign({}, ...[screen.getByRole('button').props.style].flat(Infinity));
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('loading is busy + disabled, keeps its label, and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button title="Save" loading onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(screen.getByText('Save')).toBeOnTheScreen(); // label stays so width is unchanged
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('disabled is not busy', async () => {
    await render(<Button title="Save" disabled />);
    expect(screen.getByRole('button').props.accessibilityState).toEqual({ busy: false, disabled: true });
  });

  it('supports all variants', async () => {
    await render(
      <>
        {(['primary', 'secondary', 'ghost', 'danger'] as const).map((v) => (
          <Button key={v} title={v} variant={v} />
        ))}
      </>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });
});
