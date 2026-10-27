import { addDays, diffDays } from '@shared/domain/dates';
import type { LocalDate } from '@shared/domain/types';
import type { ChallengeDay, ChallengeSummary, Enrollment } from '@/data/premium';
import { formatLocalDate } from '@/features/today/format';

/** The challenge length. The server fixes it (end = start + 29); the UI only labels it. */
export const CHALLENGE_DAYS = 30;
/** The days with a planned stop: weekly reviews on 7/14/21, the report on 30. */
export const CHECKPOINTS = [7, 14, 21, 30] as const;
/** complete_challenge limits (also enforced by the server). */
export const MAX_ACCOMPLISHMENTS = 5;
export const MAX_ACCOMPLISHMENT_LENGTH = 200;

/** Start and end of a challenge that starts today: 30 days including both ends. */
export function challengeWindow(today: string): { start: string; end: string } {
  return { start: today, end: addDays(today as LocalDate, CHALLENGE_DAYS - 1) };
}

/** Day number of an enrollment on `today`: 0 before the start, then 1..30 (held at 30 after the end). */
export function dayOf(enrollment: Pick<Enrollment, 'startDate'>, today: string): number {
  const d = diffDays(enrollment.startDate as LocalDate, today as LocalDate) + 1;
  return Math.max(0, Math.min(CHALLENGE_DAYS, d));
}

export const activeEnrollment = (list: Enrollment[] | undefined) => list?.find((e) => e.status === 'active');

export type CellState = 'active' | 'empty' | 'future';
export interface CalendarCell {
  day: number;
  date: string;
  state: CellState;
  today: boolean;
}

const hasActivity = (d: ChallengeDay | undefined) => !!d && d.tasksCompleted + d.routineChecks + d.reflections > 0;

/** The 30 cells of the strip, from the stored per-day counts (missing days count as no activity). */
export function calendarCells(s: Pick<ChallengeSummary, 'enrollment' | 'day' | 'days'>): CalendarCell[] {
  const byDate = new Map(s.days.map((d) => [d.date, d]));
  return Array.from({ length: CHALLENGE_DAYS }, (_, i) => {
    const day = i + 1;
    const date = addDays(s.enrollment.startDate as LocalDate, i);
    const future = day > s.day;
    return { day, date, today: day === s.day, state: future ? 'future' : hasActivity(byDate.get(date)) ? 'active' : 'empty' };
  });
}

/** Past days (before today) with nothing logged. Today does not count: it is not over. */
export function missedDays(cells: CalendarCell[]): number {
  return cells.filter((c) => c.state === 'empty' && !c.today).length;
}

/** Neutral: states the fact and that nothing resets. Never a streak, never blame. */
export function missedDaysCopy(n: number): string | null {
  if (n <= 0) return null;
  return `No activity logged on ${n} ${n === 1 ? 'day' : 'days'}. Pick up where you are — nothing resets.`;
}

/** One sentence a screen reader gets for the whole strip. */
export function calendarSummary(cells: CalendarCell[], day: number): string {
  if (day === 0) return `Calendar: the challenge has not started yet. ${CHALLENGE_DAYS} days ahead.`;
  const active = cells.filter((c) => c.state === 'active').length;
  return `Calendar: activity logged on ${active} of ${day} ${day === 1 ? 'day' : 'days'} so far. Today is day ${day} of ${CHALLENGE_DAYS}.`;
}

/** The next planned stop at or after `day`. */
export function nextCheckpoint(day: number): { day: number; label: string; inDays: number } {
  const next = CHECKPOINTS.find((c) => c >= Math.max(day, 1)) ?? CHALLENGE_DAYS;
  return { day: next, label: next === CHALLENGE_DAYS ? 'Final report' : 'Weekly review', inDays: next - Math.max(day, 1) };
}

export function inDaysText(n: number): string {
  if (n <= 0) return 'today';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

/** First day of a review week (week 1 = days 1-7, ..., week 5 = days 29-30). */
export const weekStartDay = (week: number) => (week - 1) * 7 + 1;

export const shortDate = (date: string) => formatLocalDate(date, 'short');
export const longDate = (date: string) => formatLocalDate(date, 'medium');

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
