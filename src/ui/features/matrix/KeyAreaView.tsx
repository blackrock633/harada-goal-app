'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarCheck, CalendarPlus, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { clsx } from 'clsx';
import type { ActionDTO, GoalDetailDTO, OutcomeFieldsDTO } from '@/application/dto';
import { errorMessage } from '@/ui/errors';
import type { ExecutionMutations, FocusMutations, MatrixMutations } from '@/ui/actions';
import { describeSchedule, formatLocalDate, relativeDay } from '@/ui/format';
import { routes } from '@/ui/routes';
import { Button, CheckCircle } from '@/ui/primitives';
import { ActionEditorSheet, type ActionEditorMode } from './ActionEditorSheet';
import { KeyAreaEditor } from './KeyAreaEditor';
import { AREA_COUNT, SLOT_COUNT, buildMatrix, doneLabel } from '@/application/matrix';

export interface KeyAreaViewProps {
  goal: GoalDetailDTO;
  /** Key area position 0..7 (out-of-range values are wrapped). */
  position: number;
  /** Today's LocalDate (YYYY-MM-DD) in the user's time zone. */
  today: string;
  matrix: MatrixMutations;
  execution: ExecutionMutations;
  focus: FocusMutations;
  /** Called with a user-facing message when an optimistic change was rolled back. */
  onError: (message: string) => void;
  /** Called after any successful mutation so the page can refresh. */
  onChanged?: () => void;
  /** Wired by the page (router.refresh); offered on CONFLICT. */
  onReloadLatest?: () => void;
}

const wrap = (n: number) => ((Math.trunc(n) % AREA_COUNT) + AREA_COUNT) % AREA_COUNT;

