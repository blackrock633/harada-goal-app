import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { TextField } from '@/ui';

function Controlled(props: Partial<React.ComponentProps<typeof TextField>>) {
  const [v, setV] = useState('');
  return <TextField label="Title" value={v} onChangeText={setV} {...props} />;
}

describe('TextField', () => {
  it('shows a visible label and uses it as the accessibilityLabel', async () => {
    await render(<Controlled />);
    expect(screen.getByText('Title')).toBeOnTheScreen();
    expect(screen.getByLabelText('Title')).toBeOnTheScreen();
  });

  it('is controlled', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Title" value="abc" onChangeText={onChangeText} />);
    expect(screen.getByLabelText('Title').props.value).toBe('abc');
    await fireEvent.changeText(screen.getByLabelText('Title'), 'abcd');
    expect(onChangeText).toHaveBeenCalledWith('abcd');
  });

  it('shows the hint', async () => {
    await render(<Controlled hint="Keep it short" />);
    expect(screen.getByText('Keep it short')).toBeOnTheScreen();
    expect(screen.getByLabelText('Title').props.accessibilityHint).toBe('Keep it short');
  });

  it('announces and exposes the error as an alert', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await render(<Controlled error="Title is required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Title is required');
    expect(screen.getByLabelText('Title').props.accessibilityHint).toBe('Title is required');
    expect(spy).toHaveBeenCalledWith('Title: Title is required');
    spy.mockRestore();
  });

  it('supports multiline', async () => {
    await render(<Controlled multiline />);
    expect(screen.getByLabelText('Title').props.multiline).toBe(true);
  });

  it('shows a character counter only near the limit', async () => {
    function Counter() {
      const [v, setV] = useState('');
      return <TextField label="Title" value={v} onChangeText={setV} maxLength={10} />;
    }
    await render(<Counter />);
    expect(screen.queryByText(/\/ 10/)).toBeNull();
    await act(async () => {
      await fireEvent.changeText(screen.getByLabelText('Title'), '12345678');
    });
    expect(screen.getByText('8 / 10')).toBeOnTheScreen();
  });
});
