// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActivateGoalButton } from './ActivateGoalButton';

describe('ActivateGoalButton', () => {
  it('shows the upgrade message with a link to pricing on UPGRADE_REQUIRED', async () => {
    const activateGoal = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'UPGRADE_REQUIRED' as const, message: 'The Free plan has one active goal.' },
    }));
    render(<ActivateGoalButton goalId="g1" activateGoal={activateGoal} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activate goal' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The Free plan has one active goal.');
    expect(screen.getByRole('link', { name: 'See Harada Pro' }).getAttribute('href')).toBe('/pricing');
  });

  it('shows other errors without the upgrade link', async () => {
    const activateGoal = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'INVALID_STATE' as const, message: 'Add an action first.' },
    }));
    render(<ActivateGoalButton goalId="g1" activateGoal={activateGoal} />);
    await userEvent.click(screen.getByRole('button', { name: 'Activate goal' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Add an action first.');
    expect(screen.queryByRole('link', { name: 'See Harada Pro' })).toBeNull();
  });
});