export function KeyAreaView({ goal, position, today, matrix, execution, focus, onError, onChanged, onReloadLatest }: KeyAreaViewProps) {
  const pos = wrap(Number.isFinite(position) ? position : 0);
  const model = React.useMemo(() => buildMatrix(goal), [goal]);
  const area = model.areas[pos]!;
  const outcome = area.outcome;

  const [overrides, setOverrides] = React.useState<Record<string, ActionDTO>>({});
  const [outcomeOverride, setOutcomeOverride] = React.useState<Pick<OutcomeFieldsDTO, 'id' | 'title' | 'description' | 'updatedAt'> | null>(null);
  const inFlight = React.useRef(new Set<string>());
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState(false);
  const [areaDirty, setAreaDirty] = React.useState(false);
  const [resetKey, setResetKey] = React.useState(0);
  const [blocked, setBlocked] = React.useState(false);
  const [sheet, setSheet] = React.useState<{ open: boolean; mode: ActionEditorMode } | null>(null);

  // Server data is authoritative once the page re-renders with a fresh goal.
  React.useEffect(() => {
    setOverrides({});
    setOutcomeOverride(null);
  }, [goal]);

  React.useEffect(() => {
    if (!areaDirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [areaDirty]);

  const effective = (a: ActionDTO) => overrides[a.id] ?? a;

  async function toggle(original: ActionDTO) {
    const a = effective(original);
    if (inFlight.current.has(a.id)) return;
    let optimistic: ActionDTO;
    let run: () => ReturnType<ExecutionMutations['completeAction']>;
    if (a.kind === 'task') {
      const done = !!a.completedAt;
      optimistic = { ...a, completedAt: done ? null : new Date().toISOString() };
      run = () => (done ? execution.reopenAction({ actionId: a.id }) : execution.completeAction({ actionId: a.id }));
    } else {
      if (!a.dueToday) return;
      const checked = a.checkedToday;
      optimistic = { ...a, checkedToday: !checked };
      run = () =>
        checked
          ? execution.uncheckRoutine({ actionId: a.id, date: today })
          : execution.checkRoutine({ actionId: a.id, date: today });
    }
    const prev = overrides[a.id];
    const restore = () =>
      setOverrides((o) => {
        const n = { ...o };
        if (prev) n[a.id] = prev;
        else delete n[a.id];
        return n;
      });
    inFlight.current.add(a.id);
    setBusy(new Set(inFlight.current));
    setOverrides((o) => ({ ...o, [a.id]: optimistic }));
    try {
      const res = await run();
      if (res.ok) {
        setOverrides((o) => ({ ...o, [a.id]: res.data }));
        onChanged?.();
      } else {
        restore();
        onError(errorMessage(res.error));
      }
    } catch {
      restore();
      onError('Could not update the action. Check your connection and try again.');
    } finally {
      inFlight.current.delete(a.id);
      setBusy(new Set(inFlight.current));
    }
  }

  async function toggleFocus(original: ActionDTO) {
    const a = effective(original);
    if (inFlight.current.has(a.id)) return;
    const on = a.focusedToday;
    const optimistic: ActionDTO = { ...a, focusedToday: !on };
    const prev = overrides[a.id];
    const restore = () =>
      setOverrides((o) => {
        const n = { ...o };
        if (prev) n[a.id] = prev;
        else delete n[a.id];
        return n;
      });
    inFlight.current.add(a.id);
    setBusy(new Set(inFlight.current));
    setOverrides((o) => ({ ...o, [a.id]: optimistic }));
    try {
      const res = await (on ? focus.removeFromToday({ actionId: a.id }) : focus.addToToday({ actionId: a.id }));
      if (res.ok) {
        setOverrides((o) => ({ ...o, [a.id]: res.data }));
        onChanged?.();
      } else {
        restore();
        onError(errorMessage(res.error));
      }
    } catch {
      restore();
      onError('Could not update today\'s list. Check your connection and try again.');
    } finally {
      inFlight.current.delete(a.id);
      setBusy(new Set(inFlight.current));
    }
  }

  const canFocus = goal.status !== 'achieved' && goal.status !== 'archived';

  const prevPos = wrap(pos - 1);
  const nextPos = wrap(pos + 1);
  const guard = (e: React.MouseEvent) => {
    if (areaDirty) {
      e.preventDefault();
      setBlocked(true);
    }
  };
  const title = outcomeOverride?.title ?? outcome?.title;
  const description = outcomeOverride?.description ?? outcome?.description ?? '';

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4">
      <nav aria-label="Key area navigation" className="flex items-center justify-between gap-2">
        <Link
          href={routes.keyArea(goal.id, prevPos)}
          onClick={guard}
          aria-label={`Previous key area (${prevPos + 1})`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-[var(--radius-sm)] px-2 text-sm text-ink-muted hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Prev
        </Link>
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Key area {pos + 1} of {AREA_COUNT}
        </span>
        <Link
          href={routes.keyArea(goal.id, nextPos)}
          onClick={guard}
          aria-label={`Next key area (${nextPos + 1})`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-[var(--radius-sm)] px-2 text-sm text-ink-muted hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </nav>

      {blocked && areaDirty && (
        <div role="alert" className="min-w-0 rounded-[var(--radius-sm)] border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="text-ink">You have unsaved changes to this key area. Save them, or discard them to move on.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setResetKey((k) => k + 1);
                setEditing(false);
                setAreaDirty(false);
                setBlocked(false);
              }}
            >
              Discard changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setBlocked(false)}>
              Keep editing
            </Button>
          </div>
        </div>
      )}

      {!outcome ? (
        <section aria-label={`Create key area ${pos + 1}`} className="min-w-0 rounded-[var(--radius-md)] border border-dashed border-rule-strong bg-paper p-4">
          <h1 className="font-serif text-xl font-semibold">Key area {pos + 1} is empty</h1>
          <p className="mb-3 text-sm text-ink-muted">Name one outcome that moves the goal forward. You can fill the other key areas later.</p>
          <KeyAreaEditor
            key={resetKey}
            mode={{ type: 'create', goalId: goal.id, position: pos }}
            onReloadLatest={onReloadLatest}
            mutations={matrix}
            onDirtyChange={setAreaDirty}
            onDone={() => {
              setAreaDirty(false);
              onChanged?.();
            }}
          />
        </section>
      ) : (
        <>
          <header className="min-w-0 rounded-[var(--radius-md)] bg-accent-soft p-3">
            {editing ? (
              <KeyAreaEditor
                key={resetKey}
                mode={{ type: 'edit', outcome: { id: outcome.id, title: title ?? '', description, updatedAt: outcomeOverride?.updatedAt ?? outcome.updatedAt } }}
                onReloadLatest={onReloadLatest}
                mutations={matrix}
                onDirtyChange={setAreaDirty}
                onCancel={() => {
                  setEditing(false);
                  setAreaDirty(false);
                  setBlocked(false);
                }}
                onDone={(o) => {
                  setOutcomeOverride({ id: o.id, title: o.title, description: o.description, updatedAt: o.updatedAt });
                  setEditing(false);
                  setAreaDirty(false);
                  onChanged?.();
                }}
              />
            ) : (
              <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="font-serif text-xl font-semibold leading-tight [overflow-wrap:anywhere]">{title}</h1>
                  {description && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted [overflow-wrap:anywhere]">{description}</p>}
                  <p className="mt-2 text-xs tabular-nums text-ink-muted">
                    {area.actionCount} of {SLOT_COUNT} action slots planned · {doneLabel(area.doneCount, area.actionCount)}
                  </p>
                  {outcome.measure && (
                    <p className="mt-1 text-xs tabular-nums text-ink-muted">
                      Measure: {outcome.measure.current} / {outcome.measure.target} {outcome.measure.unit}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit key area"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </header>

          <ol aria-label={`Actions in key area ${pos + 1}`} className="min-w-0 space-y-2">
            {area.slots.map((slot) => {
              const act = slot.action ? effective(slot.action) : null;
              if (!act) {
                return (
                  <li key={slot.position}>
                    <button
                      type="button"
                      onClick={() =>
                        setSheet({ open: true, mode: { type: 'add', outcomeId: outcome.id, position: slot.position, heading: `${title}: action ${slot.position + 1} of ${SLOT_COUNT}` } })
                      }
                      aria-label={`Add action ${slot.position + 1} of ${SLOT_COUNT}`}
                      className="flex min-h-[48px] w-full items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-rule-strong px-3 text-sm text-ink-muted hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span className="tabular-nums">{slot.position + 1}.</span> Add action
                    </button>
                  </li>
                );
              }
              const done = act.kind === 'task' && !!act.completedAt;
              const checked = act.kind === 'task' ? done : act.checkedToday;
              const disabled = busy.has(act.id) || (act.kind === 'routine' && !act.dueToday);
              return (
                <li key={slot.position} className="flex min-w-0 items-center rounded-[var(--radius-sm)] border border-rule bg-surface">
                  <CheckCircle
                    kind={act.kind}
                    checked={checked}
                    label={act.kind === 'routine' && !act.dueToday ? `${act.title} (not due today)` : act.title}
                    disabled={disabled}
                    aria-busy={busy.has(act.id) || undefined}
                    onClick={() => void toggle(slot.action!)}
                  />
                  <button
                    type="button"
                    onClick={() => setSheet({ open: true, mode: { type: 'edit', action: act } })}
                    aria-label={`Edit action ${slot.position + 1} of ${SLOT_COUNT}: ${act.title}`}
                    title={act.title}
                    className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-center py-1 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className={clsx('line-clamp-2 text-sm font-medium [overflow-wrap:anywhere]', done && 'text-ink-muted line-through')}>
                      <span aria-hidden="true" className="mr-1 text-ink-muted">{act.kind === 'routine' ? '↻' : '○'}</span>
                      {act.title}
                    </span>
                    <span className="text-xs text-ink-muted [overflow-wrap:anywhere]">
                      {busy.has(act.id) ? (
                        <span role="status" className="font-medium text-ink">Saving…</span>
                      ) : (
                        statusText(act, today)
                      )}
                    </span>
                  </button>
                  {canFocus && !act.archivedAt && (
                    <button
                      type="button"
                      onClick={() => void toggleFocus(slot.action!)}
                      disabled={busy.has(act.id)}
                      aria-pressed={act.focusedToday}
                      aria-label={`${act.focusedToday ? 'Remove from today' : 'Add to today'}: ${act.title}`}
                      className={clsx(
                        'mr-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-[var(--radius-sm)] px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60',
                        act.focusedToday ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-surface-sunken',
                      )}
                    >
                      {act.focusedToday ? <CalendarCheck className="h-4 w-4" aria-hidden="true" /> : <CalendarPlus className="h-4 w-4" aria-hidden="true" />}
                      <span aria-hidden="true">{act.focusedToday ? 'On today' : 'Add to today'}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {sheet && (
        <ActionEditorSheet
          open={sheet.open}
          onOpenChange={(open) => setSheet((s) => (s ? { ...s, open } : s))}
          mode={sheet.mode}
          mutations={matrix}
          onReloadLatest={onReloadLatest}
          onSaved={(saved) => {
            // Keep the fresh updatedAt so a second edit before the refresh isn't stale.
            if (sheet.mode.type === 'edit' && saved?.id) setOverrides((o) => ({ ...o, [saved.id]: saved }));
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function statusText(a: ActionDTO, today: string): string {
  if (a.kind === 'task') {
    if (a.completedAt) return 'Done';
    if (a.dueDate) return a.dueDate < today ? `Overdue · ${formatLocalDate(a.dueDate, 'short')}` : `Due ${relativeDay(a.dueDate, today)}`;
    return 'Open task';
  }
  const sched = describeSchedule(a.schedule) || 'Routine';
  if (a.checkedToday) return `${sched} · Checked today`;
  return a.dueToday ? `${sched} · Due today` : sched;
}
