/**
 * Zod input schemas for every use case (docs/API_CONTRACTS.md §3–4).
 * Shared with client forms for instant feedback; the server is authoritative.
 * Shape validation lives here; business rules live in src/domain.
 */
import { z } from 'zod';
import { LIMITS } from '../domain/limits.js';

const id = z.uuid({ message: 'Invalid id' });
const localDate = z.iso.date({ message: 'Use a valid date (YYYY-MM-DD)' });
const title = (max: number) =>
  z.string().trim().min(1, 'Required').max(max, `Keep it under ${max} characters`);
const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);

// ---------- Auth & account ----------

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Enter a valid email address' }).max(254));
const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');
const displayName = title(LIMITS.displayName);
const timeZone = z.string().trim().min(1).max(64);
/** Optimistic concurrency (M-08): the `updatedAt` ISO string the client last saw. */
const expectedUpdatedAt = z.iso.datetime().optional();
const position = z.number().int().min(0).max(7).optional();

export const signUpSchema = z.object({ email, password, displayName, timeZone });
export const signInSchema = z.object({ email, password: z.string().min(1, 'Required').max(128) });
export const updateProfileSchema = z
  .object({ displayName: displayName.optional(), timeZone: timeZone.optional() })
  .refine((v) => v.displayName !== undefined || v.timeZone !== undefined, 'Nothing to update');
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required').max(128),
  newPassword: password,
});
export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Required').max(128),
  confirmation: z.literal('DELETE', { message: 'Type DELETE to confirm' }),
});

// ---------- Goals ----------

const purpose = z.object({
  selfTangible: text(LIMITS.purposeQuadrant).default(''),
  selfIntangible: text(LIMITS.purposeQuadrant).default(''),
  othersTangible: text(LIMITS.purposeQuadrant).default(''),
  othersIntangible: text(LIMITS.purposeQuadrant).default(''),
});

export const createGoalSchema = z.object({
  id: id.optional(),
  title: title(LIMITS.goalTitle),
  vision: text(LIMITS.vision).optional(),
  successCriteria: text(LIMITS.successCriteria).optional(),
  targetDate: localDate.nullable().optional(),
  purpose: purpose.partial().optional(),
});
export const createGoalFromTemplateSchema = z.object({ id: id.optional(), templateId: z.string().min(1).max(64) });
/** A purpose patch: only the quadrants sent are changed (no defaults, so omitted ones are never blanked). */
const purposePatch = z.object({
  selfTangible: text(LIMITS.purposeQuadrant).optional(),
  selfIntangible: text(LIMITS.purposeQuadrant).optional(),
  othersTangible: text(LIMITS.purposeQuadrant).optional(),
  othersIntangible: text(LIMITS.purposeQuadrant).optional(),
});
export const updateGoalSchema = z.object({
  goalId: id,
  expectedUpdatedAt,
  title: title(LIMITS.goalTitle).optional(),
  vision: text(LIMITS.vision).optional(),
  successCriteria: text(LIMITS.successCriteria).optional(),
  targetDate: localDate.nullable().optional(),
  purpose: purposePatch.optional(),
});
export const goalIdSchema = z.object({ goalId: id });
export const deleteGoalPermanentlySchema = z.object({
  goalId: id,
  confirmTitle: z.string().max(LIMITS.goalTitle + 10),
});

// ---------- Outcomes ----------

const measure = z.object({
  target: z.number().finite().positive('Target must be greater than 0'),
  current: z.number().finite().min(0, 'Cannot be negative').default(0),
  unit: text(LIMITS.measureUnit).default(''),
});

