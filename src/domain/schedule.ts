import { Schedule, LocalDate } from './types.js';
import { weekdayOf } from './dates.js';

/**
 * Whether a routine with this schedule is due on `date`, for the schedules that name their days (daily, weekdays,
 * monthly, dates). Weekly routines are a quota ("3 times a week") with no fixed days, so the answer is null and
 * callers count checks per week instead.
 */
export function isScheduledOn(schedule: Schedule, date: LocalDate): boolean | null {
  switch (schedule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return schedule.days.includes(weekdayOf(date));
    case 'monthly': {
      const day = Number(date.slice(8, 10));
      if (schedule.daysOfMonth.includes(day)) return true;
      // The 29th–31st fall on the last day of a month that has fewer days.
      const last = daysInMonth(date);
      return day === last && schedule.daysOfMonth.some((d) => d > last);
    }
    case 'dates':
      return schedule.dates.includes(date);
    case 'weekly':
      return null;
  }
}

/** Number of days in the month of `date` (YYYY-MM-DD). */
export function daysInMonth(date: LocalDate): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
