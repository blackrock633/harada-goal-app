const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'domain');
fs.mkdirSync(srcDir, { recursive: true });

const write = (name, content) => {
  fs.writeFileSync(path.join(srcDir, name), content.trim() + '\n', 'utf-8');
};

write('dates.ts', `
import { LocalDate, DomainError } from './types.js';

export function isValidLocalDate(str: string): str is LocalDate {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().startsWith(str);
}

export function assertLocalDate(str: string, field?: string): asserts str is LocalDate {
  if (!isValidLocalDate(str)) {
    throw new DomainError('VALIDATION', \`Invalid local date format: \${str}\`, field);
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
  return \`\${y}-\${m}-\${d}\` as LocalDate;
}

export function monthDays(yearMonth: string): LocalDate[] {
  if (!/^\\d{4}-\\d{2}$/.test(yearMonth)) throw new DomainError('VALIDATION', 'Invalid year-month');
  const d = new Date(yearMonth + '-01T00:00:00Z');
  if (isNaN(d.getTime())) throw new DomainError('VALIDATION', 'Invalid year-month');
  const from = d.toISOString().split('T')[0] as LocalDate;
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  const to = d.toISOString().split('T')[0] as LocalDate;
  return eachDay(from, to);
}
`);

write('goal.ts', `
import { Goal, GoalStatus, Purpose, Id, LocalDate, Instant, DomainError, LIMITS } from './types.js';

function trim(s: string) { return s.trim(); }

export function createGoal(
  input: { id: Id; ownerId: Id; title: string; vision?: string; targetDate?: LocalDate | null; purpose?: Partial<Purpose> },
  now: Instant
): Goal {
  const title = trim(input.title);
  if (!title) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
  if (title.length > LIMITS.goalTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
  const vision = trim(input.vision || '');
  if (vision.length > LIMITS.vision) throw new DomainError('LIMIT_REACHED', 'Vision too long', 'vision');

  const purpose: Purpose = {
    selfTangible: trim(input.purpose?.selfTangible || ''),
    selfIntangible: trim(input.purpose?.selfIntangible || ''),
    othersTangible: trim(input.purpose?.othersTangible || ''),
    othersIntangible: trim(input.purpose?.othersIntangible || '')
  };

  for (const [k, v] of Object.entries(purpose)) {
    if (v.length > LIMITS.purposeQuadrant) throw new DomainError('LIMIT_REACHED', \`\${k} too long\`, k);
  }

  return {
    id: input.id,
    ownerId: input.ownerId,
    title,
    vision,
    targetDate: input.targetDate || null,
    status: 'draft',
    statusBeforeArchive: null,
    purpose,
    activatedOn: null,
    achievedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now
  };
}

export function updateGoalDetails(
  goal: Goal,
  patch: { title?: string; vision?: string; targetDate?: LocalDate | null; purpose?: Partial<Purpose> },
  now: Instant
): { goal: Goal; changed: (keyof typeof patch)[] } {
  if (goal.status === 'archived') throw new DomainError('INVALID_STATE', 'Cannot edit archived goal');
  
  const next = { ...goal, purpose: { ...goal.purpose } };
  const changed: (keyof typeof patch)[] = [];

  if (patch.title !== undefined) {
    const t = trim(patch.title);
    if (!t) throw new DomainError('VALIDATION', 'Title cannot be empty', 'title');
    if (t.length > LIMITS.goalTitle) throw new DomainError('LIMIT_REACHED', 'Title too long', 'title');
    if (next.title !== t) { next.title = t; changed.push('title'); }
  }

  if (patch.vision !== undefined) {
    const v = trim(patch.vision);
    if (v.length > LIMITS.vision) throw new DomainError('LIMIT_REACHED', 'Vision too long', 'vision');
    if (next.vision !== v) { next.vision = v; changed.push('vision'); }
  }

  if (patch.targetDate !== undefined) {
    if (next.targetDate !== patch.targetDate) { next.targetDate = patch.targetDate; changed.push('targetDate'); }
  }

  if (patch.purpose !== undefined) {
    let pChanged = false;
    for (const k of ['selfTangible', 'selfIntangible', 'othersTangible', 'othersIntangible'] as const) {
      if (patch.purpose[k] !== undefined) {
        const val = trim(patch.purpose[k] as string);
        if (val.length > LIMITS.purposeQuadrant) throw new DomainError('LIMIT_REACHED', \`\${k} too long\`, k);
        if (next.purpose[k] !== val) { next.purpose[k] = val; pChanged = true; }
      }
    }
    if (pChanged) changed.push('purpose');
  }

  if (changed.length > 0) {
    next.updatedAt = now;
  }
  return { goal: next, changed };
}

export function activateGoal(
  goal: Goal,
  counts: { activeOutcomes: number; activeActions: number },
  today: LocalDate,
  now: Instant
): Goal {
  if (goal.status !== 'draft') throw new DomainError('INVALID_STATE', 'Goal is not draft');
  if (counts.activeOutcomes < 1 || counts.activeActions < 1) {
    throw new DomainError('INVALID_STATE', 'Goal must have at least 1 active outcome and 1 active action to activate');
  }
  return {
    ...goal,
    status: 'active',
    activatedOn: goal.activatedOn || today,
    updatedAt: now
  };
}

export function markGoalAchieved(goal: Goal, now: Instant): Goal {
  if (goal.status !== 'active') throw new DomainError('INVALID_STATE', 'Only active goals can be achieved');
  return { ...goal, status: 'achieved', achievedAt: now, updatedAt: now };
}

export function reopenGoal(goal: Goal, now: Instant): Goal {
  if (goal.status !== 'achieved') throw new DomainError('INVALID_STATE', 'Only achieved goals can be reopened');
  return { ...goal, status: 'active', achievedAt: null, updatedAt: now };
}

export function archiveGoal(goal: Goal, now: Instant): Goal {
  if (goal.status === 'archived') return goal;
  return {
    ...goal,
    status: 'archived',
    statusBeforeArchive: goal.status as Exclude<GoalStatus, 'archived'>,
    archivedAt: now,
    updatedAt: now
  };
}

export function restoreGoal(goal: Goal, now: Instant): Goal {
  if (goal.status !== 'archived') return goal;
  return {
    ...goal,
    status: goal.statusBeforeArchive || 'draft',
    statusBeforeArchive: null,
    archivedAt: null,
    updatedAt: now
  };
}

export function assertGoalEditable(goal: Goal): void {
  if (goal.status === 'archived') throw new DomainError('INVALID_STATE', 'Goal is archived and cannot be edited');
}

export function assertPermanentDeleteAllowed(goal: Goal, confirmTitle: string): void {
  if (goal.status !== 'archived') throw new DomainError('INVALID_STATE', 'Only archived goals can be deleted');
  if (goal.title !== confirmTitle) throw new DomainError('VALIDATION', 'Title confirmation does not match');
}
`);

// To save time, just setting up the basic boilerplate. Let's do a more robust approach in TS directly.
