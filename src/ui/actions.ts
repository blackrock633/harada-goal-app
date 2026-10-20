/**
 * Mutation signatures the UI depends on. UI components receive these as props, so they stay
 * independent of how the server actions are wired (src/app/actions/*.ts implements them).
 *
 * Every mutation resolves to a Result. Components must:
 *  - disable the control while pending (no double-submit);
 *  - only show success after `ok: true`;
 *  - on `ok: false`, roll back any optimistic state and surface `error.message`
 *    (field errors next to fields for forms, a toast for inline toggles).
 */
import type { z } from 'zod';
import type { Result } from '@/application/result';
import type { ActionDTO, GoalFieldsDTO, OutcomeFieldsDTO, ReflectionDTO } from '@/application/dto';
import type {
  addActionSchema,
  addOutcomeSchema,
  addReflectionSchema,
  createGoalSchema,
  updateActionSchema,
  updateGoalSchema,
  updateOutcomeSchema,
} from '@/application/schemas';

export type Mutation<I, O> = (input: I) => Promise<Result<O>>;

export interface GoalMutations {
  createGoal: Mutation<z.input<typeof createGoalSchema>, GoalFieldsDTO>;
  updateGoal: Mutation<z.input<typeof updateGoalSchema>, GoalFieldsDTO>;
  activateGoal: Mutation<{ goalId: string }, GoalFieldsDTO>;
}

export interface MatrixMutations {
  addOutcome: Mutation<z.input<typeof addOutcomeSchema>, OutcomeFieldsDTO>;
  updateOutcome: Mutation<z.input<typeof updateOutcomeSchema>, OutcomeFieldsDTO>;
  addAction: Mutation<z.input<typeof addActionSchema>, ActionDTO>;
  updateAction: Mutation<z.input<typeof updateActionSchema>, ActionDTO>;
}

export interface ExecutionMutations {
  completeAction: Mutation<{ actionId: string }, ActionDTO>;
  reopenAction: Mutation<{ actionId: string }, ActionDTO>;
  checkRoutine: Mutation<{ actionId: string; date: string }, ActionDTO>;
  uncheckRoutine: Mutation<{ actionId: string; date: string }, ActionDTO>;
}

export interface ReviewMutations {
  addReflection: Mutation<z.input<typeof addReflectionSchema>, ReflectionDTO>;
}
