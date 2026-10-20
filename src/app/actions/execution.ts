'use server';

import type { z } from 'zod';
import * as uc from '@/application/use-cases';
import type { focusSchema } from '@/application/schemas';
import { runAuthed } from './run';

export async function completeActionAction(input: { actionId: string }) {
  return runAuthed((deps, ctx) => uc.completeAction(deps, ctx, input));
}

export async function reopenActionAction(input: { actionId: string }) {
  return runAuthed((deps, ctx) => uc.reopenAction(deps, ctx, input));
}

export async function checkRoutineAction(input: { actionId: string; date: string }) {
  return runAuthed((deps, ctx) => uc.checkRoutine(deps, ctx, input));
}

export async function uncheckRoutineAction(input: { actionId: string; date: string }) {
  return runAuthed((deps, ctx) => uc.uncheckRoutine(deps, ctx, input));
}

export async function addToTodayAction(input: z.input<typeof focusSchema>) {
  return runAuthed((deps, ctx) => uc.addToToday(deps, ctx, input));
}

export async function removeFromTodayAction(input: z.input<typeof focusSchema>) {
  return runAuthed((deps, ctx) => uc.removeFromToday(deps, ctx, input));
}
