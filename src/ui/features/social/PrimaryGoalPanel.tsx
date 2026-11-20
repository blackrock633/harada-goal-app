import * as React from 'react';
import type { PrimaryGoalDTO } from '@/application/social';
import { ProgressBar } from '@/ui/primitives';

export interface PrimaryGoalPanelProps {
  goal: PrimaryGoalDTO;
  /** Owner view: says when metrics are hidden from other people. */
  metricsHiddenFromOthers?: boolean;
}

/**
 * What this person is working toward, and the work behind it. Every figure comes from the database
 * (harada_private.goal_progress_metrics); the definitions below are the same ones it uses.
 */
export function PrimaryGoalPanel({ goal, metricsHiddenFromOthers }: PrimaryGoalPanelProps) {
  const m = goal.metrics;
  const achieved = goal.status === 'achieved';
  const taskProgress = m && m.tasksTotal > 0 ? m.tasksCompleted / m.tasksTotal : null;

  return (
    <section aria-labelledby="primary-goal-heading" className="space-y-5">
      <div className="space-y-1">
        <p className="font-mono text-xs tracking-[0.18em] text-ink-muted uppercase">
          {achieved ? 'Goal achieved' : 'Current goal'}
        </p>
        <h3 id="primary-goal-heading" className="font-serif text-2xl leading-snug text-ink">
          {goal.title}
        </h3>
        {metricsHiddenFromOthers && (
          <p className="text-xs text-ink-muted">Progress figures are hidden from other people.</p>
        )}
      </div>

      {m && (
        <>
          <ProgressBar
            progress={taskProgress}
            label={m.tasksTotal > 0 ? `Tasks completed · ${m.tasksCompleted} of ${m.tasksTotal}` : 'No tasks planned yet'}
          />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Metric
              label={achieved ? 'Days to achieve' : 'Days pursuing'}
              value={m.daysPursuing ?? '—'}
            />
            <Metric label="Actions completed" value={m.actionsCompleted} />
            <Metric
              label="Consistency"
              value={m.consistency ? `${Math.round(m.consistency.rate * 100)}%` : '—'}
              note={m.consistency ? `${m.consistency.activeDays} of ${m.consistency.windowDays} days` : undefined}
            />
            <Metric
              label="Key areas complete"
              value={m.keyAreasTotal > 0 ? `${m.keyAreasComplete}/${m.keyAreasTotal}` : '—'}
            />
          </dl>
          <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer select-none hover:text-ink">How these are measured</summary>
            <ul className="mt-2 max-w-[68ch] list-disc space-y-1 pl-4">
              <li>Actions completed: tasks done plus routine check-ins recorded on the day or up to two days after.</li>
              <li>
                Consistency: days with at least one completed action, out of the last 30 days of this goal (or fewer
                for a newer goal).
              </li>
              <li>
                A key area is complete when its measure reaches its target or, without a measure, when all of its
                tasks are done.
              </li>
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="min-w-0 border-t border-rule pt-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-serif text-2xl text-ink tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-ink-muted tabular-nums">{note}</dd>}
    </div>
  );
}
