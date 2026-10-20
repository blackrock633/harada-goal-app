'use server';

import * as uc from '@/application/use-cases';
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
