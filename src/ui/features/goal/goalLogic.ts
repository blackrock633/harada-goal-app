import { createGoalSchema } from '@/application/schemas';
import type { AppErrorCode, Result } from '@/application/result';
import { errorMessage } from '@/ui/errors';
import { LIMITS } from '@/domain/limits';

export type PurposeKey = 'selfTangible' | 'selfIntangible' | 'othersTangible' | 'othersIntangible';

export interface GoalDraft {
  title: string;
  vision: string;
  successCriteria: string;
  targetDate: string;
  purpose: Record<PurposeKey, string>;
}

export type FieldKey = 'title' | 'targetDate' | 'vision' | 'successCriteria' | PurposeKey;
export type FieldErrors = Partial<Record<FieldKey, string>>;

/** Order used for focusing the first invalid field. */
export const FIELD_ORDER: FieldKey[] = [
  'title',
  'targetDate',
  'successCriteria',
  'vision',
  'selfTangible',
  'selfIntangible',
  'othersTangible',
  'othersIntangible',
];

export const PURPOSE_FIELDS: { key: PurposeKey; label: string; hint: string }[] = [
  { key: 'selfTangible', label: 'For me, something concrete', hint: 'What would change in your life that you could point to?' },
  { key: 'selfIntangible', label: 'For me, how it will feel', hint: 'Confidence, calm, pride, freedom.' },
  { key: 'othersTangible', label: 'For others, something concrete', hint: 'Who benefits, and how would they notice?' },
  { key: 'othersIntangible', label: 'For others, how it will feel', hint: 'Trust, pride, closeness.' },
];

export const emptyDraft = (): GoalDraft => ({
  title: '',
  vision: '',
  successCriteria: '',
  targetDate: '',
  purpose: { selfTangible: '', selfIntangible: '', othersTangible: '', othersIntangible: '' },
});

export function localToday(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function daysBetween(fromDate: string, toDate: string): number {
  const a = new Date(`${fromDate}T00:00:00`).getTime();
  const b = new Date(`${toDate}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Observable signal: a number, a date/time word, or a "someone would notice" phrase. */
const SIGNAL = /\d|\b(daily|weekly|monthly|every|each|per|by|until|before|first|noticed?|says?|tell|told|see|sees|finish(ed)?|publish(ed)?|launch(ed)?|ship(ped)?|complete[d]?)\b|[%$€£]/i;

export function criteriaNeedsSignal(criteria: string): boolean {
  const v = criteria.trim();
  return v.length >= 12 && !SIGNAL.test(v);
}

export const FIELD_LIMITS = {
  title: LIMITS.goalTitle,
  vision: LIMITS.vision,
  successCriteria: LIMITS.successCriteria,
  purpose: LIMITS.purposeQuadrant,
} as const;

export function buildPayload(draft: GoalDraft) {
  return {
    title: draft.title,
    vision: draft.vision,
    successCriteria: draft.successCriteria,
    targetDate: draft.targetDate ? draft.targetDate : null,
    purpose: { ...draft.purpose },
  };
}

/** Client validation with the shared Zod schema. `strictDate` blocks past/today dates (create). */
export function validateDraft(draft: GoalDraft, today: string, strictDate: boolean): FieldErrors {
  const errors: FieldErrors = {};
  const parsed = createGoalSchema.safeParse(buildPayload(draft));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [first, second] = issue.path;
      const key = (first === 'purpose' ? second : first) as FieldKey | undefined;
      if (key && FIELD_ORDER.includes(key) && !errors[key]) errors[key] = issue.message;
    }
  }
  if (strictDate && draft.targetDate && !errors.targetDate && draft.targetDate <= today) {
    errors.targetDate = 'Pick a date in the future.';
  }
  return errors;
}

export function firstInvalid(errors: FieldErrors): FieldKey | null {
  return FIELD_ORDER.find((k) => errors[k]) ?? null;
}

/** Map server fieldErrors (keys like "title" or "purpose.selfTangible") onto form fields. */
export function mapServerErrors(fieldErrors?: Record<string, string[]>): {
  fields: FieldErrors;
  unmapped: string[];
} {
  const fields: FieldErrors = {};
  const unmapped: string[] = [];
  for (const [rawKey, messages] of Object.entries(fieldErrors ?? {})) {
    const key = rawKey.startsWith('purpose.') ? rawKey.slice(8) : rawKey;
    const message = messages[0];
    if (!message) continue;
    if (FIELD_ORDER.includes(key as FieldKey)) fields[key as FieldKey] = message;
    else unmapped.push(message);
  }
  return { fields, unmapped };
}

export type SubmitOutcome<T> = { ok: true; data: T } | { ok: false; fields: FieldErrors; message: string; code: AppErrorCode };

export function toOutcome<T>(res: Result<T>): SubmitOutcome<T> {
  if (res.ok) return { ok: true, data: res.data };
  const { fields, unmapped } = mapServerErrors(res.error.fieldErrors);
  const hasFields = Object.keys(fields).length > 0;
  const code = res.error.code;
  let message: string;
  if (hasFields && unmapped.length === 0) message = 'Please fix the highlighted fields.';
  else if (code === 'VALIDATION' && unmapped[0]) message = unmapped[0];
  else message = errorMessage(res.error);
  return { ok: false, fields, message, code };
}
