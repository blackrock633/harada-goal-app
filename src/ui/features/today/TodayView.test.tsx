// @vitest-environment jsdom
import React from 'react';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionDTO, GoalSummaryDTO, NextItemDTO, TodayDTO } from '@/application/dto';
import type { ExecutionMutations, FocusMutations } from '@/ui/actions';
import { TodayView } from './TodayView';

afterEach(cleanup);

function action(over: Partial<ActionDTO> = {}): ActionDTO {
  return {
    id: 'a1', goalId: 'g1', outcomeId: 'o1', title: 'Write chapter', notes: '', kind: 'task', position: 0,
    dueDate: null, completedAt: null, schedule: null, startDate: null, archivedAt: null,
    createdAt: '', updatedAt: '', progress: 0, dueToday: false, checkedToday: false, streak: 0, focusedToday: false, recentChecks: [],
    ...over,
  };
}
function item(over: Partial<ActionDTO> = {}, overdue = false): NextItemDTO {
  return { action: action(over), goalId: 'g1', goalTitle: 'Goal', outcomeId: 'o1', outcomeTitle: 'Area', outcomePosition: 3, overdue };
}
function goal(over: Partial<GoalSummaryDTO> = {}): GoalSummaryDTO {
  return {
    id: 'g1', title: 'Run a marathon', status: 'active', targetDate: null, activatedOn: null, updatedAt: '',
    metrics: { planning: { filled: 10, total: 72, ratio: 10 / 72 }, taskCompletion: 0.25, completedTasks: 1, totalTasks: 4, routineAdherence: null, routineCount: 1, attainment: null },
    pace: 'unknown', outcomeCount: 1, actionCount: 2, openTaskCount: 1, dueTodayCount: 2, lastReflectedOn: null, completedThisWeek: 0,
    ...over,
  };
}
function data(over: Partial<TodayDTO> = {}): TodayDTO {
  return { today: '2026-10-19', focus: [], next: [item(), item({ id: 'a2', title: 'Other' })], doneToday: [], goals: [goal()], draftGoals: [], hasAnyGoals: true, ...over };
}
function muts(over: Partial<ExecutionMutations> = {}): ExecutionMutations {
  const okFn = async ({ actionId }: { actionId: string }) => ({
    ok: true as const,
    data: action({ id: actionId, kind: actionId === 'r1' ? 'routine' : 'task', schedule: actionId === 'r1' ? { type: 'daily' } : null, title: { a1: 'Write chapter', a2: 'Other', r1: 'Stretch' }[actionId] }),
  });
  return { completeAction: vi.fn(okFn), reopenAction: vi.fn(okFn), checkRoutine: vi.fn(okFn), uncheckRoutine: vi.fn(okFn), ...over };
}
function fmuts(over: Partial<FocusMutations> = {}): FocusMutations {
  const ok = async ({ actionId }: { actionId: string }) => ({ ok: true as const, data: action({ id: actionId }) });
  return { addToToday: vi.fn(ok), removeFromToday: vi.fn(ok), ...over };
}
const focusList = () => screen.getByRole('region', { name: "Today's focus" });
const nextList = () => screen.getByRole('region', { name: 'Next up' });

