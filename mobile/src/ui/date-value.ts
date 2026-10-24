/** Calendar dates travel as 'YYYY-MM-DD' strings (the API contract). Pickers work in Date. */

/** Local noon, so no time zone can shift the calendar day. */
export function toPickerDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, 12) : new Date();
}

export function fromPickerDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "Sat, 24 Oct 2026" in the device locale. */
export function formatDateValue(value: string): string {
  return toPickerDate(value).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
