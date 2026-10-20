import * as React from 'react';
import type { GoalEventDTO, OutcomeDTO, ReflectionDTO } from '@/application/dto';
import { formatLocalDate } from '@/ui/format';
import { EmptyState, ProgressBar } from '@/ui/primitives';
import { ReflectionCard } from './ReflectionCard';

export interface ReviewViewProps {
  /** Slot for <ReflectionForm />. */
  reflectionForm: React.ReactNode;
  /** Tasks completed in the current week. */
  completedThisWeek: number;
  outcomes: OutcomeDTO[];
  reflections: ReflectionDTO[];
  events: GoalEventDTO[];
}

type TimelineEntry =
  | { type: 'reflection'; date: string; sort: string; item: ReflectionDTO }
  | { type: 'event'; date: string; sort: string; item: GoalEventDTO };

/** Local-date key of an ISO instant (matches how the user sees their calendar). */
function isoToLocalDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function buildTimeline(reflections: ReflectionDTO[], events: GoalEventDTO[]) {
  const entries: TimelineEntry[] = [
    ...reflections.map((r): TimelineEntry => ({ type: 'reflection', date: r.date, sort: r.createdAt, item: r })),
    ...events.map((e): TimelineEntry => ({ type: 'event', date: isoToLocalDate(e.occurredAt), sort: e.occurredAt, item: e })),
  ];
  entries.sort((a, b) => (a.date === b.date ? b.sort.localeCompare(a.sort) : b.date.localeCompare(a.date)));
  const groups: { date: string; entries: TimelineEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.entries.push(e);
    else groups.push({ date: e.date, entries: [e] });
  }
  return groups;
}

export function ReviewView({ reflectionForm, completedThisWeek, outcomes, reflections, events }: ReviewViewProps) {
  const groups = buildTimeline(reflections, events);
  return (
    <div className="space-y-10">
      <section aria-labelledby="reflect-heading" className="space-y-3">
        <h2 id="reflect-heading" className="font-serif text-xl font-semibold text-ink">
          Reflect
        </h2>
        {reflectionForm}
      </section>

      <section aria-labelledby="week-heading" className="space-y-3">
        <h2 id="week-heading" className="font-serif text-xl font-semibold text-ink">
          This week
        </h2>
        <p className="text-sm text-ink-muted">
          {completedThisWeek === 0
            ? 'No tasks completed yet this week.'
            : `${completedThisWeek} ${completedThisWeek === 1 ? 'task' : 'tasks'} completed this week.`}
        </p>
        {outcomes.length === 0 ? (
          <EmptyState title="No key areas yet" description="Add key areas in the matrix to see them here." />
        ) : (
          <ul className="space-y-4">
            {outcomes.map((o) => {
              const tasks = o.actions.filter((a) => a.kind === 'task' && !a.archivedAt);
              const doneCount = tasks.filter((a) => a.completedAt).length;
              return (
                <li key={o.id} className="space-y-1">
                  <p className="break-words font-medium text-ink">{o.title}</p>
                  {tasks.length === 0 ? (
                    <p className="text-sm text-ink-muted">No tasks yet</p>
                  ) : (
                    <>
                      <p className="text-sm text-ink-muted">
                        {doneCount} of {tasks.length} tasks done
                      </p>
                      <ProgressBar progress={doneCount / tasks.length} label="Action completion" />
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="font-serif text-xl font-semibold text-ink">
          Recent activity
        </h2>
        {groups.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="Reflections and changes to your plan will appear here as you go."
          />
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.date} data-testid="timeline-group">
                <h3 className="mb-2 text-sm font-semibold text-ink-muted">{formatLocalDate(g.date, 'long')}</h3>
                <ul className="space-y-3 border-l border-rule pl-4">
                  {g.entries.map((e) =>
                    e.type === 'event' ? (
                      <li key={`e-${e.item.id}`} className="text-sm text-ink">
                        {e.item.summary}
                      </li>
                    ) : (
                      <li key={`r-${e.item.id}`}>
                        <ReflectionCard reflection={e.item} />
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
