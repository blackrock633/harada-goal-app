// @vitest-environment jsdom
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KeyAreaView } from './KeyAreaView';
import { mkGoal, mkOutcome, sampleGoal, uid } from './fixtures.test-util';

const TODAY = '2026-03-01';
const exec = () => ({
  completeAction: vi.fn(),
  reopenAction: vi.fn(),
  checkRoutine: vi.fn(),
  uncheckRoutine: vi.fn(),
});
const mat = () => ({ addOutcome: vi.fn(), updateOutcome: vi.fn(), addAction: vi.fn(), updateAction: vi.fn() });

describe('KeyAreaView', () => {
  it('lists 8 slots with glyphs, status, and wraps prev/next', () => {
    render(<KeyAreaView goal={sampleGoal()} position={0} today={TODAY} matrix={mat()} execution={exec()} onError={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Previous key area (8)' })).toHaveAttribute('href', expect.stringContaining('/matrix/7?goal='));
    expect(screen.getByRole('link', { name: 'Next key area (2)' })).toHaveAttribute('href', expect.stringContaining('/matrix/1?goal='));
    // Empty area at position 0 -> create form, not a list
    expect(screen.getByText('Key area 1 is empty')).toBeInTheDocument();
  });

  it('shows a populated area with 8 list items', () => {
    render(<KeyAreaView goal={sampleGoal()} position={2} today={TODAY} matrix={mat()} execution={exec()} onError={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Fitness' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByText(/Due in 4 days/)).toBeInTheDocument();
    expect(screen.getByText(/Every day · Due today/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Add action \d of 8$/ })).toHaveLength(5);
  });

  it('flips optimistically and keeps the new state on success', async () => {
    const user = userEvent.setup();
    const e = exec();
    let resolve!: (v: unknown) => void;
    e.completeAction.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const goal = sampleGoal();
    render(<KeyAreaView goal={goal} position={2} today={TODAY} matrix={mat()} execution={e} onError={vi.fn()} />);
    const circle = screen.getByRole('button', { name: 'Buy shoes' });
    expect(circle).toHaveAttribute('aria-pressed', 'false');
    await user.click(circle);
    expect(circle).toHaveAttribute('aria-pressed', 'true'); // before the server answered
    expect(circle).toBeDisabled();
    resolve({ ok: true, data: { ...goal.outcomes[0]!.actions[2]!, completedAt: '2026-03-01T10:00:00.000Z' } });
    await waitFor(() => expect(circle).toBeEnabled());
    expect(circle).toHaveAttribute('aria-pressed', 'true');
  });

  it('rolls back and reports via onError when the mutation fails', async () => {
    const user = userEvent.setup();
    const e = exec();
    e.completeAction.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'Server exploded' } });
    const onError = vi.fn();
    render(<KeyAreaView goal={sampleGoal()} position={2} today={TODAY} matrix={mat()} execution={e} onError={onError} />);
    const circle = screen.getByRole('button', { name: 'Buy shoes' });
    await user.click(circle);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Server exploded'));
    expect(circle).toHaveAttribute('aria-pressed', 'false');
    expect(circle).toBeEnabled();
  });

  it('rolls back a completed task when reopen throws', async () => {
    const user = userEvent.setup();
    const e = exec();
    e.reopenAction.mockRejectedValue(new Error('offline'));
    const onError = vi.fn();
    render(<KeyAreaView goal={sampleGoal()} position={2} today={TODAY} matrix={mat()} execution={e} onError={onError} />);
    const circle = screen.getByRole('button', { name: 'Run 5k' });
    expect(circle).toHaveAttribute('aria-pressed', 'true');
    await user.click(circle);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(circle).toHaveAttribute('aria-pressed', 'true');
  });

  it('checks a routine for today using the supplied date', async () => {
    const user = userEvent.setup();
    const e = exec();
    e.checkRoutine.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'nope' } });
    render(<KeyAreaView goal={sampleGoal()} position={2} today={TODAY} matrix={mat()} execution={e} onError={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Stretch' }));
    expect(e.checkRoutine).toHaveBeenCalledWith({ actionId: expect.any(String), date: TODAY });
  });

  it('blocks prev/next while the area editor is dirty and lets the user discard', async () => {
    const user = userEvent.setup();
    render(<KeyAreaView goal={sampleGoal()} position={2} today={TODAY} matrix={mat()} execution={exec()} onError={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Edit key area' }));
    await user.type(screen.getByLabelText('Key area title'), ' extra');
    const next = screen.getByRole('link', { name: 'Next key area (4)' });
    let prevented = false;
    document.addEventListener('click', (ev) => { if (ev.target === next || next.contains(ev.target as Node)) prevented = ev.defaultPrevented; });
    await user.click(next);
    expect(await screen.findByText(/unsaved changes/)).toBeInTheDocument();
    expect(prevented).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fitness' })).toBeInTheDocument();
  });

  it('one key area + one action is fully usable on an otherwise empty matrix', async () => {
    const user = userEvent.setup();
    const m = mat();
    const goal = mkGoal([mkOutcome(0, 'Solo')]);
    m.addAction.mockResolvedValue({ ok: true, data: {} });
    render(<KeyAreaView goal={goal} position={0} today={TODAY} matrix={m} execution={exec()} onError={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add action 1 of 8' }));
    await user.type(await screen.findByLabelText('Title'), 'First step');
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    await waitFor(() => expect(m.addAction).toHaveBeenCalledWith(expect.objectContaining({ outcomeId: uid(100), title: 'First step', kind: 'task' })));
  });
});
