import { fireEvent, render, screen } from '@testing-library/react-native';

import type { GoalEventDTO, OutcomeDTO, ReflectionDTO } from '@shared/application/dto';
import type { ReviewMutations } from '@/data/mutations';
import { action } from '../today/fixtures';
import { ReflectionForm } from './ReflectionForm';
import { ReviewView, buildTimeline } from './ReviewView';

function reflection(over: Partial<ReflectionDTO> = {}): ReflectionDTO {
  return {
    id: 'r1', goalId: 'g1', date: '2026-10-19', kind: 'daily', wentWell: 'Shipped it', didntGoWell: '', nextChange: '',
    createdAt: '2026-10-19T09:00:00', updatedAt: '2026-10-19T09:00:00', ...over,
  };
}
function event(over: Partial<GoalEventDTO> = {}): GoalEventDTO {
  return { id: 'e1', goalId: 'g1', type: 'action_completed', subjectId: null, summary: 'Completed: Run', data: {}, occurredAt: '2026-10-19T12:00:00', ...over } as GoalEventDTO;
}
function outcome(over: Partial<OutcomeDTO> = {}): OutcomeDTO {
  return {
    id: 'o1', goalId: 'g1', title: 'Fitness', description: '', measure: null, position: 0, archivedAt: null, createdAt: '', updatedAt: '',
    taskCompletion: 0.5, completedTasks: 1, totalTasks: 2, routineAdherence: null, routineCount: 0, attainment: null,
    actions: [action({ id: 'a1' }), action({ id: 'a2', completedAt: '2026-10-19T08:00:00Z' }), action({ id: 'a3', kind: 'routine' })],
    slots: [], ...over,
  } as OutcomeDTO;
}

const G = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

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

  it('shows the three prompts, daily/weekly choice and date defaulting to today', async () => {
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={jest.fn()} />);
    for (const l of ['What went well?', "What didn't?", 'What will you change?']) expect(screen.getByLabelText(l)).toBeTruthy();
    expect(screen.getByLabelText('Date').props.value).toBe('2026-10-19');
    expect(screen.getByRole('radio', { name: 'Daily' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    expect(screen.getByRole('radio', { name: 'Weekly' })).toBeChecked();
  });

  it('saves, sends the chosen kind/date, clears, and uses a fresh id next time', async () => {
    const add = jest.fn<ReturnType<ReviewMutations['addReflection']>, Parameters<ReviewMutations['addReflection']>>(async () => ({ ok: true, data: saved() }));
    const onSaved = jest.fn();
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} onSaved={onSaved} />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Weekly' }));
    await fireEvent.changeText(screen.getByLabelText('Date'), '2026-10-18');
    await fireEvent.changeText(screen.getByLabelText('What went well?'), '  Good  ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText('Reflection saved.')).toBeTruthy();
    expect(add.mock.calls[0]![0]).toMatchObject({ goalId: G, date: '2026-10-18', kind: 'weekly', wentWell: 'Good' });
    expect(onSaved).toHaveBeenCalled();
    expect(screen.getByLabelText('What went well?').props.value).toBe('');

    await fireEvent.changeText(screen.getByLabelText("What didn't?"), 'Again');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    await screen.findByText('Reflection saved.');
    expect(add.mock.calls[1]![0].id).not.toBe(add.mock.calls[0]![0].id);
  });

  it('keeps text, never claims saved, and reuses the id on retry after UNAVAILABLE', async () => {
    const add = jest
      .fn<ReturnType<ReviewMutations['addReflection']>, Parameters<ReviewMutations['addReflection']>>()
      .mockResolvedValueOnce({ ok: false, error: { code: 'UNAVAILABLE', message: 'raw' } })
      .mockResolvedValueOnce({ ok: true, data: saved() });
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} />);
    await fireEvent.changeText(screen.getByLabelText('What will you change?'), 'Sleep more');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
    expect(screen.queryByText('Reflection saved.')).toBeNull();
    expect(screen.getByLabelText('What will you change?').props.value).toBe('Sleep more');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    await screen.findByText('Reflection saved.');
    expect(add.mock.calls[1]![0].id).toBe(add.mock.calls[0]![0].id);
  });

  it('shows field errors from the server next to the field', async () => {
    const add = jest.fn(async () => ({ ok: false as const, error: { code: 'VALIDATION' as const, message: 'Invalid', fieldErrors: { date: ['Bad date'] } } }));
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} />);
    await fireEvent.changeText(screen.getByLabelText('What went well?'), 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText('Bad date')).toBeTruthy();
  });

  it('rejects a malformed date locally', async () => {
    const add = jest.fn();
    await render(<ReflectionForm goalId={G} today="2026-10-19" addReflection={add} />);
    await fireEvent.changeText(screen.getByLabelText('Date'), 'tomorrow');
    await fireEvent.changeText(screen.getByLabelText('What went well?'), 'x');
    await fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
    expect(await screen.findByText('Please fix the highlighted fields.')).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });
});

describe('ReviewView', () => {
  it('merges reflections and events newest first, grouped by date', async () => {
    const groups = buildTimeline(
      [reflection({ id: 'r1', date: '2026-10-19', createdAt: '2026-10-19T09:00:00' }), reflection({ id: 'r2', date: '2026-10-17', createdAt: '2026-10-17T09:00:00' })],
      [event({ id: 'e1', occurredAt: '2026-10-19T12:00:00' }), event({ id: 'e2', occurredAt: '2026-10-18T12:00:00', summary: 'Edited plan' })],
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-10-19', '2026-10-18', '2026-10-17']);
    expect(groups[0]!.entries.map((e) => e.item.id)).toEqual(['e1', 'r1']);

    await render(
      <ReviewView reflectionForm={null} completedThisWeek={1} outcomes={[]} reflections={[reflection()]} events={[event()]} />,
    );
    expect(screen.getAllByTestId('timeline-group')).toHaveLength(1);
    expect(screen.getByText('Completed: Run')).toBeTruthy();
    expect(screen.getByText('Shipped it')).toBeTruthy();
  });

  it('shows this week counts per key area without any percentage', async () => {
    await render(
      <ReviewView
        reflectionForm={<></>}
        completedThisWeek={3}
        outcomes={[outcome({ measure: { current: 4, target: 10, unit: 'km' } as OutcomeDTO['measure'] }), outcome({ id: 'o2', title: 'Empty', actions: [] })]}
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
    await render(<ReviewView reflectionForm={null} completedThisWeek={0} outcomes={[]} reflections={[]} events={[]} />);
    expect(screen.getByText('No tasks completed yet this week.')).toBeTruthy();
    expect(screen.getByText('No key areas yet')).toBeTruthy();
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
  });

  it('expands long reflections', async () => {
    const long = 'word '.repeat(60);
    await render(<ReviewView reflectionForm={null} completedThisWeek={0} outcomes={[]} reflections={[reflection({ wentWell: long })]} events={[]} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });
});
