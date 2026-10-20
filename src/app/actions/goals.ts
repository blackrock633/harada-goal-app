'use server';

import type { z } from 'zod';
import * as uc from '@/application/use-cases';
import type { createGoalSchema, updateGoalSchema } from '@/application/schemas';
import { runAuthed } from './run';

export async function createGoalAction(input: z.input<typeof createGoalSchema>) {
  return runAuthed((deps, ctx) => uc.createGoal(deps, ctx, input));
}

export async function createGoalFromTemplateAction(templateId: string, clientId: string) {
  return runAuthed((deps, ctx) => uc.createGoalFromTemplate(deps, ctx, { id: clientId, templateId }));
}

export async function updateGoalAction(input: z.input<typeof updateGoalSchema>) {
  return runAuthed((deps, ctx) => uc.updateGoal(deps, ctx, input));
}

export async function activateGoalAction(input: { goalId: string }) {
  return runAuthed((deps, ctx) => uc.activateGoal(deps, ctx, input));
}
