import type { ZodError } from 'zod';
import type { Schedule } from '@/domain/types';

export type FieldErrors = Record<string, string>;

/** First message per top-level field from a Zod error. */
export function zodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** First message per field from a server `error.fieldErrors`. */
export function serverFieldErrors(fe: Record<string, string[]> | undefined): FieldErrors {
  const out: FieldErrors = {};
  if (!fe) return out;
  for (const [k, v] of Object.entries(fe)) if (v[0]) out[k.split('.')[0]!] = v[0];
  return out;
}

export type ScheduleType = Schedule['type'];
export interface ScheduleState {
  type: ScheduleType;
  days: number[];
  timesPerWeek: string;
}
export const DEFAULT_SCHEDULE_STATE: ScheduleState = { type: 'daily', days: [], timesPerWeek: '3' };

export function scheduleToState(s: Schedule | null | undefined): ScheduleState {
  if (!s) return { ...DEFAULT_SCHEDULE_STATE };
  if (s.type === 'weekdays') return { type: 'weekdays', days: [...s.days], timesPerWeek: '3' };
  if (s.type === 'weekly') return { type: 'weekly', days: [], timesPerWeek: String(s.timesPerWeek) };
  return { ...DEFAULT_SCHEDULE_STATE };
}

export function stateToSchedule(s: ScheduleState): unknown {
  if (s.type === 'weekdays') return { type: 'weekdays', days: [...s.days].sort((a, b) => a - b) };
  if (s.type === 'weekly') {
    const n = s.timesPerWeek.trim() === '' ? NaN : Number(s.timesPerWeek);
    return { type: 'weekly', timesPerWeek: n };
  }
  return { type: 'daily' };
}

/** Keep the focused field visible above the on-screen keyboard. */
export function scrollFieldIntoView(target: EventTarget | null): void {
  const el = target as HTMLElement | null;
  if (!el || typeof el.scrollIntoView !== 'function') return;
  const run = () => el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  run();
  // The keyboard animates in after focus; re-centre when the visual viewport settles.
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (vv) {
    const once = () => {
      vv.removeEventListener('resize', once);
      if (document.activeElement === el) run();
    };
    vv.addEventListener('resize', once);
    setTimeout(() => vv.removeEventListener('resize', once), 1000);
  }
}
