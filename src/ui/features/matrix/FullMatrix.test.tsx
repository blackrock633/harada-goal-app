// @vitest-environment jsdom
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FullMatrix } from './FullMatrix';
import { sampleGoal } from './fixtures.test-util';

const mutations = () => ({ addAction: vi.fn(), updateAction: vi.fn() });

describe('FullMatrix', () => {
  it('is a 9x9 grid with correct roles', () => {
    render(<FullMatrix goal={sampleGoal()} mutations={mutations()} />);
    const grid = screen.getByRole('grid');
    expect(within(grid).getAllByRole('row')).toHaveLength(9);
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(81);
  });

  it('distinguishes goal, key area (twice) and action cells by accessible name', () => {
    render(<FullMatrix goal={sampleGoal()} mutations={mutations()} />);
    expect(screen.getByRole('link', { name: 'Goal: Run a marathon' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Key area 3: Fitness, 3 of 8 actions planned' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Key area 3: Fitness.*\(centre of its block\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Key area 3: Fitness — action 5 of 8: Run 5k, completed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Key area 3: Fitness — action 8 of 8: empty, add action' })).toBeInTheDocument();
    // Empty key area: its action slots lead to creating the key area first.
    expect(screen.getAllByRole('link', { name: /Key area 1: empty — action \d of 8: empty$/ })).toHaveLength(8);
  });

  it('uses a roving tabindex with arrow-key navigation', async () => {
    const user = userEvent.setup();
    render(<FullMatrix goal={sampleGoal()} mutations={mutations()} />);
    const grid = screen.getByRole('grid');
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    const goal = screen.getByRole('link', { name: 'Goal: Run a marathon' });
    expect(goal).toHaveAttribute('tabindex', '0');
    goal.focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('data-cell', '4-5');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-cell', '5-5');
    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveAttribute('data-cell', '5-0');
    await user.keyboard('{ArrowLeft}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(document.activeElement).toHaveAttribute('data-cell', '0-0');
    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(document.activeElement).toHaveAttribute('tabindex', '0');
  });

  it('opens the editor with Enter on an action cell', async () => {
    const user = userEvent.setup();
    render(<FullMatrix goal={sampleGoal()} mutations={mutations()} />);
    screen.getByRole('button', { name: /action 5 of 8: Run 5k/ }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Run 5k');
  });
});
