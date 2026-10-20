'use server';

import type { z } from 'zod';
import * as uc from '@/application/use-cases';
import type { addReflectionSchema } from '@/application/schemas';
import { runAuthed } from './run';

export async function addReflectionAction(input: z.input<typeof addReflectionSchema>) {
  return runAuthed((deps, ctx) => uc.addReflection(deps, ctx, input));
}
