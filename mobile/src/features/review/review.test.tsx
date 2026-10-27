import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { GoalEventDTO, OutcomeDTO, ReflectionDTO } from '@shared/application/dto';
import type { ReviewMutations } from '@/data/mutations';
import { action } from '../today/fixtures';
import { ReflectionCard } from './ReflectionCard';
import { ReflectionForm } from './ReflectionForm';
import { ReviewView, buildTimeline } from './ReviewView';

function reflection(over: Partial<ReflectionDTO> = {}): ReflectionDTO {
  return {
    id: 'r1',
    goalId: 'g1',
    date: '2026-10-19',
    kind: 'daily',
    wentWell: 'Shipped it',
    didntGoWell: '',
    nextChange: '',
    answers: {},
    createdAt: '2026-10-19T09:00:00',
    updatedAt: '2026-10-19T09:00:00',
    ...over,
  };
}
function event(over: Partial<GoalEventDTO> = {}): GoalEventDTO {
  return {
    id: 'e1',
    goalId: 'g1',
    type: 'action_completed',
    subjectId: null,
    summary: 'Completed: Run',
    data: {},
    occurredAt: '2026-10-19T12:00:00',
    ...over,
  } as GoalEventDTO;
}
function outcome(over: Partial<OutcomeDTO> = {}): OutcomeDTO {
  return {
    id: 'o1',
    goalId: 'g1',
    title: 'Fitness',
    description: '',
    measure: null,
    position: 0,
    archivedAt: null,
    createdAt: '',
    updatedAt: '',
    taskCompletion: 0.5,
    completedTasks: 1,
    totalTasks: 2,
    routineAdherence: null,
    routineCount: 0,
    attainment: null,
    actions: [
      action({ id: 'a1' }),
      action({ id: 'a2', completedAt: '2026-10-19T08:00:00Z' }),
      action({ id: 'a3', kind: 'routine' }),
    ],
    slots: [],
    ...over,
  } as OutcomeDTO;
}

const G = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const R9 = '2b1e6b6e-3f0a-4c55-9d1e-6f7a8b9c0d1e';

describe('ReflectionForm', () => {
  const saved = (): ReflectionDTO => reflection();

  it('requires at least one answer and does not call the mutation', async () => {
    const add = jest.fn();
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText(/Write something in at least one box/)).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
    expect(screen.queryByText('Reflection saved.')).toBeNull();
  });

  it('shows the three daily prompts and date defaulting to today; weekly requires Pro on Free', async () => {
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={jest.fn()} />);
    for (const l of ['What did you get done today?', 'What got in the way?', "What's your first step tomorrow?"])
      expect(screen.getByLabelText(l)).toBeTruthy();
    // The date is picked, not typed: a button that opens the calendar, showing today's date.
    expect(screen.getByRole('button', { name: /^Date: .*2026/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Daily' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    expect(screen.getByRole('radio', { name: 'Weekly' })).toBeChecked();
    expect(screen.getByTestId('upgrade-prompt-advanced_reviews')).toBeTruthy();
    expect(screen.queryByLabelText('What did you get done today?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save reflection' })).toBeNull();
  });

  it('saves, sends the chosen kind/date, clears, and uses a fresh id next time', async () => {
    const add = jest.fn<
      ReturnType<ReviewMutations['addReflection']>,
      Parameters<ReviewMutations['addReflection']>
    >(async () => ({ ok: true, data: saved() }));
    const onSaved = jest.fn();
    await render(
      <ReflectionForm goalId={G} today="2026-10-19" addReflection={add} onSaved={onSaved} advanced />,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    await fireEvent.changeText(screen.getByLabelText('3. What worked well?'), '  Good  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText('Reflection saved.')).toBeTruthy();
    expect(add.mock.calls[0]![0]).toMatchObject({
      goalId: G,
      date: '2026-10-19',
      kind: 'weekly',
      wentWell: 'Good',
    });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByLabelText('3. What worked well?').props.value).toBe('');

    await fireEvent.changeText(screen.getByLabelText('4. What prevented progress?'), 'Again');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    await screen.findByText('Reflection saved.');
    expect(add.mock.calls[1]![0].id).not.toBe(add.mock.calls[0]![0].id);
  });

  it('keeps text, never claims saved, and reuses the id on retry after UNAVAILABLE', async () => {
    const add = jest
      .fn<
        ReturnType<ReviewMutations['addReflection']>,
        Parameters<ReviewMutations['addReflection']>
      >()
      .mockResolvedValueOnce({ ok: false, error: { code: 'UNAVAILABLE', message: 'raw' } })
      .mockResolvedValueOnce({ ok: true, data: saved() });
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} />);
    await fireEvent.changeText(screen.getByLabelText("What's your first step tomorrow?"), 'Sleep more');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
    expect(screen.queryByText('Reflection saved.')).toBeNull();
    expect(screen.getByLabelText("What's your first step tomorrow?").props.value).toBe('Sleep more');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    await screen.findByText('Reflection saved.');
    expect(add.mock.calls[1]![0].id).toBe(add.mock.calls[0]![0].id);
  });

  it('shows field errors from the server next to the field', async () => {
    const add = jest.fn(async () => ({
      ok: false as const,
      error: {
        code: 'VALIDATION' as const,
        message: 'Invalid',
        fieldErrors: { date: ['Bad date'] },
      },
    }));
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} />);
    await fireEvent.changeText(screen.getByLabelText('What did you get done today?'), 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText('Bad date')).toBeTruthy();
  });

  it('has no typed date field', async () => {
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={jest.fn()} />);
    expect(screen.queryByPlaceholderText(/YYYY/)).toBeNull();
    expect(screen.queryByText('YYYY-MM-DD')).toBeNull();
  });
});

