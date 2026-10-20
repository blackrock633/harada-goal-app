import { LocalDate } from './types.js';
import { DomainError } from './errors.js';

export function isValidLocalDate(str: string): str is LocalDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(str);
}

export function assertLocalDate(str: string, field?: string): asserts str is LocalDate {
  if (!isValidLocalDate(str)) {
    throw new DomainError('VALIDATION', `Invalid local date format: ${str}`, field);
  }
}

export function addDays(date: LocalDate, days: number): LocalDate {
  assertLocalDate(date);
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0] as LocalDate;
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  assertLocalDate(a);
  assertLocalDate(b);
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function weekdayOf(date: LocalDate): 0|1|2|3|4|5|6 {
  assertLocalDate(date);
  const d = new Date(date + 'T00:00:00Z');
  return d.getUTCDay() as 0|1|2|3|4|5|6;
}

export function isoWeekStart(date: LocalDate): LocalDate {
  assertLocalDate(date);
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
}

export function isoWeekEnd(date: LocalDate): LocalDate {
  return addDays(isoWeekStart(date), 6);
}

export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  if (from > to) return [];
  const days = diffDays(from, to);
  const res: LocalDate[] = [];
  for (let i = 0; i <= days; i++) {
    res.push(addDays(from, i));
  }
  return res;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch (e) {
    return false;
  }
}

export function localDateInZone(instant: Date, timeZone: string): LocalDate {
  let tz = timeZone;
  if (!isValidTimeZone(tz)) {
    tz = 'UTC';
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}` as LocalDate;
}

export function monthDays(yearMonth: string): LocalDate[] {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new DomainError('VALIDATION', 'Invalid year-month');
  const d = new Date(yearMonth + '-01T00:00:00Z');
  if (isNaN(d.getTime())) throw new DomainError('VALIDATION', 'Invalid year-month');
  const from = d.toISOString().split('T')[0] as LocalDate;
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  const to = d.toISOString().split('T')[0] as LocalDate;
  return eachDay(from, to);
}
