// @vitest-environment jsdom
import React from 'react';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionDTO, GoalSummaryDTO, NextItemDTO, TodayDTO } from '@/application/dto';
import type { ExecutionMutations } from '@/ui/actions';
import { TodayView } from './TodayView';

afterEach(cleanup);

function action(over: Partial<ActionDTO> = {}): ActionDTO {
  return {
    id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'Write chapter', notes: '', kind: 'task', position: 0,
    dueDate: null, completedAt: null, schedule: null, startDate: null, archivedAt: null,
    createdAt: '', updatedAt: '', progress: 0, dueToday: false, checkedToday: false, streak: 0, recentChecks: [],
    ...over,
  };
}
function item(over: Partial<ActionDTO> = {}, overdue = false): NextItemDTO {
  return { action: action(over), goalId: 'g1', goalTitle: 'Goal', outcomeId: 'o1', outcomeTitle: 'Area', overdue };
}
function goal(over: Partial<GoalSummaryDTO> = {}): GoalSummaryDTO {
  return {
    id: 'g1', title: 'Run a marathon', status: 'active', targetDate: null, activatedOn: null, updatedAt: '',
    progress: 0.5, pace: 'behind', outcomeCount: 1, actionCount: 2, openTaskCount: 1, dueTodayCount: 2, lastReflectedOn: null,
    ...over,
  };
}
function data(over: Partial<TodayDTO> = {}): TodayDTO {
  return { today: '2026-10-19', next: [item(), item({ id: 'a2', title: 'Other' })], doneToday: [], goals: [goal()], draftGoals: [], hasAnyGoals: true, ...over };
}
function muts(over: Partial<ExecutionMutations> = {}): ExecutionMutations {
  const okFn = async ({ actionId }: { actionId: string }) => ({
    ok: true as const,
    data: action({ id: actionId, kind: actionId === 'r1' ? 'routine' : 'task', schedule: actionId === 'r1' ? { type: 'daily' } : null, title: { a1: 'Write chapter', a2: 'Other', r1: 'Stretch' }[actionId] }),
  });
  return { completeAction: vi.fn(okFn), reopenAction: vi.fn(okFn), checkRoutine: vi.fn(okFn), uncheckRoutine: vi.fn(okFn), ...over };
}
const nextList = () => screen.getByRole('region', { name: 'Next up' });

describe('TodayView', () => {
  it('optimistically moves a task to Done today and keeps it on success', async () => {
    const m = muts();
    render(<TodayView data={data()} mutations={m} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Write chapter' }));
    expect(within(nextList()).queryByText('Write chapter')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reopen: Write chapter' })).toHaveAttribute('aria-pressed', 'true');
    expect(m.completeAction).toHaveBeenCalledWith({ actionId: 'a1' });
    expect(screen.getByText('1 of 2 done today')).toBeTruthy();
  });

  it('rolls back and reports the error on failure', async () => {
    const onError = vi.fn();
    const m = muts({ completeAction: vi.fn(async () => ({ ok: false as const, error: { code: 'INTERNAL' as const, message: 'Boom' } })) });
    render(<TodayView data={data()} mutations={m} onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Write chapter' }));
    await waitFor(() => expect(within(nextList()).getByText('Write chapter')).toBeTruthy());
    const titles = within(nextList()).getAllByRole('listitem').map((li) => li.textContent);
    expect(titles[0]).toContain('Write chapter');
    expect(onError).toHaveBeenCalledWith('Boom');
    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
  });

  it('applies server data that arrives while a toggle is in flight once it settles', async () => {
    type Res = Awaited<ReturnType<ExecutionMutations['completeAction']>>;
    let resolve!: (v: Res) => void;
    const m = muts({ completeAction: vi.fn(() => new Promise<Res>((r) => { resolve = r; })) });
    const { rerender } = render(<TodayView data={data()} mutations={m} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Write chapter' }));
    // Revalidated server data lands while the mutation is still pending.
    const fresh = data({
      next: [item({ id: 'a2', title: 'Other' }), item({ id: 'a3', title: 'Newly due' })],
      doneToday: [item({ completedAt: '2026-10-19T10:00:00Z' })],
    });
    rerender(<TodayView data={fresh} mutations={m} />);
    expect(within(nextList()).queryByText('Newly due')).toBeNull();
    resolve({ ok: true, data: action({ completedAt: '2026-10-19T10:00:00Z' }) });
    await waitFor(() => expect(within(nextList()).getByText('Newly due')).toBeTruthy());
  });

  it('uses checkRoutine with today and uncheckRoutine on reopen', async () => {
    const m = muts();
    const routine = item({ id: 'r1', title: 'Stretch', kind: 'routine', schedule: { type: 'daily' }, dueToday: true });
    render(<TodayView data={data({ next: [routine] })} mutations={m} />);
    expect(screen.getByText(/Every day/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Stretch' }));
    expect(m.checkRoutine).toHaveBeenCalledWith({ actionId: 'r1', date: '2026-10-19' });
    await userEvent.click(screen.getByRole('button', { name: 'Reopen: Stretch' }));
    expect(m.uncheckRoutine).toHaveBeenCalledWith({ actionId: 'r1', date: '2026-10-19' });
    await waitFor(() => expect(within(nextList()).getByText('Stretch')).toBeTruthy());
  });

  it('blocks double taps while pending', async () => {
    let resolve!: (v: unknown) => void;
    const complete = vi.fn(() => new Promise((r) => { resolve = r; }));
    const m = muts({ completeAction: complete as unknown as ExecutionMutations['completeAction'] });
    render(<TodayView data={data({ doneToday: [] })} mutations={m} />);
    const btn = screen.getByRole('button', { name: 'Complete: Write chapter' });
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole('button', { name: 'Reopen: Write chapter' }));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(m.reopenAction).not.toHaveBeenCalled();
    resolve({ ok: true, data: action() });
  });

  it('sorts overdue first and flags with text', () => {
    render(<TodayView data={data({ next: [item(), item({ id: 'a2', title: 'Late one' }, true)] })} mutations={muts()} />);
    const rows = within(nextList()).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Late one');
    expect(rows[0]).toHaveTextContent('Overdue');
  });

  it('renders long titles and links to the key area when position is known', () => {
    const long = 'x'.repeat(160);
    render(<TodayView data={data({ next: [item({ title: long })] })} mutations={muts()} outcomePositions={{ o1: 3 }} />);
    expect(screen.getByText(long)).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(long) })).toHaveAttribute('href', '/matrix/3?goal=g1');
  });

  it('shows empty states', () => {
    const { rerender } = render(<TodayView data={data({ next: [], goals: [], hasAnyGoals: false })} mutations={muts()} />);
    expect(screen.getByRole('link', { name: 'Set your first goal' })).toHaveAttribute('href', '/goal/new');
    rerender(<TodayView data={data({ next: [], goals: [goal()] })} mutations={muts()} />);
    expect(screen.getByText('Nothing due today')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the matrix' })).toHaveAttribute('href', '/matrix?goal=g1');
    rerender(<TodayView data={data({ next: [], goals: [], draftGoals: [goal({ id: 'd1', status: 'draft' })] })} mutations={muts()} />);
    expect(screen.getByRole('link', { name: 'Open goal' })).toHaveAttribute('href', '/goal?goal=d1');
  });

  it('active goals panel shows no progress or pace', () => {
    render(<TodayView data={data()} mutations={muts()} />);
    expect(screen.getByText('2 due today')).toBeTruthy();
    expect(screen.queryByText('Behind')).toBeNull();
    expect(screen.queryByText('50%')).toBeNull();
  });
});
