import type { ReflectionDTO } from '@shared/application/dto';
import type { ReflectionKind, ReviewAnswerKey } from '@shared/domain/types';

/** The three answers every reflection has (columns on reflections). */
export type FieldKey = 'wentWell' | 'didntGoWell' | 'nextChange';
/** A question writes either one of the three fields or one Pro answer (reflections.answers). */
export type QuestionKey = FieldKey | ReviewAnswerKey;
export type Question = { key: QuestionKey; label: string };

const FIELD_KEYS: readonly FieldKey[] = ['wentWell', 'didntGoWell', 'nextChange'];
export const isFieldKey = (k: QuestionKey): k is FieldKey => (FIELD_KEYS as readonly string[]).includes(k);

/**
 * Free: the same three answers asked at two distances (a daily check-in, a weekly step back).
 * Pro: the weekly review asks the full seven questions, and the monthly review checks the strategy.
 * Every Pro set still writes the three fields, so a Pro review reads well anywhere reflections show.
 */
export const QUESTIONS = {
  daily: [
    { key: 'wentWell', label: 'What did you get done today?' },
    { key: 'didntGoWell', label: 'What got in the way?' },
    { key: 'nextChange', label: "What's your first step tomorrow?" },
  ],
  weekly: [
    { key: 'wentWell', label: 'What went well this week?' },
    { key: 'didntGoWell', label: "What didn't go to plan?" },
    { key: 'nextChange', label: 'What will you change next week?' },
  ],
  weeklyFull: [
    { key: 'intended', label: 'What did you intend to accomplish this week?' },
    { key: 'completed', label: 'What did you actually complete?' },
    { key: 'wentWell', label: 'What worked well?' },
    { key: 'didntGoWell', label: 'What prevented progress?' },
    { key: 'learned', label: 'What did you learn?' },
    { key: 'nextChange', label: 'What needs to change?' },
    { key: 'priorities', label: 'What are the most important actions for next week?' },
  ],
  monthly: [
    { key: 'wentWell', label: 'What moved the goal forward this month?' },
    { key: 'didntGoWell', label: 'What held it back?' },
    { key: 'strategy', label: 'Is your strategy still right? What would you adjust?' },
    { key: 'learned', label: 'What did you learn?' },
    { key: 'priorities', label: 'What will you focus on next month?' },
    { key: 'nextChange', label: 'What will you change?' },
  ],
} satisfies Record<string, Question[]>;

/** The questions for a kind. Without the full set only the three fields are asked. */
export function questionsFor(kind: ReflectionKind, full: boolean): Question[] {
  if (kind === 'daily') return QUESTIONS.daily;
  if (kind === 'weekly') return full ? QUESTIONS.weeklyFull : QUESTIONS.weekly;
  return full ? QUESTIONS.monthly : QUESTIONS.monthly.filter((q) => isFieldKey(q.key));
}

export const hasAnswers = (r: Pick<ReflectionDTO, 'answers'>) =>
  Object.values(r.answers ?? {}).some((v) => typeof v === 'string' && v.trim() !== '');

/** The question set a saved reflection was written with: the full set when it has Pro answers. */
export const questionsOf = (r: ReflectionDTO) => questionsFor(r.kind, r.kind === 'monthly' || hasAnswers(r));

export function answerOf(r: ReflectionDTO, key: QuestionKey): string {
  return (isFieldKey(key) ? r[key] : r.answers?.[key]) ?? '';
}