export const addOutcomeSchema = z.object({
  id: id.optional(),
  goalId: id,
  position,
  title: title(LIMITS.outcomeTitle),
  description: text(LIMITS.outcomeDescription).optional(),
  measure: measure.nullable().optional(),
});
export const updateOutcomeSchema = z.object({
  outcomeId: id,
  expectedUpdatedAt,
  title: title(LIMITS.outcomeTitle).optional(),
  description: text(LIMITS.outcomeDescription).optional(),
  measure: measure.nullable().optional(),
});
export const updateMeasureCurrentSchema = z.object({
  outcomeId: id,
  current: z.number().finite().min(0, 'Cannot be negative'),
});
export const outcomeIdSchema = z.object({ outcomeId: id });
export const reorderOutcomesSchema = z.object({
  goalId: id,
  orderedIds: z.array(id).min(1).max(8),
});

// ---------- Actions ----------

const weekday = z.number().int().min(0).max(6);
export const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily') }),
  z.object({
    type: z.literal('weekdays'),
    days: z.array(weekday).min(1, 'Pick at least one day').max(7),
  }),
  z.object({ type: z.literal('weekly'), timesPerWeek: z.number().int().min(1).max(7) }),
]);
const actionKind = z.enum(['task', 'routine']);

export const addActionSchema = z.object({
  id: id.optional(),
  outcomeId: id,
  position,
  title: title(LIMITS.actionTitle),
  notes: text(LIMITS.actionNotes).optional(),
  kind: actionKind,
  dueDate: localDate.nullable().optional(),
  schedule: scheduleSchema.nullable().optional(),
});
export const updateActionSchema = z.object({
  actionId: id,
  expectedUpdatedAt,
  title: title(LIMITS.actionTitle).optional(),
  notes: text(LIMITS.actionNotes).optional(),
  kind: actionKind.optional(),
  dueDate: localDate.nullable().optional(),
  schedule: scheduleSchema.nullable().optional(),
});
export const actionIdSchema = z.object({ actionId: id });
export const routineCheckSchema = z.object({ actionId: id, date: localDate });
/** `date` defaults to today in the use case. */
export const focusSchema = z.object({ actionId: id, date: localDate.optional() });
export const moveActionSchema = z.object({
  actionId: id,
  toOutcomeId: id,
  toPosition: z.number().int().min(0).max(7),
});
export const reorderActionsSchema = z.object({
  outcomeId: id,
  orderedIds: z.array(id).min(1).max(8),
});

// ---------- Reflections ----------

const reflectionFields = {
  wentWell: text(LIMITS.reflectionField).optional(),
  didntGoWell: text(LIMITS.reflectionField).optional(),
  nextChange: text(LIMITS.reflectionField).optional(),
};
export const addReflectionSchema = z.object({
  id: id.optional(),
  goalId: id,
  date: localDate,
  kind: z.enum(['daily', 'weekly']),
  ...reflectionFields,
});
export const updateReflectionSchema = z.object({
  reflectionId: id,
  expectedUpdatedAt,
  date: localDate.optional(),
  kind: z.enum(['daily', 'weekly']).optional(),
  ...reflectionFields,
});
export const reflectionIdSchema = z.object({ reflectionId: id });

// ---------- Queries ----------

export const listGoalsSchema = z.object({
  status: z.enum(['active', 'draft', 'achieved', 'archived', 'all']).default('all'),
});
export const goalHistorySchema = z.object({
  goalId: id,
  limit: z.number().int().min(1).max(200).default(50),
  before: z.iso.datetime().optional(),
});
export const listReflectionsSchema = z.object({
  goalId: id,
  limit: z.number().int().min(1).max(100).default(30),
  before: localDate.optional(),
});
export const routineSheetSchema = z.object({
  goalId: id,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export type AddOutcomeInput = z.infer<typeof addOutcomeSchema>;
export type UpdateOutcomeInput = z.infer<typeof updateOutcomeSchema>;
export type AddActionInput = z.infer<typeof addActionSchema>;
export type UpdateActionInput = z.infer<typeof updateActionSchema>;
export type ScheduleInput = z.infer<typeof scheduleSchema>;
export type AddReflectionInput = z.infer<typeof addReflectionSchema>;
export type UpdateReflectionInput = z.infer<typeof updateReflectionSchema>;
