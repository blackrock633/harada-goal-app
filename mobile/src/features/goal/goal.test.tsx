import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type {
  GoalDetailDTO,
  GoalFieldsDTO,
  GoalMetricsDTO,
  OutcomeDTO,
  TemplateSummaryDTO,
} from '@shared/application/dto';

import { GoalForm } from './GoalForm';
import { GoalOnboarding } from './GoalOnboarding';
import { GoalOverview } from './GoalOverview';

const today = '2026-10-19';
const fields = (o: Partial<GoalFieldsDTO> = {}): GoalFieldsDTO => ({
  id: 'g1',
  title: 'Run a marathon',
  vision: 'A strong, healthy me',
  successCriteria: 'Finish in 4 hours',
  targetDate: '2027-04-01',
  status: 'draft',
  purpose: { selfTangible: 'Health', selfIntangible: '', othersTangible: '', othersIntangible: 'Be an example' },
  activatedOn: null,
  achievedAt: null,
  archivedAt: null,
  createdAt: '',
  updatedAt: '2026-10-01T10:00:00.000Z',
  ...o,
});
const ok = (data: GoalFieldsDTO) => Promise.resolve({ ok: true as const, data });
const unavailable = { ok: false as const, error: { code: 'UNAVAILABLE' as const, message: 'x' } };

const TITLE = 'What is your goal?';
const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));

async function setupCreate(createGoal: jest.Mock = jest.fn(() => ok(fields()))) {
  const updateGoal = jest.fn(() => ok(fields()));
  const onCreated = jest.fn();
  await render(<GoalForm mode="create" today={today} mutations={{ createGoal, updateGoal } as never} onCreated={onCreated} />);
  return { createGoal, onCreated };
}

describe('GoalForm create', () => {
  it('requires a title', async () => {
    const { createGoal } = await setupCreate();
    await press('Create goal');
    expect(await screen.findByText('Required')).toBeOnTheScreen();
    expect(createGoal).not.toHaveBeenCalled();
  });

  it('allows a title up to the limit and shows a counter', async () => {
    const { createGoal, onCreated } = await setupCreate();
    await fireEvent.changeText(screen.getByLabelText(TITLE), 'a'.repeat(120));
    expect(screen.getByText('120 / 120')).toBeOnTheScreen();
    await press('Create goal');
    await waitFor(() => expect(createGoal).toHaveBeenCalled());
    expect(onCreated).toHaveBeenCalled();
  });

  it('blocks a today-or-earlier target date on create', async () => {
    const { createGoal } = await setupCreate();
    await fireEvent.changeText(screen.getByLabelText(TITLE), 'x');
    await fireEvent.changeText(screen.getByLabelText('Target date (optional)'), today);
    await press('Create goal');
    expect(await screen.findByText('Pick a date in the future.')).toBeOnTheScreen();
    expect(createGoal).not.toHaveBeenCalled();
  });

  it('shows server fieldErrors under the field and keeps input', async () => {
    const createGoal = jest.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'VALIDATION' as const, message: 'bad', fieldErrors: { title: ['Title already used'] } },
      }),
    );
    await setupCreate(createGoal);
    await fireEvent.changeText(screen.getByLabelText(TITLE), 'Mine');
    await press('Create goal');
    expect(await screen.findAllByText('Title already used')).not.toHaveLength(0);
    expect(screen.getByLabelText(TITLE).props.value).toBe('Mine');
  });

  it('is busy while pending and ignores a second press', async () => {
    let resolve!: (v: unknown) => void;
    const createGoal = jest.fn(() => new Promise((r) => { resolve = r; }));
    await setupCreate(createGoal as never);
    await fireEvent.changeText(screen.getByLabelText(TITLE), 'Mine');
    void press('Create goal'); // not awaited: the mutation stays pending
    const btn = screen.getByRole('button', { name: 'Create goal' });
    await waitFor(() => expect(btn).toBeBusy());
    expect(btn).toBeDisabled();
    void fireEvent.press(btn);
    expect(createGoal).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true, data: fields() }));
  });

  it('shows a non-blocking hint for qualitative success criteria', async () => {
    const { createGoal } = await setupCreate();
    await fireEvent.changeText(screen.getByLabelText('What is your goal?'), 'Be calmer');
    await fireEvent.changeText(
      screen.getByLabelText("How you'll know you've succeeded (optional)"),
      'I feel peaceful and content',
    );
    expect(screen.getByTestId('criteria-hint')).toHaveTextContent(/qualitative/);
    await press('Create goal');
    await waitFor(() => expect(createGoal).toHaveBeenCalled());
    expect(createGoal.mock.calls[0]![0]).toMatchObject({ successCriteria: 'I feel peaceful and content', vision: '' });
  });

  it('reveals the other purpose quadrants behind "Add more reasons"', async () => {
    await setupCreate();
    expect(screen.queryByLabelText('For others, how it will feel')).toBeNull();
    await press('Add more reasons');
    expect(screen.getByLabelText('For others, how it will feel')).toBeOnTheScreen();
  });

  it('reuses the same client id when retrying after UNAVAILABLE and keeps input', async () => {
    const createGoal = jest
      .fn()
      .mockImplementationOnce(() => Promise.resolve(unavailable))
      .mockImplementationOnce(() => ok(fields()));
    await setupCreate(createGoal);
    await fireEvent.changeText(screen.getByLabelText(TITLE), 'Mine');
    await press('Create goal');
    expect(await screen.findByText(/Couldn't reach the server/)).toBeOnTheScreen();
    expect(screen.getByLabelText(TITLE).props.value).toBe('Mine');
    await press('Create goal');
    await waitFor(() => expect(createGoal).toHaveBeenCalledTimes(2));
    const [a, b] = createGoal.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });
});