describe('ReviewView', () => {
  it('merges reflections and events newest first, grouped by date', async () => {
    const groups = buildTimeline(
      [
        reflection({ id: 'r1', date: '2026-10-19', createdAt: '2026-10-19T09:00:00' }),
        reflection({ id: 'r2', date: '2026-10-17', createdAt: '2026-10-17T09:00:00' }),
      ],
      [
        event({ id: 'e1', occurredAt: '2026-10-19T12:00:00' }),
        event({ id: 'e2', occurredAt: '2026-10-18T12:00:00', summary: 'Edited plan' }),
      ],
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-10-19', '2026-10-18', '2026-10-17']);
    expect(groups[0]!.entries.map((e) => e.item.id)).toEqual(['e1', 'r1']);

    await render(
      <ReviewView
        reflectionForm={null}
        completedThisWeek={1}
        outcomes={[]}
        reflections={[reflection()]}
        events={[event()]}
      />,
    );
    expect(screen.getAllByTestId('timeline-group')).toHaveLength(1); // plan changes, grouped by date
    expect(screen.getByText('Completed: Run')).toBeTruthy();
    expect(screen.getByText('Shipped it')).toBeTruthy();
  });

  it('shows this week counts per key area without any percentage', async () => {
    await render(
      <ReviewView
        reflectionForm={<></>}
        completedThisWeek={3}
        outcomes={[
          outcome({ measure: { current: 4, target: 10, unit: 'km' } as OutcomeDTO['measure'] }),
          outcome({ id: 'o2', title: 'Empty', actions: [] }),
        ]}
        reflections={[]}
        events={[]}
      />,
    );
    expect(screen.getByText('3 tasks completed this week.')).toBeTruthy();
    expect(screen.getByText('1 of 2 tasks done')).toBeTruthy();
    expect(screen.getByText('No tasks yet')).toBeTruthy();
    expect(screen.getByText('Measure: 4 of 10 km')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('shows empty states', async () => {
    await render(
      <ReviewView
        reflectionForm={null}
        completedThisWeek={0}
        outcomes={[]}
        reflections={[]}
        events={[]}
      />,
    );
    expect(screen.getByText('No tasks completed yet this week.')).toBeTruthy();
    expect(screen.getByText('No key areas yet')).toBeTruthy();
    expect(screen.getByText(/No reflections yet/)).toBeTruthy();
  });

  it('expands long reflections', async () => {
    const long = 'word '.repeat(60);
    await render(
      <ReviewView
        reflectionForm={null}
        completedThisWeek={0}
        outcomes={[]}
        reflections={[reflection({ wentWell: long })]}
        events={[]}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });
});

describe('Harada Pro reviews', () => {
  type Add = ReviewMutations['addReflection'];
  type Update = ReviewMutations['updateReflection'];
  const okAdd = () => jest.fn<ReturnType<Add>, Parameters<Add>>(async () => ({ ok: true, data: reflection() }));

  it('Free: weekly and monthly are locked behind Harada Pro with the upgrade prompt, never an error', async () => {
    const add = okAdd();
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    expect(screen.getByTestId('upgrade-prompt-advanced_reviews')).toBeTruthy();
    expect(screen.getByText('Reflect. Learn. Improve.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save reflection' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();

    await fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
    expect(screen.getByTestId('upgrade-prompt-advanced_reviews')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save reflection' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Not now' })).toBeNull();
    expect(add).not.toHaveBeenCalled();
  });

  it('Pro weekly: all seven questions, saved with some left empty, answers to the right keys', async () => {
    const add = okAdd();
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} advanced />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    const labels = [
      '1. What did you intend to accomplish this week?',
      '2. What did you actually complete?',
      '3. What worked well?',
      '4. What prevented progress?',
      '5. What did you learn?',
      '6. What needs to change?',
      '7. What are the most important actions for next week?',
    ];
    for (const l of labels) expect(screen.getByLabelText(l)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(labels[0]!), 'Ship v1');
    await fireEvent.changeText(screen.getByLabelText(labels[2]!), 'Mornings');
    await fireEvent.changeText(screen.getByLabelText(labels[4]!), 'Batch work');
    expect(screen.getByText('3 of 7 answered')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText('Reflection saved.')).toBeTruthy();
    const input = add.mock.calls[0]![0];
    expect(input).toMatchObject({ kind: 'weekly', wentWell: 'Mornings', answers: { intended: 'Ship v1', learned: 'Batch work' } });
    expect(input.didntGoWell).toBeUndefined();
    expect(Object.keys(input.answers ?? {})).toEqual(['intended', 'learned']);
  });

  it('Pro monthly: strategy, learning, focus and change questions', async () => {
    const add = okAdd();
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} advanced />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
    await fireEvent.changeText(screen.getByLabelText('3. Is your strategy still right? What would you adjust?'), 'Fewer areas');
    await fireEvent.changeText(screen.getByLabelText('5. What will you focus on next month?'), 'Long runs');
    await fireEvent.changeText(screen.getByLabelText('1. What moved the goal forward this month?'), 'Plan');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    await screen.findByText('Reflection saved.');
    expect(add.mock.calls[0]![0]).toMatchObject({
      kind: 'monthly',
      wentWell: 'Plan',
      answers: { strategy: 'Fewer areas', priorities: 'Long runs' },
    });
  });

  it('UPGRADE_REQUIRED on save keeps the text and shows the prompt instead of an error', async () => {
    const add = jest.fn<ReturnType<Add>, Parameters<Add>>(async () => ({
      ok: false,
      error: { code: 'UPGRADE_REQUIRED', message: 'raw server text' },
    }));
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} advanced />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
    await fireEvent.changeText(screen.getByLabelText('5. What will you focus on next month?'), 'Keep');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByTestId('upgrade-prompt-advanced_reviews')).toBeTruthy();
    expect(screen.queryByText('raw server text')).toBeNull();
    expect(screen.queryByText('Reflection saved.')).toBeNull();
    expect(screen.getByLabelText('5. What will you focus on next month?').props.value).toBe('Keep');
  });

  it('edits a past reflection: prefilled, sends updateReflection with expectedUpdatedAt, then leaves edit mode', async () => {
    const past = reflection({
      id: R9,
      kind: 'weekly',
      date: '2026-10-12',
      wentWell: 'Runs',
      answers: { intended: 'Three runs' },
      updatedAt: '2026-10-12T09:00:00.000Z',
    });
    const update = jest.fn<ReturnType<Update>, Parameters<Update>>(async () => ({ ok: true, data: past }));
    const done = jest.fn();
    await render(
      <ReflectionForm goalId={G} today="2026-10-19" addReflection={jest.fn()} updateReflection={update} advanced editing={past} onDoneEditing={done} />,
    );
    expect(screen.getByText(/Editing your weekly reflection from/)).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Daily' })).toBeNull();
    expect(screen.getByLabelText('1. What did you intend to accomplish this week?').props.value).toBe('Three runs');
    expect(screen.getByLabelText('3. What worked well?').props.value).toBe('Runs');
    await fireEvent.changeText(screen.getByLabelText('3. What worked well?'), '');
    await fireEvent.changeText(screen.getByLabelText('5. What did you learn?'), 'Rest days matter');
    await fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(update.mock.calls[0]![0]).toEqual({
      reflectionId: R9,
      expectedUpdatedAt: '2026-10-12T09:00:00.000Z',
      date: '2026-10-12',
      wentWell: '',
      didntGoWell: '',
      nextChange: '',
      answers: { intended: 'Three runs', learned: 'Rest days matter' },
    });
  });

  it('Free cannot edit a weekly reflection and sees the upgrade gate instead', async () => {
    const past = reflection({ id: R9, kind: 'weekly', answers: { intended: 'Keep me' }, updatedAt: '2026-10-12T09:00:00.000Z' });
    const update = jest.fn<ReturnType<Update>, Parameters<Update>>(async () => ({ ok: true, data: past }));
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={jest.fn()} updateReflection={update} editing={past} />);
    expect(screen.getByTestId('upgrade-prompt-advanced_reviews')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('past entries show how many questions were answered, mark the empty ones, and offer Edit', async () => {
    const r = reflection({ kind: 'weekly', wentWell: 'A', answers: { intended: 'B', priorities: 'C' } });
    const onEdit = jest.fn();
    await render(<ReflectionCard reflection={r} onEdit={onEdit} />);
    expect(screen.getByText('· 3 of 7 answered')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getAllByText('Not answered')).toHaveLength(4);
    expect(screen.getByText('What did you intend to accomplish this week?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Edit reflection: Week ending/ }));
    expect(onEdit).toHaveBeenCalledWith(r);
  });

  it('a monthly entry is labelled and the review links to progress history', async () => {
    const onOpenHistory = jest.fn();
    await render(
      <ReviewView
        reflectionForm={null}
        completedThisWeek={0}
        outcomes={[]}
        reflections={[reflection({ kind: 'monthly', wentWell: 'x' })]}
        events={[]}
        onOpenHistory={onOpenHistory}
        historyLocked
      />,
    );
    expect(screen.getByText('Monthly')).toBeTruthy();
    expect(screen.getByText('· 1 of 6 answered')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Progress history, part of Harada Pro' }));
    expect(onOpenHistory).toHaveBeenCalled();
  });
});