describe('TodayView', () => {
  it('optimistically moves a task to Done today and keeps it on success', async () => {
    const m = muts();
    render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Write chapter' }));
    expect(within(nextList()).queryByText('Write chapter')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reopen: Write chapter' })).toHaveAttribute('aria-pressed', 'true');
    expect(m.completeAction).toHaveBeenCalledWith({ actionId: 'a1' });
    expect(screen.getByText('1 of 2 done today')).toBeTruthy();
  });

  it('rolls back and reports the error on failure', async () => {
    const onError = vi.fn();
    const m = muts({ completeAction: vi.fn(async () => ({ ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'Boom' } })) });
    render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} onError={onError} />);
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
    const { rerender } = render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Write chapter' }));
    // EXEC-01: an unconfirmed write is visibly marked, not shown as settled.
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Saving…');
    // Revalidated server data lands while the mutation is still pending.
    const fresh = data({
      next: [item({ id: 'a2', title: 'Other' }), item({ id: 'a3', title: 'Newly due' })],
      doneToday: [item({ completedAt: '2026-10-19T10:00:00Z' })],
    });
    rerender(<TodayView data={fresh} mutations={m} focusMutations={fmuts()} />);
    expect(within(nextList()).queryByText('Newly due')).toBeNull();
    resolve({ ok: true, data: action({ completedAt: '2026-10-19T10:00:00Z' }) });
    await waitFor(() => expect(within(nextList()).getByText('Newly due')).toBeTruthy());
  });

  it('uses checkRoutine with today and uncheckRoutine on reopen', async () => {
    const m = muts();
    const routine = item({ id: 'r1', title: 'Stretch', kind: 'routine', schedule: { type: 'daily' }, dueToday: true });
    render(<TodayView data={data({ next: [routine] })} mutations={m} focusMutations={fmuts()} />);
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
    render(<TodayView data={data({ doneToday: [] })} mutations={m} focusMutations={fmuts()} />);
    const btn = screen.getByRole('button', { name: 'Complete: Write chapter' });
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole('button', { name: 'Reopen: Write chapter' }));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(m.reopenAction).not.toHaveBeenCalled();
    resolve({ ok: true, data: action() });
  });

  it('sorts overdue first and flags with text', () => {
    render(<TodayView data={data({ next: [item(), item({ id: 'a2', title: 'Late one' }, true)] })} mutations={muts()} focusMutations={fmuts()} />);
    const rows = within(nextList()).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Late one');
    expect(rows[0]).toHaveTextContent('Overdue');
  });

  it('renders long titles and links to the key area via outcomePosition', () => {
    const long = 'x'.repeat(160);
    render(<TodayView data={data({ next: [item({ title: long })] })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText(long)).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(long) })).toHaveAttribute('href', '/matrix/3?goal=g1');
  });

  it('shows empty states', () => {
    const { rerender } = render(<TodayView data={data({ next: [], goals: [], hasAnyGoals: false })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByRole('link', { name: 'Set your first goal' })).toHaveAttribute('href', '/goal/new');
    rerender(<TodayView data={data({ next: [], goals: [goal()] })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText(/Nothing scheduled today/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the matrix' })).toHaveAttribute('href', '/matrix?goal=g1');
    rerender(<TodayView data={data({ next: [], goals: [], draftGoals: [goal({ id: 'd1', status: 'draft' })] })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByRole('link', { name: 'Open goal' })).toHaveAttribute('href', '/goal?goal=d1');
  });

  it('rolls back with the UNAVAILABLE message', async () => {
    const onError = vi.fn();
    const m = muts({ completeAction: vi.fn(async () => ({ ok: false as const, error: { code: 'UNAVAILABLE' as const, message: 'raw' } })) });
    render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Write chapter' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't reach the server"));
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('your input is kept'));
    expect(within(nextList()).getByText('Write chapter')).toBeTruthy();
  });

  it('active goals panel shows task counts and plan, and hides pace when unknown', () => {
    render(<TodayView data={data()} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText('2 due today')).toBeTruthy();
    expect(screen.getByText('1 of 4 tasks done')).toBeTruthy();
    expect(screen.getByText('10/72 planned')).toBeTruthy();
    expect(screen.queryByText(/by measures/)).toBeNull();
    expect(within(screen.getByRole('complementary', { name: 'Active goals' })).queryByText(/%/)).toBeNull();
  });

  it('shows pace labelled by measures when known, and omits task counts with no tasks', () => {
    const g = goal({ pace: 'behind', metrics: { ...goal().metrics, totalTasks: 0, completedTasks: 0, attainment: 0.4 } });
    render(<TodayView data={data({ goals: [g] })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText('Behind (by measures)')).toBeTruthy();
    expect(screen.queryByText(/tasks done/)).toBeNull();
  });

  it('add moves the row into focus and calls addToToday', async () => {
    const f = fmuts();
    render(<TodayView data={data()} mutations={muts()} focusMutations={f} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to today: Write chapter' }));
    expect(within(focusList()).getByText('Write chapter')).toBeTruthy();
    expect(within(nextList()).queryByText('Write chapter')).toBeNull();
    expect(f.addToToday).toHaveBeenCalledWith({ actionId: 'a1', date: '2026-10-19' });
    expect(screen.getByText('1 of 5 picked')).toBeTruthy();
  });

  it('add failure rolls back and shows the message', async () => {
    const onError = vi.fn();
    const f = fmuts({ addToToday: vi.fn(async () => ({ ok: false as const, error: { code: 'LIMIT_REACHED' as const, message: 'Focus is full' } })) });
    render(<TodayView data={data()} mutations={muts()} focusMutations={f} onError={onError} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add to today: Write chapter' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Focus is full'));
    expect(onError).toHaveBeenCalledWith('Focus is full');
    const rows = within(nextList()).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Write chapter');
    expect(screen.queryByRole('region', { name: "Today's focus" })?.textContent).not.toContain('Write chapter');
  });

  it('disables add with a visible reason when 5 are picked', () => {
    const picked = [1, 2, 3, 4, 5].map((n) => item({ id: `f${n}`, title: `Pick ${n}`, focusedToday: true }));
    render(<TodayView data={data({ focus: picked })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText('5 of 5 picked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to today: Write chapter' })).toBeDisabled();
    expect(screen.getByText(/Remove one to add another/)).toBeTruthy();
  });

  it('remove returns the row to Next up', async () => {
    const f = fmuts();
    const d = data({ focus: [item({ id: 'a1', focusedToday: true })], next: [item({ id: 'a2', title: 'Other' })] });
    render(<TodayView data={d} mutations={muts()} focusMutations={f} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove from today: Write chapter' }));
    expect(within(nextList()).getByText('Write chapter')).toBeTruthy();
    expect(f.removeFromToday).toHaveBeenCalledWith({ actionId: 'a1', date: '2026-10-19' });
  });

  it('completing a focus item keeps it in focus as done', async () => {
    const m = muts({ completeAction: vi.fn(async ({ actionId }: { actionId: string }) => ({ ok: true as const, data: action({ id: actionId, completedAt: '2026-10-19T10:00:00Z', focusedToday: true }) })) });
    const d = data({ focus: [item({ id: 'a1', focusedToday: true })], next: [item({ id: 'a2', title: 'Other' })] });
    render(<TodayView data={d} mutations={m} focusMutations={fmuts()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Complete: Write chapter' }));
    expect(m.completeAction).toHaveBeenCalledWith({ actionId: 'a1' });
    expect(within(focusList()).getByRole('button', { name: 'Reopen: Write chapter' })).toBeTruthy();
    expect(screen.queryByText(/Done today \(/)).toBeNull();
    expect(screen.getByText('1 of 2 done today')).toBeTruthy();
  });

  it('progress counts focus, next and done items', () => {
    const d = data({
      focus: [item({ id: 'f1', title: 'F1', completedAt: '2026-10-19T09:00:00Z', focusedToday: true }), item({ id: 'f2', title: 'F2', kind: 'routine', checkedToday: true, schedule: { type: 'daily' }, focusedToday: true }), item({ id: 'f3', title: 'F3', focusedToday: true })],
      next: [item({ id: 'n1', title: 'N1' })],
      doneToday: [item({ id: 'd1', title: 'D1', completedAt: '2026-10-19T08:00:00Z' })],
    });
    render(<TodayView data={d} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText('3 of 5 done today')).toBeTruthy();
  });

  it('empty state with active goals invites picking from the matrix', () => {
    render(<TodayView data={data({ next: [] })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText('Nothing scheduled today. Pick up to 5 actions from your matrix to focus on.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the matrix' })).toHaveAttribute('href', '/matrix?goal=g1');
  });
});
