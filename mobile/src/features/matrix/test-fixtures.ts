import type { ActionDTO, GoalDetailDTO, OutcomeDTO } from '@shared/application/dto';

export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function mkAction(over: Partial<ActionDTO> & { n: number }): ActionDTO {
  const { n, ...rest } = over;
  return {
    id: uid(1000 + n),
    goalId: uid(1),
    outcomeId: uid(100),
    title: `Action ${n}`,
    notes: '',
    kind: 'task',
    position: 0,
    dueDate: null,
    completedAt: null,
    schedule: null,
    startDate: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    progress: 0,
    dueToday: false,
    checkedToday: false,
    streak: 0,
    focusedToday: false,
    recentChecks: [],
    ...rest,
  };
}

export function mkOutcome(position: number, title: string, actions: ActionDTO[] = []): OutcomeDTO {
  const id = uid(100 + position);
  const placed = actions.map((a) => ({ ...a, outcomeId: id }));
  const slots: (ActionDTO | null)[] = Array.from({ length: 8 }, () => null);
  for (const a of placed) if (a.position !== null && a.position >= 0 && a.position < 8) slots[a.position] = a;
  return {
    id,
    goalId: uid(1),
    title,
    description: '',
    measure: null,
    position,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    taskCompletion: null,
    completedTasks: 0,
    totalTasks: 0,
    routineAdherence: null,
    routineCount: 0,
    attainment: null,
    actions: placed,
    slots,
  };
}

export function mkGoal(outcomes: OutcomeDTO[], title = 'Run a marathon'): GoalDetailDTO {
  const cells: (OutcomeDTO | null)[] = Array.from({ length: 8 }, () => null);
  for (const o of outcomes) if (o.position !== null && o.position >= 0 && o.position < 8) cells[o.position] = o;
  const placed = outcomes.flatMap((o) => o.actions);
  const tasks = placed.filter((a) => a.kind === 'task');
  return {
    id: uid(1),
    title,
    vision: '',
    successCriteria: '',
    targetDate: null,
    status: 'active',
    purpose: { selfTangible: '', selfIntangible: '', othersTangible: '', othersIntangible: '' },
    activatedOn: null,
    achievedAt: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metrics: {
      planning: { filled: outcomes.length + placed.length, total: 72, ratio: (outcomes.length + placed.length) / 72 },
      taskCompletion: null,
      completedTasks: tasks.filter((a) => a.completedAt).length,
      totalTasks: tasks.length,
      routineAdherence: null,
      routineCount: 0,
      attainment: null,
    },
    pace: 'unknown',
    outcomes,
    matrix: { outcomes: cells },
    archivedOutcomes: [],
    archivedActions: [],
  };
}

/** Fitness at position 2 with a done task at slot 4 and a routine at slot 0; Sleep at position 5. */
export function sampleGoal(): GoalDetailDTO {
  return mkGoal([
    mkOutcome(2, 'Fitness', [
      mkAction({ n: 1, position: 4, title: 'Run 5k', completedAt: '2026-02-01T00:00:00.000Z' }),
      mkAction({ n: 2, position: 0, title: 'Stretch', kind: 'routine', schedule: { type: 'daily' }, dueToday: true }),
      mkAction({ n: 3, position: 1, title: 'Buy shoes', dueDate: '2026-03-05' }),
    ]),
    mkOutcome(5, 'Sleep'),
  ]);
}
