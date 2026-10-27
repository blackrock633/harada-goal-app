import * as React from 'react';
import type { SharedCardDTO } from '@/application/web-public';

const KIND_LABEL: Record<SharedCardDTO['kind'], string> = {
  progress: 'Progress',
  weekly: 'This week',
  challenge: '30-Day Challenge',
};

function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The stat lines a card shows, from only the stats present in the snapshot. */
export function statLines(card: SharedCardDTO): string[] {
  const s = card.stats;
  if (!s) return [];
  const out: string[] = [];
  if (card.kind === 'progress') {
    if (s.tasksDone !== undefined && s.tasksTotal !== undefined) out.push(`${s.tasksDone} of ${plural(s.tasksTotal, 'task', 'tasks')} done`);
    if (s.keyAreas !== undefined) out.push(`${plural(s.keyAreas, 'key area', 'key areas')} planned`);
    if (s.actionsPlanned !== undefined) out.push(`${plural(s.actionsPlanned, 'action', 'actions')} planned`);
  } else if (card.kind === 'weekly') {
    const week = formatDay(s.weekStart);
    if (week) out.push(`Week of ${week}`);
    if (s.tasksCompleted !== undefined) out.push(`${plural(s.tasksCompleted, 'task', 'tasks')} completed`);
    if (s.tasksDue !== undefined) out.push(`${plural(s.tasksDue, 'task', 'tasks')} due this week`);
    if (s.routineChecks !== undefined) out.push(`${plural(s.routineChecks, 'routine check', 'routine checks')}`);
  } else {
    if (s.completed) out.push('Finished all 30 days');
    else if (s.day !== undefined) out.push(`Day ${s.day} of 30`);
    if (s.activeDays !== undefined) out.push(`${plural(s.activeDays, 'active day', 'active days')}`);
  }
  return out;
}

/**
 * A shared progress card. Renders only the snapshot fields that are present, as plain text (React escapes it).
 */
export function SharedCard({ card, createdAt }: { card: SharedCardDTO; createdAt?: string | null }) {
  const stats = statLines(card);
  const shared = formatDay(createdAt);
  const notes: [string, string | undefined][] = [
    ['Accomplishment', card.accomplishment],
    ['Milestone', card.milestone],
    ['Lesson', card.lesson],
    ['Next priority', card.nextPriority],
  ];
  return (
    <article aria-labelledby="card-title" className="min-w-0 rounded-[var(--radius-md)] border border-rule bg-surface p-5 md:p-8">
      <p className="text-sm font-medium text-accent">{KIND_LABEL[card.kind]}</p>
      <h1 id="card-title" className="mt-1 break-words font-serif text-2xl font-medium text-ink [overflow-wrap:anywhere] md:text-3xl">
        {card.goalTitle ?? 'A Harada goal'}
      </h1>
      {card.name && <p className="mt-1 break-words text-ink-muted [overflow-wrap:anywhere]" data-field="name">Shared by {card.name}</p>}
      {stats.length > 0 && (
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-ink" aria-label="Progress" data-field="stats">
          {stats.map((l) => <li key={l} className="font-medium">{l}</li>)}
        </ul>
      )}
      {notes.some(([, v]) => v) && (
        <dl className="mt-6 space-y-4">
          {notes.map(([label, value]) =>
            value ? (
              <div key={label} className="min-w-0">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-line break-words text-ink [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
      )}
      {shared && <p className="mt-6 text-sm text-ink-muted">Shared {shared}</p>}
    </article>
  );
}
