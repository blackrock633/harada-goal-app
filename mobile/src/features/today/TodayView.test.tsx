import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { ExecutionMutations, FocusMutations } from '@/data/mutations';
import { TodayView } from './TodayView';
import { action, data, goal, item } from './fixtures';

const okFn = async ({ actionId }: { actionId: string }) => ({
  ok: true as const,
  data: action({ id: actionId, kind: actionId === 'r1' ? 'routine' : 'task', checkedToday: actionId === 'r1', title: { a1: 'Write chapter', a2: 'Other', r1: 'Stretch' }[actionId] ?? actionId }),
});
function muts(over: Partial<ExecutionMutations> = {}): ExecutionMutations {
  return { completeAction: jest.fn(okFn), reopenAction: jest.fn(okFn), checkRoutine: jest.fn(okFn), uncheckRoutine: jest.fn(okFn), ...over };
}
function fmuts(over: Partial<FocusMutations> = {}): FocusMutations {
  return { addToToday: jest.fn(okFn), removeFromToday: jest.fn(okFn), ...over };
}

type Res = Awaited<ReturnType<ExecutionMutations['completeAction']>>;
function deferred() {
  let resolve!: (v: Res) => void;
  const promise = new Promise<Res>((r) => { resolve = r; });
  return { promise, resolve };
}

/** Titles of checkbox rows in screen order. */
const checkboxNames = () => screen.getAllByRole('checkbox').map((c) => c.props.accessibilityLabel as string);

