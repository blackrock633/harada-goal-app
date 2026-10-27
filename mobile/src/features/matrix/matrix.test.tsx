import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { fail, ok } from '@shared/application/result';

import { KeyAreaView, type KeyAreaViewProps } from './KeyAreaView';
import { MatrixOverview } from './MatrixOverview';
import { MatrixSheet } from './MatrixSheet';
import { buildMatrix } from '@shared/application/matrix';
import { mkAction, mkGoal, mkOutcome, sampleGoal } from './test-fixtures';

const TODAY = '2026-03-01';

const mockSuggestActions = jest.fn();
const mockSuggestAreas = jest.fn();
jest.mock('@/data/premium', () => ({
  ...jest.requireActual('@/data/premium'),
  suggestActions: (...a: unknown[]) => mockSuggestActions(...a),
  suggestAreas: (...a: unknown[]) => mockSuggestAreas(...a),
  track: jest.fn(),
}));

type Input = Record<string, unknown> & { id?: string; position?: number; outcomeId?: string };
const mutation = () => jest.fn<Promise<unknown>, [Input]>();

async function setup(over: Partial<KeyAreaViewProps> = {}) {
  const matrix = { addOutcome: mutation(), updateOutcome: mutation(), addAction: mutation(), updateAction: mutation() };
  const execution = { completeAction: mutation(), reopenAction: mutation(), checkRoutine: mutation(), uncheckRoutine: mutation() };
  const focus = { addToToday: mutation(), removeFromToday: mutation() };
  const props = {
    onNavigate: jest.fn(),
    onError: jest.fn(),
    onChanged: jest.fn(),
    onReloadLatest: jest.fn(),
  };
  const goal = sampleGoal();
  const utils = await render(
    <KeyAreaView goal={goal} position={2} today={TODAY} matrix={matrix as never} execution={execution as never} focus={focus as never} {...props} {...over} />,
  );
  return { matrix, execution, focus, props, goal: over.goal ?? goal, ...utils };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('matrix structure', () => {
  it('overview has 8 key area tiles around the goal and an honest completeness line', async () => {
    const onOpenArea = jest.fn();
    await render(<MatrixOverview goal={sampleGoal()} onOpenArea={onOpenArea} />);
    expect(screen.getByLabelText('Goal: Run a marathon')).toBeOnTheScreen();
    expect(screen.getAllByText(/^[1-8]$/)).toHaveLength(8); // position numbers
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(screen.getAllByRole('button', { name: /^Add key area \d$/ })).toHaveLength(6);
    const c = within(screen.getByTestId('completeness'));
    expect(c.getByText('5 of 72 positions planned')).toBeOnTheScreen();
    expect(c.getByText('2 of 8 key areas · 3 of 64 actions')).toBeOnTheScreen();
    expect(c.getByText('1 of 2 tasks done')).toBeOnTheScreen();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByText('3/8')).toBeOnTheScreen();
  });

  it('overview tiles navigate by position', async () => {
    const onOpenArea = jest.fn();
    await render(<MatrixOverview goal={sampleGoal()} onOpenArea={onOpenArea} />);
    await fireEvent.press(screen.getByRole('button', { name: /^Key area 3: Fitness/ }));
    expect(onOpenArea).toHaveBeenLastCalledWith(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Add key area 1' }));
    expect(onOpenArea).toHaveBeenLastCalledWith(0);
  });

  it('key area view shows exactly 8 slot rows with filled and empty labels', async () => {
    await setup();
    for (const p of [0, 1, 4]) expect(screen.getByTestId(`slot-2-${p}`)).toBeOnTheScreen(); // placed actions
    expect(screen.queryByTestId('slot-2-2')).toBeNull(); // open positions are not rows
    expect(screen.queryByTestId('slot-2-8')).toBeNull();
    // One quiet "Add action" row opens the first free position (3 here: 1, 2 and 5 are taken).
    expect(screen.getAllByRole('button', { name: /^Add action \d of 8$/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add action 3 of 8' })).toBeOnTheScreen();
    expect(screen.getByText('5 of 8 positions open')).toBeOnTheScreen();
    expect(screen.getByText('1 of 2 tasks done', { exact: false })).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Reopen: Run 5k' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Complete: Buy shoes' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: "Today's focus: Run 5k" })).not.toBeChecked();
  });

  it('plannable positions are 72 = 8 + 64', async () => {
    const goal = mkGoal(Array.from({ length: 8 }, (_, i) => mkOutcome(i, `Area ${i}`)));
    await render(<MatrixOverview goal={goal} onOpenArea={jest.fn()} />);
    expect(screen.getByText('8 of 72 positions planned')).toBeOnTheScreen();
  });
});

describe('adding actions', () => {
  it('passes position and a client id that is stable across a retry after UNAVAILABLE', async () => {
    const { matrix, props } = await setup();
    matrix.addAction
      .mockResolvedValueOnce(fail('UNAVAILABLE', 'offline'))
      .mockResolvedValueOnce(ok(mkAction({ n: 9, position: 2, title: 'Swim' })));
    await fireEvent.press(screen.getByRole('button', { name: 'Add action 3 of 8' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Swim');
    await fireEvent.press(screen.getByRole('button', { name: 'Add action' }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Swim')).toBeOnTheScreen(); // input kept
    await fireEvent.press(screen.getByRole('button', { name: 'Add action' }));
    expect(matrix.addAction).toHaveBeenCalledTimes(2);
    const [a, b] = matrix.addAction.mock.calls.map((c) => c[0]);
    expect(a.position).toBe(2);
    expect(a.outcomeId).toBe(sampleGoal().matrix.outcomes[2]!.id);
    expect(a.id).toEqual(expect.any(String));
    expect(b.id).toBe(a.id);
    await screen.findByText('Key area 3 of 8');
    expect(props.onChanged).toHaveBeenCalled();
  });

  it('a new create gets a new client id', async () => {
    const { matrix } = await setup();
    matrix.addAction.mockResolvedValue(ok(mkAction({ n: 9, position: 2 })));
    const ids: string[] = [];
    for (const label of ['Add action 3 of 8', 'Add action 3 of 8']) {
      await fireEvent.press(screen.getByRole('button', { name: label }));
      await fireEvent.changeText(screen.getByLabelText('Title'), 'x');
      await fireEvent.press(screen.getByRole('button', { name: 'Add action' }));
      await act(async () => {});
      ids.push(String(matrix.addAction.mock.calls.at(-1)![0].id));
    }
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('validates with the shared schema, shows the error under the field and does not call', async () => {
    const { matrix } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Add action 3 of 8' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add action' }));
    expect(await screen.findByRole('alert')).toBeOnTheScreen();
    expect(matrix.addAction).not.toHaveBeenCalled();
  });

  it('long titles and notes do not break the editor (counter and notes error)', async () => {
    const { matrix } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Add action 3 of 8' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'x'.repeat(161));
    await fireEvent.changeText(screen.getByLabelText('Notes'), 'n'.repeat(2001));
    await fireEvent.press(screen.getByRole('button', { name: 'Add action' }));
    expect(await screen.findAllByRole('alert')).toHaveLength(2); // title and notes errors, under their fields
    expect(screen.getByDisplayValue('x'.repeat(161))).toBeOnTheScreen(); // input kept
    expect(matrix.addAction).not.toHaveBeenCalled();
  });

  it('routine schedule sends weekdays; due date field uses the numeric punctuation keyboard', async () => {
    const { matrix } = await setup();
    matrix.addAction.mockResolvedValue(ok(mkAction({ n: 9, position: 2 })));
    await fireEvent.press(screen.getByRole('button', { name: 'Add action 3 of 8' }));
    // A date is picked, never typed: the due date is a DateField, not a text input.
    expect(screen.getByRole('button', { name: 'Due date (optional): not set' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Routine' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Specific weekdays' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Wed' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Mon' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Lift');
    await fireEvent.press(screen.getByRole('button', { name: 'Add action' }));
    await act(async () => {});
    expect(matrix.addAction.mock.calls[0]![0]).toMatchObject({
      kind: 'routine',
      schedule: { type: 'weekdays', days: [1, 3] },
      dueDate: null,
    });
  });
});

describe('editing actions', () => {
  it('sends expectedUpdatedAt', async () => {
    const { matrix } = await setup();
    matrix.updateAction.mockResolvedValue(ok(mkAction({ n: 1, position: 4, title: 'Run 10k' })));
    await fireEvent.press(screen.getByRole('button', { name: 'Edit action 5 of 8: Run 5k' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'Run 10k');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await act(async () => {});
    expect(matrix.updateAction).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Run 10k', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' }),
    );
  });

  it('CONFLICT keeps the input and offers Reload latest', async () => {
    const { matrix, props } = await setup();
    matrix.updateAction.mockResolvedValue(fail('CONFLICT', 'Changed on another device.'));
    await fireEvent.press(screen.getByRole('button', { name: 'Edit action 5 of 8: Run 5k' }));
    await fireEvent.changeText(screen.getByLabelText('Title'), 'My edit');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Changed on another device.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('My edit')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Reload latest' }));
    expect(props.onReloadLatest).toHaveBeenCalledTimes(1);
  });

  it('submit is busy and disabled while pending, and cannot double-submit', async () => {
    const { matrix } = await setup();
    const d = deferred<ReturnType<typeof ok>>();
    matrix.updateAction.mockReturnValue(d.promise);
    await fireEvent.press(screen.getByRole('button', { name: 'Edit action 5 of 8: Run 5k' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeBusy();
    expect(save).toBeDisabled();
    await fireEvent.press(save);
    expect(matrix.updateAction).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(ok(mkAction({ n: 1, position: 4 }))));
  });
});

describe('key area editing and creation', () => {
  it('creates a key area with position and a stable id across a retry', async () => {
    const { matrix } = await setup({ position: 0 });
    matrix.addOutcome.mockResolvedValueOnce(fail('UNAVAILABLE', 'x')).mockResolvedValueOnce(ok(mkOutcome(0, 'Health')));
    await fireEvent.press(screen.getByRole('button', { name: 'Add key area 1' }));
    await fireEvent.changeText(screen.getByLabelText('Key area title'), 'Health');
    await fireEvent.press(screen.getByRole('button', { name: 'Create key area' }));
    await screen.findByText(/Couldn't reach the server/);
    await fireEvent.press(screen.getByRole('button', { name: 'Create key area' }));
    await act(async () => {});
    const [a, b] = matrix.addOutcome.mock.calls.map((c) => c[0]);
    expect(a).toMatchObject({ position: 0, title: 'Health', goalId: sampleGoal().id });
    expect(b.id).toBe(a.id);
  });

  it('edits with expectedUpdatedAt', async () => {
    const { matrix } = await setup();
    matrix.updateOutcome.mockResolvedValue(ok({ ...mkOutcome(2, 'Strength'), updatedAt: '2026-04-01T00:00:00.000Z' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Edit key area' }));
    await fireEvent.changeText(screen.getByLabelText('Key area title'), 'Strength');
    await fireEvent.press(screen.getByRole('button', { name: 'Save key area' }));
    await act(async () => {});
    expect(matrix.updateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Strength', expectedUpdatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(await screen.findByText('Strength')).toBeOnTheScreen();
  });

  it('blocks navigation while an editor is dirty, then discards or keeps editing', async () => {
    const { props } = await setup();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit key area' }));
    await fireEvent.changeText(screen.getByLabelText('Key area title'), 'Changed');
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next key area (4)' }));
    expect(props.onNavigate).not.toHaveBeenCalled();
    expect(screen.getByText(/unsaved changes to this key area/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByDisplayValue('Changed')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Previous key area (2)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Discard changes' }));
    expect(props.onNavigate).toHaveBeenCalledWith(1);
  });

  it('navigates freely when clean and wraps 0..7', async () => {
    const { props } = await setup({ position: 0 });
    await fireEvent.press(screen.getByRole('button', { name: 'Previous key area (8)' }));
    expect(props.onNavigate).toHaveBeenCalledWith(7);
    await fireEvent.press(screen.getByRole('button', { name: 'Next key area (2)' }));
    expect(props.onNavigate).toHaveBeenLastCalledWith(1);
  });
});

describe('optimistic toggles', () => {
  it('shows Saving… while pending, locks the action, and applies the server result', async () => {
    const { execution } = await setup();
    const d = deferred<ReturnType<typeof ok>>();
    execution.completeAction.mockReturnValue(d.promise);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Buy shoes' }));
    expect(screen.getByText('Saving…')).toBeOnTheScreen();
    const box = screen.getByRole('checkbox', { name: 'Reopen: Buy shoes' });
    expect(box).toBeChecked(); // optimistic
    expect(box).toBeBusy();
    await fireEvent.press(box);
    expect(execution.completeAction).toHaveBeenCalledTimes(1);
    expect(execution.reopenAction).not.toHaveBeenCalled();
    await act(async () => d.resolve(ok(mkAction({ n: 3, position: 1, title: 'Buy shoes', completedAt: '2026-03-01T00:00:00.000Z' }))));
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Reopen: Buy shoes' })).toBeChecked();
  });

  it('rolls back exactly and reports the error on failure', async () => {
    const { execution, props } = await setup();
    execution.completeAction.mockResolvedValue(fail('UNAVAILABLE', 'x'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Buy shoes' }));
    await act(async () => {});
    expect(screen.getByRole('checkbox', { name: 'Complete: Buy shoes' })).not.toBeChecked();
    expect(screen.queryByText('Saving…')).toBeNull();
    expect(props.onError).toHaveBeenCalledWith(expect.stringContaining("Couldn't reach the server"));
  });

  it('rolls back when the mutation throws', async () => {
    const { execution, props } = await setup();
    execution.reopenAction.mockRejectedValue(new Error('boom'));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Reopen: Run 5k' }));
    await act(async () => {});
    expect(screen.getByRole('checkbox', { name: 'Reopen: Run 5k' })).toBeChecked();
    expect(props.onError).toHaveBeenCalledTimes(1);
  });

  it('checks a routine due today with the date; routines not due are disabled', async () => {
    const goal = mkGoal([
      mkOutcome(0, 'A', [
        mkAction({ n: 1, position: 0, title: 'Daily', kind: 'routine', schedule: { type: 'daily' }, dueToday: true }),
        mkAction({ n: 2, position: 1, title: 'Later', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 2 }, dueToday: false }),
      ]),
    ]);
    const { execution } = await setup({ goal, position: 0 });
    execution.checkRoutine.mockResolvedValue(ok(mkAction({ n: 1, position: 0, title: 'Daily', kind: 'routine', checkedToday: true, dueToday: true })));
    expect(screen.getByRole('checkbox', { name: 'Complete: Later' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Complete: Daily' }));
    await act(async () => {});
    expect(execution.checkRoutine).toHaveBeenCalledWith({ actionId: goal.matrix.outcomes[0]!.slots[0]!.id, date: TODAY });
  });
});

describe('today focus toggle', () => {
  it('adds and removes with checked state and visible text', async () => {
    const { focus } = await setup();
    const base = { n: 1, position: 4, title: 'Run 5k', completedAt: '2026-02-01T00:00:00.000Z' };
    focus.addToToday.mockResolvedValue(ok(mkAction({ ...base, focusedToday: true })));
    focus.removeFromToday.mockResolvedValue(ok(mkAction({ ...base, focusedToday: false })));
    const id = sampleGoal().matrix.outcomes[2]!.slots[4]!.id;
    await fireEvent.press(screen.getByRole('switch', { name: "Today\'s focus: Run 5k" }));
    await act(async () => {});
    expect(focus.addToToday).toHaveBeenCalledWith({ actionId: id });
    expect(screen.getByRole('switch', { name: "Today\'s focus: Run 5k" })).toBeChecked();
    await fireEvent.press(screen.getByRole('switch', { name: "Today\'s focus: Run 5k" }));
    await act(async () => {});
    expect(focus.removeFromToday).toHaveBeenCalledWith({ actionId: id });
    expect(screen.getByRole('switch', { name: "Today\'s focus: Run 5k" })).not.toBeChecked();
  });

  it('rolls back a failed focus change (e.g. daily limit)', async () => {
    const { focus, props } = await setup();
    focus.addToToday.mockResolvedValue(fail('LIMIT_REACHED', 'You can focus on 5 things a day.'));
    await fireEvent.press(screen.getByRole('switch', { name: "Today\'s focus: Run 5k" }));
    await act(async () => {});
    expect(screen.getByRole('switch', { name: "Today\'s focus: Run 5k" })).not.toBeChecked();
    expect(props.onError).toHaveBeenCalledWith('You can focus on 5 things a day.');
  });
});

describe('full 9x9 sheet', () => {
  it('shows each key area twice (hub and block centre) and labels every cell', async () => {
    const goal = sampleGoal();
    const onOpenArea = jest.fn();
    const onOpenAction = jest.fn();
    const onAddAction = jest.fn();
    await render(
      <MatrixSheet
        areas={buildMatrix(goal).areas}
        goalTitle={goal.title}
        cellSize={100}
        onOpenArea={onOpenArea}
        onOpenAction={onOpenAction}
        onAddAction={onAddAction}
      />,
    );
    expect(screen.getAllByLabelText('Key area 3, Fitness, 3 of 8 actions')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Add key area 1' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Action 1 of key area 3: Stretch, routine' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Action 5 of key area 3: Run 5k, done' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Action 2 of key area 3: Buy shoes' }));
    expect(onOpenAction).toHaveBeenCalledWith(2, expect.objectContaining({ position: 1 }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add action 3 to key area 3' }));
    expect(onAddAction).toHaveBeenCalledWith(2, 2);
    // Positions of an empty key area cannot take actions.
    expect(screen.queryByRole('button', { name: 'Add action 1 to key area 1' })).toBeNull();
  });

  it('supports zooming in, zooming out, and resetting zoom on the Full sheet view', async () => {
    await render(<MatrixOverview goal={sampleGoal()} onOpenArea={jest.fn()} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Full sheet' }));
    expect(screen.getByText(/Pinch to zoom in or out/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Zoom 100%')).toBeOnTheScreen();
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
    const zoomOut = screen.getByRole('button', { name: 'Zoom out' });
    await fireEvent.press(zoomIn);
    expect(screen.getByLabelText('Zoom 125%')).toBeOnTheScreen();
    await fireEvent.press(zoomOut);
    await fireEvent.press(zoomOut);
    expect(screen.getByLabelText('Zoom 75%')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Zoom 75%'));
    expect(screen.getByLabelText('Zoom 100%')).toBeOnTheScreen();
  });

  it('transitions cleanly after creating a key area without leaving a stuck modal', async () => {
    const { matrix, props } = await setup({ position: 0 });
    matrix.addOutcome.mockResolvedValue(
      ok({
        id: '00000000-0000-4000-8000-000000000099',
        position: 0,
        title: 'Recovery',
        description: 'Rest well',
        updatedAt: '2026-03-01T00:00:00.000Z',
      }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Add key area 1' }));
    await fireEvent.changeText(screen.getByLabelText('Key area title'), 'Recovery');
    await fireEvent.press(screen.getByRole('button', { name: 'Create key area' }));
    await act(async () => {});
    expect(props.onChanged).toHaveBeenCalled();
    expect(screen.getByText('Recovery')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add action 1 of 8' })).toBeOnTheScreen();
    expect(screen.queryByTestId('sheet-modal')).toBeNull();
  });
});

describe('planning suggestions in a key area', () => {
  beforeEach(() => {
    mockSuggestActions.mockReset();
    mockSuggestAreas.mockReset();
  });

  it('are left out while the plan is unknown', async () => {
    await setup();
    expect(screen.queryByRole('button', { name: /Suggest actions/ })).toBeNull();
  });

  it('accepted one by one into the next free positions, never over existing actions', async () => {
    mockSuggestActions.mockResolvedValue({
      ok: true,
      data: { task: 'actions', actions: [{ title: 'Hill repeats', kind: 'routine', cadence: 'weekly' }, { title: 'Book a race', kind: 'task', cadence: null }] },
    });
    const { matrix, props } = await setup({ aiPlanning: true });
    matrix.addAction.mockImplementation(async (i) => ok({ id: i.id }));
    await fireEvent.press(screen.getByRole('button', { name: 'Suggest actions' }));
    expect(mockSuggestActions).toHaveBeenCalledWith('Run a marathon', 'Fitness', ['Stretch', 'Buy shoes', 'Run 5k']);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add suggested action: Hill repeats' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Add suggested action: Book a race' }));
    expect(matrix.addAction).toHaveBeenCalledTimes(2);
    expect(matrix.addAction.mock.calls[0]![0]).toMatchObject({ position: 2, title: 'Hill repeats', kind: 'routine', schedule: { type: 'weekly', timesPerWeek: 1 } });
    expect(matrix.addAction.mock.calls[1]![0]).toMatchObject({ position: 3, title: 'Book a race', kind: 'task' });
    expect(matrix.updateAction).not.toHaveBeenCalled();
    expect(props.onChanged).toHaveBeenCalledTimes(2);
  });

  it('an empty key area offers key area suggestions that fill this slot first', async () => {
    mockSuggestAreas.mockResolvedValue({ ok: true, data: { task: 'areas', measurableOutcome: null, areas: [{ title: 'Nutrition', why: 'Fuel' }] } });
    const { matrix } = await setup({ aiPlanning: true, position: 0 });
    matrix.addOutcome.mockImplementation(async (i) => ok({ id: i.id }));
    await fireEvent.press(screen.getByRole('button', { name: 'Suggest key areas' }));
    expect(mockSuggestAreas).toHaveBeenCalledWith('Run a marathon', expect.any(String), ['Fitness', 'Sleep']);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add suggested key area: Nutrition' }));
    expect(matrix.addOutcome.mock.calls[0]![0]).toMatchObject({ position: 0, title: 'Nutrition' });
  });

  it('Free: the button explains Harada Pro', async () => {
    await setup({ aiPlanning: false });
    await fireEvent.press(screen.getByRole('button', { name: 'Suggest actions (Harada Pro)' }));
    expect(screen.getByTestId('upgrade-prompt-ai_planning')).toBeOnTheScreen();
    expect(mockSuggestActions).not.toHaveBeenCalled();
  });
});
