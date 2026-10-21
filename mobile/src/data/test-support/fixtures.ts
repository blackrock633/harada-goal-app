/** Row fixtures (snake_case, as PostgREST returns them) shared by the data-layer tests. */
export const TODAY = '2026-10-20';
export const TZ = 'America/New_York';
export const OWNER = '00000000-0000-4000-8000-000000000001';

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ID = {
  goalActive: uuid(10),
  goalDraft: uuid(11),
  goalArchived: uuid(12),
  outcome: uuid(20),
  outcomeDraft: uuid(21),
  task: uuid(30),
  routine: uuid(31),
  draftTask: uuid(32),
};

const ts = (d: string) => `${d}T12:00:00+00:00`;

export function goalRow(over: Record<string, unknown> = {}) {
  return {
    id: ID.goalActive,
    owner_id: OWNER,
    title: 'Run a marathon',
    vision: 'Finish',
    success_criteria: '',
    target_date: '2027-04-01',
    status: 'active',
    status_before_archive: null,
    purpose_self_tangible: 'a',
    purpose_self_intangible: 'b',
    purpose_others_tangible: 'c',
    purpose_others_intangible: 'd',
    activated_on: '2026-10-01',
    achieved_at: null,
    archived_at: null,
    created_at: ts('2026-09-30'),
    updated_at: ts('2026-10-10'),
    ...over,
  };
}

export function outcomeRow(over: Record<string, unknown> = {}) {
  return {
    id: ID.outcome,
    goal_id: ID.goalActive,
    title: 'Endurance',
    description: '',
    measure_target: 42.5,
    measure_current: '10',
    measure_unit: 'km',
    position: 0,
    archived_at: null,
    created_at: ts('2026-09-30'),
    updated_at: ts('2026-10-02'),
    ...over,
  };
}

export function actionRow(over: Record<string, unknown> = {}) {
  return {
    id: ID.task,
    goal_id: ID.goalActive,
    outcome_id: ID.outcome,
    title: 'Buy shoes',
    notes: '',
    kind: 'task',
    position: 0,
    due_date: TODAY,
    completed_at: null,
    schedule_type: null,
    schedule_days: null,
    schedule_times_per_week: null,
    start_date: null,
    archived_at: null,
    created_at: ts('2026-09-30'),
    updated_at: ts('2026-10-02'),
    ...over,
  };
}

export const routineRow = (over: Record<string, unknown> = {}) =>
  actionRow({
    id: ID.routine,
    title: 'Run',
    kind: 'routine',
    position: 1,
    due_date: null,
    schedule_type: 'daily',
    start_date: '2026-10-01',
    ...over,
  });

export const checkRow = (actionId: string, date: string) => ({
  id: uuid(Number(date.replaceAll('-', '').slice(2)) % 1000000),
  action_id: actionId,
  date,
  created_at: ts(date),
});

export const focusRow = (actionId: string, date = TODAY, slot = 0) => ({
  id: uuid(900 + slot),
  owner_id: OWNER,
  action_id: actionId,
  date,
  slot,
  created_at: ts(date),
});

export const reflectionRow = (over: Record<string, unknown> = {}) => ({
  id: uuid(40),
  goal_id: ID.goalActive,
  date: '2026-10-19',
  kind: 'daily',
  went_well: 'good',
  didnt_go_well: '',
  next_change: '',
  created_at: ts('2026-10-19'),
  updated_at: ts('2026-10-19'),
  ...over,
});

export const eventRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: uuid(500 + n),
  goal_id: ID.goalActive,
  type: 'goal_updated',
  subject_id: null,
  summary: `event ${n}`,
  data: null,
  occurred_at: `2026-10-${String(10 + n).padStart(2, '0')}T08:00:00+00:00`,
  ...over,
});

/** A small but representative database: 3 goals (active/draft/archived), a task, routines, checks, focus. */
export function database() {
  return {
    profiles: [{ id: OWNER, display_name: 'Ada', time_zone: TZ, created_at: ts('2026-09-01'), updated_at: ts('2026-09-01') }],
    goals: [
      goalRow(),
      goalRow({ id: ID.goalDraft, title: 'Draft goal', status: 'draft', activated_on: null, created_at: ts('2026-10-05'), updated_at: ts('2026-10-12') }),
      goalRow({ id: ID.goalArchived, title: 'Old', status: 'archived', status_before_archive: 'active', archived_at: ts('2026-10-06'), created_at: ts('2026-08-01'), updated_at: ts('2026-10-06') }),
    ],
    outcomes: [
      outcomeRow(),
      outcomeRow({ id: ID.outcomeDraft, goal_id: ID.goalDraft, title: 'Draft area', measure_target: null, measure_current: null, measure_unit: null }),
    ],
    actions: [
      actionRow(),
      routineRow(),
      actionRow({ id: ID.draftTask, goal_id: ID.goalDraft, outcome_id: ID.outcomeDraft, title: 'Draft step', due_date: null, completed_at: ts('2026-10-19') }),
    ],
    routine_checks: [checkRow(ID.routine, TODAY), checkRow(ID.routine, '2026-10-19'), checkRow(ID.routine, '2026-08-01')],
    daily_focus: [focusRow(ID.routine, TODAY, 0), focusRow(ID.task, '2026-10-21', 0)],
    reflections: [
      reflectionRow(),
      reflectionRow({ id: uuid(41), date: '2026-10-10' }),
      reflectionRow({ id: uuid(42), goal_id: ID.goalDraft, date: '2026-10-15' }),
    ],
    goal_events: [eventRow(1), eventRow(2), eventRow(3, { goal_id: ID.goalDraft })],
  };
}
