import { render, screen } from '@testing-library/react-native';

import { ProgressBar } from '@/ui';

describe('ProgressBar', () => {
  it('exposes role and value', async () => {
    await render(<ProgressBar value={40} accessibilityLabel="Goal progress" />);
    const p = screen.getByRole('progressbar', { name: 'Goal progress' });
    expect(p.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 40 });
    expect(screen.getByText('40%')).toBeOnTheScreen();
  });

  it('clamps out-of-range values', async () => {
    await render(<ProgressBar value={140} accessibilityLabel="p" />);
    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100);
  });

  it('null reads "Not measurable yet"', async () => {
    await render(<ProgressBar value={null} accessibilityLabel="Goal progress" />);
    expect(screen.getByText('Not measurable yet')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ text: 'Not measurable yet' });
  });
});
