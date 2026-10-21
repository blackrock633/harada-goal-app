import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Badge, EmptyState, ErrorState } from '@/ui';

describe('Badge', () => {
  it('conveys status as text', async () => {
    await render(<Badge text="Behind" tone="warning" />);
    expect(screen.getByText('Behind')).toBeOnTheScreen();
    expect(screen.getByLabelText('Behind')).toBeOnTheScreen();
  });
});

describe('EmptyState', () => {
  it('renders title, message and action', async () => {
    const onPress = jest.fn();
    await render(<EmptyState title="Nothing for today yet" message="Add an action." action={{ label: 'Add action', onPress }} />);
    expect(screen.getByRole('header')).toHaveTextContent('Nothing for today yet');
    expect(screen.getByText('Add an action.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add action' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('has no action by default', async () => {
    await render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('shows an alert with retry', async () => {
    const onRetry = jest.fn();
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await render(<ErrorState message="Network down" onRetry={onRetry} />);
    expect(spy).toHaveBeenCalledWith('Something went wrong. Network down');
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