describe('GoalForm edit', () => {
  const mutationsWith = (updateGoal: jest.Mock) => ({ createGoal: jest.fn(), updateGoal }) as never;

  it('prefills, shows the note, and expands filled reasons', async () => {
    await render(<GoalForm mode="edit" goal={fields()} today={today} mutations={mutationsWith(jest.fn())} />);
    expect(screen.getByLabelText(TITLE).props.value).toBe('Run a marathon');
    expect(screen.getByText('Changing your goal keeps your key areas and actions.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Be an example')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add more reasons' })).toBeNull();
  });

  it('warns but does not block a past date', async () => {
    const updateGoal = jest.fn(() => ok(fields()));
    const onSaved = jest.fn();
    await render(
      <GoalForm mode="edit" goal={fields({ targetDate: '2020-01-01' })} today={today} mutations={mutationsWith(updateGoal)} onSaved={onSaved} />,
    );
    expect(screen.getByText(/already passed/)).toBeOnTheScreen();
    await press('Save goal');
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('sends expectedUpdatedAt, then the latest updatedAt after a save', async () => {
    const updateGoal = jest
      .fn()
      .mockImplementationOnce(() => ok(fields({ updatedAt: '2026-10-02T10:00:00.000Z' })))
      .mockImplementationOnce(() => ok(fields({ updatedAt: '2026-10-03T10:00:00.000Z' })));
    await render(<GoalForm mode="edit" goal={fields()} today={today} mutations={mutationsWith(updateGoal)} />);
    await press('Save goal');
    await waitFor(() => expect(updateGoal).toHaveBeenCalledTimes(1));
    expect(updateGoal.mock.calls[0]![0]).toMatchObject({
      goalId: 'g1',
      expectedUpdatedAt: '2026-10-01T10:00:00.000Z',
      successCriteria: 'Finish in 4 hours',
    });
    await press('Save goal');
    await waitFor(() => expect(updateGoal).toHaveBeenCalledTimes(2));
    expect(updateGoal.mock.calls[1]![0]).toMatchObject({ expectedUpdatedAt: '2026-10-02T10:00:00.000Z' });
  });

  it('on CONFLICT keeps input and offers Reload latest', async () => {
    const updateGoal = jest.fn(() =>
      Promise.resolve({ ok: false as const, error: { code: 'CONFLICT' as const, message: '' } }),
    );
    const onReloadLatest = jest.fn();
    await render(
      <GoalForm mode="edit" goal={fields()} today={today} onReloadLatest={onReloadLatest} mutations={mutationsWith(updateGoal)} />,
    );
    await fireEvent.changeText(screen.getByLabelText(TITLE), 'Edited');
    await press('Save goal');
    expect(await screen.findByText(/changed somewhere else/)).toBeOnTheScreen();
    expect(screen.getByLabelText(TITLE).props.value).toBe('Edited');
    await press('Reload latest');
    expect(onReloadLatest).toHaveBeenCalled();
  });
});

describe('GoalOnboarding', () => {
  const templates: TemplateSummaryDTO[] = [
    { id: 't1', name: 'Fitness', summary: 'Get fit', outcomeCount: 8, actionCount: 20 },
  ];
  const setup = async (over: Record<string, unknown> = {}) => {
    const createGoal = jest.fn((_input: unknown) => ok(fields()));
    const updateGoal = jest.fn((_input: unknown) => ok(fields()));
    const onUseTemplate = jest.fn(() => ok(fields({ id: 'g2', title: 'Template goal' })));
    const onOpenMatrix = jest.fn();
    const onGoToToday = jest.fn();
    await render(
      <GoalOnboarding
        today={today}
        templates={templates}
        mutations={{ createGoal, updateGoal } as never}
        onUseTemplate={onUseTemplate}
        onOpenMatrix={onOpenMatrix}
        onGoToToday={onGoToToday}
        {...over}
      />,
    );
    return { createGoal, updateGoal, onUseTemplate, onOpenMatrix, onGoToToday };
  };

  it('requires a title, then creates and walks title -> details -> done', async () => {
    const { createGoal, updateGoal, onOpenMatrix } = await setup();
    await press('Create goal');
    expect(await screen.findByText('Required')).toBeOnTheScreen();
    expect(createGoal).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Your goal'), 'Run a marathon');
    await press('Create goal');
    expect(await screen.findByText('Make it yours (optional)')).toBeOnTheScreen();
    expect(createGoal.mock.calls[0]![0]).toMatchObject({ title: 'Run a marathon', targetDate: null });

    await fireEvent.changeText(screen.getByLabelText('Vision (optional)'), 'A calm home');
    await press('Save and continue');
    expect(await screen.findByText('Your goal is created')).toBeOnTheScreen();
    expect(updateGoal.mock.calls[0]![0]).toMatchObject({ goalId: 'g1', expectedUpdatedAt: '2026-10-01T10:00:00.000Z', vision: 'A calm home' });

    await press('Open matrix');
    expect(onOpenMatrix).toHaveBeenCalledWith('g1');
  });

  it('details are skippable and done offers Go to Today', async () => {
    const { updateGoal, onGoToToday } = await setup();
    await fireEvent.changeText(screen.getByLabelText('Your goal'), 'X');
    await press('Create goal');
    await press('Skip for now');
    expect(updateGoal).not.toHaveBeenCalled();
    await press('Go to Today');
    expect(onGoToToday).toHaveBeenCalled();
  });

  it('templates never prefill the form; choosing one passes a stable client id', async () => {
    const onUseTemplate = jest
      .fn<Promise<unknown>, [string, string]>()
      .mockImplementationOnce(() => Promise.resolve(unavailable))
      .mockImplementationOnce(() => ok(fields({ id: 'g2', title: 'Template goal' })));
    await setup({ onUseTemplate });
    expect(screen.getByText('Or start from an example')).toBeOnTheScreen();
    expect(screen.getByLabelText('Your goal').props.value).toBe('');
    await press('Use example: Fitness');
    await screen.findByText(/Couldn't reach the server/);
    expect(screen.getByLabelText('Your goal').props.value).toBe('');
    await press('Use example: Fitness');
    expect(await screen.findByText('Your goal is created')).toBeOnTheScreen();
    expect(onUseTemplate.mock.calls[0]![0]).toBe('t1');
    expect(onUseTemplate.mock.calls[1]![1]).toBe(onUseTemplate.mock.calls[0]![1]);
  });
});

const outcome = (position: number, extra: Partial<OutcomeDTO> = {}): OutcomeDTO => ({
  id: `o${position}`, goalId: 'g1', title: `Area ${position}`, description: '', measure: null, position,
  archivedAt: null, createdAt: '', updatedAt: '', taskCompletion: 0.5, completedTasks: 0, totalTasks: 0,
  routineAdherence: null, routineCount: 0, attainment: null, actions: [], slots: Array(8).fill(null), ...extra,
});
const metrics = (m: Partial<GoalMetricsDTO> = {}): GoalMetricsDTO => ({
  planning: { filled: 2, total: 72, ratio: 2 / 72 }, taskCompletion: null, completedTasks: 0, totalTasks: 0,
  routineAdherence: null, routineCount: 0, attainment: null, ...m,
});

describe('GoalOverview', () => {
  const detail = (o: Partial<GoalDetailDTO> = {}): GoalDetailDTO => {
    const outcomes = [outcome(0), outcome(3, { measure: { current: 5, target: 10, unit: 'km' } })];
    const grid: (OutcomeDTO | null)[] = Array(8).fill(null);
    for (const x of outcomes) grid[x.position!] = x;
    return {
      ...fields(), metrics: metrics(), pace: 'unknown', outcomes, matrix: { outcomes: grid },
      archivedOutcomes: [], archivedActions: [], ...o,
    };
  };
  const show = (goal: GoalDetailDTO, props: Record<string, unknown> = {}) =>
    render(<GoalOverview goal={goal} today={today} activateGoal={jest.fn() as never} onOpenArea={jest.fn()} {...props} />);

  it('shows three separate figures and no merged percentage', async () => {
    await show(detail());
    expect(screen.getByText('2 of 72 positions filled')).toBeOnTheScreen();
    expect(screen.getByText('0 of 0 tasks done')).toBeOnTheScreen();
  });

  it('with no routines and no attainment there is no % anywhere', async () => {
    await show(detail({ outcomes: [], matrix: { outcomes: Array(8).fill(null) } }));
    expect(screen.getByText('Not measured yet')).toBeOnTheScreen();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/adherence/)).toBeNull();
  });

  it('keeps plan, actions, routines and attainment as separate lines', async () => {
    await show(
      detail({
        metrics: metrics({
          planning: { filled: 40, total: 72, ratio: 0.55 }, completedTasks: 3, totalTasks: 9,
          routineCount: 2, routineAdherence: 0.75, attainment: 0.42,
        }),
      }),
    );
    expect(screen.getByText('40 of 72 positions filled')).toBeOnTheScreen();
    expect(screen.getByText('3 of 9 tasks done')).toBeOnTheScreen();
    expect(screen.getByText('2 routines')).toBeOnTheScreen();
    expect(screen.getByText('Routines: 75% adherence over 28 days')).toBeOnTheScreen();
    expect(screen.getByText('Measured attainment: 42%')).toBeOnTheScreen();
    expect(screen.getByText('Area 3: 5 / 10 km')).toBeOnTheScreen();
  });

  it('hides pace when unknown and labels it "(by measures)" otherwise', async () => {
    const { unmount } = await show(detail());
    expect(screen.queryByText(/by measures/)).toBeNull();
    await unmount();
    await show(detail({ pace: 'on_track' }));
    expect(screen.getByText('On track (by measures)')).toBeOnTheScreen();
  });

  it('renders 8 key-area rows including empty slots and opens them', async () => {
    const onOpenArea = jest.fn();
    await show(detail(), { onOpenArea });
    expect(screen.getAllByTestId(/^key-area-row-/)).toHaveLength(8);
    expect(screen.getAllByText(/Empty slot/)).toHaveLength(6);
    await press('Add key area 2');
    expect(onOpenArea).toHaveBeenCalledWith(1);
    await press('Open key area 4: Area 3');
    expect(onOpenArea).toHaveBeenCalledWith(3);
  });

  it('shows "How you\'ll know" and Vision only when non-empty', async () => {
    const { unmount } = await show(detail());
    expect(screen.getByText("How you'll know")).toBeOnTheScreen();
    expect(screen.getByText('Vision')).toBeOnTheScreen();
    await unmount();
    await show(detail({ vision: '', successCriteria: '' }));
    expect(screen.queryByText("How you'll know")).toBeNull();
    expect(screen.queryByText('Vision')).toBeNull();
  });

  it('activates a draft goal, showing busy and errors', async () => {
    let resolve!: (v: unknown) => void;
    const activateGoal = jest.fn(() => new Promise((r) => { resolve = r; }));
    await show(detail(), { activateGoal });
    void press('Activate goal'); // not awaited: the mutation stays pending
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate goal' })).toBeBusy());
    await act(async () => resolve(unavailable));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Activate goal' })).not.toBeBusy();
  });

  it('does not offer activation for an active goal', async () => {
    await show(detail({ status: 'active' }));
    expect(screen.queryByRole('button', { name: 'Activate goal' })).toBeNull();
  });
});
