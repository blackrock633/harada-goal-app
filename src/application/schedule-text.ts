/**
 * Plain-language summaries of the monthly and specific-dates schedules, shared by the web and mobile editors and
 * lists so both say the same thing.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  const suffix = rem100 >= 11 && rem100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** "Monthly on the 1st", "Monthly on the 1st and 15th", "Monthly on the 31st (or last day)". */
export function describeMonthly(daysOfMonth: number[]): string {
  const days = [...daysOfMonth].sort((a, b) => a - b).map(ordinal);
  const list = days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
  const lateDay = daysOfMonth.some((d) => d >= 29);
  return `Monthly on the ${list}${lateDay ? ' (or last day)' : ''}`;
}

/** "2026-11-07" → "Nov 7" (with the year when it differs from `currentYear`). */
export function shortDate(date: string, currentYear?: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = `${MONTHS[(m ?? 1) - 1]} ${d}`;
  return currentYear !== undefined && y !== currentYear ? `${base}, ${y}` : base;
}

/** "Nov 7 · Dec 12", or the first three and "+N more". */
export function describeDates(dates: string[], currentYear?: number): string {
  const sorted = [...dates].sort();
  const shown = sorted.slice(0, 3).map((d) => shortDate(d, currentYear)).join(' · ');
  return sorted.length > 3 ? `${shown} · +${sorted.length - 3} more` : shown;
}