describe('TodayView', () => {
  it('shows the heading and count, and optimistically completes a task', async () => {
    const m = muts();
    await render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} />);
    expect(screen.getByRole('header', { name: 'Monday, October 19, 2026' })).toBeTruthy();
    expect(screen.getByText('0 of 2 done today')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Write chapter' }));
    expect(screen.getByRole('checkbox', { name: 'Reopen: Write chapter' })).toBeChecked();
    expect(m.completeAction).toHaveBeenCalledWith({ actionId: 'a1' });
    expect(screen.getByText('1 of 2 done today')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done today (1)' })).toBeTruthy();
  });

  it('rolls back exactly (same position) and reports the error on failure', async () => {
    const onError = jest.fn();
    const m = muts({ completeAction: jest.fn(async () => ({ ok: false as const, error: { code: 'NOT_FOUND' as const, message: 'Boom' } })) });
    await render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} onError={onError} />);
    // Fail the SECOND row so exact index restoration is observable.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Other' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Boom');
    expect(checkboxNames()).toEqual(['Complete: Write chapter', 'Complete: Other']);
    expect(onError).toHaveBeenCalledWith('Boom');
    expect(screen.getByText('0 of 2 done today')).toBeTruthy();
  });

  it('uses the friendly message for UNAVAILABLE', async () => {
    const onError = jest.fn();
    const m = muts({ completeAction: jest.fn(async () => ({ ok: false as const, error: { code: 'UNAVAILABLE' as const, message: 'raw' } })) });
    await render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} onError={onError} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Write chapter' }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('your input is kept'));
  });

  it('treats a thrown mutation as UNAVAILABLE and rolls back', async () => {
    const m = muts({ completeAction: jest.fn(async () => { throw new Error('net'); }) });
    await render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Write chapter' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Complete: Write chapter' })).not.toBeChecked();
  });

  it('routines use checkRoutine/uncheckRoutine with today', async () => {
    const m = muts();
    const routine = item({ id: 'r1', title: 'Stretch', kind: 'routine', schedule: { type: 'daily' }, dueToday: true });
    await render(<TodayView data={data({ next: [routine] })} mutations={m} focusMutations={fmuts()} />);
    expect(screen.getByText(/Every day/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Stretch' }));
    expect(m.checkRoutine).toHaveBeenCalledWith({ actionId: 'r1', date: '2026-10-19' });
    expect(m.completeAction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Reopen: Stretch' }));
    expect(m.uncheckRoutine).toHaveBeenCalledWith({ actionId: 'r1', date: '2026-10-19' });
    expect(await screen.findByRole('checkbox', { name: 'Complete: Stretch' })).toBeTruthy();
  });

  it('shows Saving… and busy while pending, and blocks a second mutation', async () => {
    const d = deferred();
    const m = muts({ completeAction: jest.fn(() => d.promise) });
    await render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Write chapter' }));
    expect(screen.getByText('Saving…')).toBeTruthy();
    const box = screen.getByRole('checkbox', { name: 'Reopen: Write chapter' });
    expect(box.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    await fireEvent.press(box);
    expect(m.reopenAction).not.toHaveBeenCalled();
    expect(m.completeAction).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve({ ok: true, data: action() }));
    expect(screen.queryByText('Saving…')).toBeNull();
  });

  it('applies data that arrives mid-write once the write settles', async () => {
    const d = deferred();
    const m = muts({ completeAction: jest.fn(() => d.promise) });
    const view = await render(<TodayView data={data()} mutations={m} focusMutations={fmuts()} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Write chapter' }));
    const fresh = data({
      next: [item({ id: 'a2', title: 'Other' }), item({ id: 'a3', title: 'Newly due' })],
      doneToday: [item({ completedAt: '2026-10-19T10:00:00Z' })],
    });
    await view.rerender(<TodayView data={fresh} mutations={m} focusMutations={fmuts()} />);
    expect(screen.queryByText('Newly due')).toBeNull();
    await act(async () => d.resolve({ ok: true, data: action({ completedAt: '2026-10-19T10:00:00Z' }) }));
    expect(await screen.findByText('Newly due')).toBeTruthy();
  });

  it('flags overdue first with text and wraps long titles', async () => {
    const long = 'x'.repeat(160);
    await render(
      <TodayView
        data={data({ next: [item({ title: long }), item({ id: 'a2', title: 'Late one', dueDate: '2026-10-18' }, true)] })}
        mutations={muts()}
        focusMutations={fmuts()}
      />,
    );
    expect(checkboxNames()[0]).toBe('Complete: Late one');
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Due Yesterday')).toBeTruthy();
    expect(screen.getByText(long)).toBeTruthy();
    expect(screen.getAllByText('Goal · Area').length).toBe(2);
  });

  it('row body press opens the action key area', async () => {
    const onOpenAction = jest.fn();
    await render(<TodayView data={data()} mutations={muts()} focusMutations={fmuts()} onOpenAction={onOpenAction} />);
    await fireEvent.press(screen.getAllByRole('link')[0]!);
    expect(onOpenAction).toHaveBeenCalledWith('g1', 3);
  });

  it('adds to focus, removes, and rolls back a failed add', async () => {
    const f = fmuts();
    await render(<TodayView data={data()} mutations={muts()} focusMutations={f} />);
    expect(screen.getByText('0 of 5 picked')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add to today: Write chapter' }));
    expect(f.addToToday).toHaveBeenCalledWith({ actionId: 'a1', date: '2026-10-19' });
    expect(screen.getByText('1 of 5 picked')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Remove from today: Write chapter' }));
    expect(f.removeFromToday).toHaveBeenCalledWith({ actionId: 'a1', date: '2026-10-19' });
    expect(await screen.findByText('0 of 5 picked')).toBeTruthy();
    expect(checkboxNames()).toEqual(['Complete: Write chapter', 'Complete: Other']);
  });

  it('failed add restores the row and shows the message', async () => {
    const onError = jest.fn();
    const f = fmuts({ addToToday: jest.fn(async () => ({ ok: false as const, error: { code: 'LIMIT_REACHED' as const, message: 'Focus is full' } })) });
    await render(<TodayView data={data()} mutations={muts()} focusMutations={f} onError={onError} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Add to today: Other' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Focus is full');
    expect(onError).toHaveBeenCalledWith('Focus is full');
    expect(screen.getByText('0 of 5 picked')).toBeTruthy();
    expect(checkboxNames()).toEqual(['Complete: Write chapter', 'Complete: Other']);
  });

  it('disables add with a visible reason at 5 picked', async () => {
    const picked = [1, 2, 3, 4, 5].map((n) => item({ id: `f${n}`, title: `Pick ${n}`, focusedToday: true }));
    await render(<TodayView data={data({ focus: picked })} mutations={muts()} focusMutations={fmuts()} />);
    expect(screen.getByText('5 of 5 picked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add to today: Write chapter' }).props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/Remove one to add another/)).toBeTruthy();
  });

  it('Done today is collapsible and reopen works', async () => {
    const m = muts();
    const done = item({ id: 'd1', title: 'Finished', completedAt: '2026-10-19T08:00:00Z' });
    await render(<TodayView data={data({ doneToday: [done] })} mutations={m} focusMutations={fmuts()} />);
    const toggle = screen.getByRole('button', { name: 'Done today (1)' });
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(toggle);
    expect(screen.queryByRole('checkbox', { name: 'Reopen: Finished' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done today (1)' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Reopen: Finished' }));
    expect(m.reopenAction).toHaveBeenCalledWith({ actionId: 'd1' });
  });

  describe('empty states', () => {
    it('first goal CTA', async () => {
      const onCreateGoal = jest.fn();
      await render(<TodayView data={data({ next: [], goals: [], hasAnyGoals: false })} mutations={muts()} focusMutations={fmuts()} onCreateGoal={onCreateGoal} />);
      await fireEvent.press(screen.getByRole('button', { name: 'Set your first goal' }));
      expect(onCreateGoal).toHaveBeenCalled();
    });
    it('nothing due points to the matrix', async () => {
      const onOpenMatrix = jest.fn();
      await render(<TodayView data={data({ next: [] })} mutations={muts()} focusMutations={fmuts()} onOpenMatrix={onOpenMatrix} />);
      expect(screen.getByText(/Nothing scheduled today/)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Open the matrix' }));
      expect(onOpenMatrix).toHaveBeenCalledWith('g1');
    });
    it('drafts prompt activation', async () => {
      const onOpenGoal = jest.fn();
      await render(
        <TodayView data={data({ next: [], goals: [], draftGoals: [goal({ id: 'd1', title: 'Draft one', status: 'draft' })] })} mutations={muts()} focusMutations={fmuts()} onOpenGoal={onOpenGoal} />,
      );
      expect(screen.getByText(/"Draft one" is still a draft/)).toBeTruthy();
      await fireEvent.press(screen.getByRole('button', { name: 'Open goal' }));
      expect(onOpenGoal).toHaveBeenCalledWith('d1');
    });
  });

  describe('ActiveGoalsPanel', () => {
    it('shows counts, no merged percentage, and hides unknown pace', async () => {
      await render(<TodayView data={data()} mutations={muts()} focusMutations={fmuts()} />);
      expect(screen.getByText('2 due today')).toBeTruthy();
      expect(screen.getByText('1 of 4 tasks done')).toBeTruthy();
      expect(screen.getByText('10/72 planned')).toBeTruthy();
      expect(screen.queryByText(/by measures/)).toBeNull();
      expect(screen.queryByText(/%/)).toBeNull();
      expect(screen.queryByRole('progressbar')).toBeNull();
    });
    it('shows pace by measures and omits task counts with no tasks', async () => {
      const g = goal({ pace: 'behind', metrics: { ...goal().metrics, totalTasks: 0, completedTasks: 0, attainment: 0.4 } });
      await render(<TodayView data={data({ goals: [g] })} mutations={muts()} focusMutations={fmuts()} />);
      expect(screen.getByText('Behind (by measures)')).toBeTruthy();
      expect(screen.queryByText(/tasks done/)).toBeNull();
    });
  });
});
