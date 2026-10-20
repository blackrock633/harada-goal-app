'use server';

import type { z } from 'zod';
import * as uc from '@/application/use-cases';
import type {
  addActionSchema,
  addOutcomeSchema,
  updateActionSchema,
  updateOutcomeSchema,
} from '@/application/schemas';
import { runAuthed } from './run';

export async function addOutcomeAction(input: z.input<typeof addOutcomeSchema>) {
  return runAuthed((deps, ctx) => uc.addOutcome(deps, ctx, input));
}

export async function updateOutcomeAction(input: z.input<typeof updateOutcomeSchema>) {
  return runAuthed((deps, ctx) => uc.updateOutcome(deps, ctx, input));
}

export async function addActionAction(input: z.input<typeof addActionSchema>) {
  return runAuthed((deps, ctx) => uc.addAction(deps, ctx, input));
}

export async function updateActionAction(input: z.input<typeof updateActionSchema>) {
  return runAuthed((deps, ctx) => uc.updateAction(deps, ctx, input));
}
