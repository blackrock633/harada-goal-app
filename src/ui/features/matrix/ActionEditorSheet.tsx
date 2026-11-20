'use client';

import * as React from 'react';
import type { ActionDTO } from '@/application/dto';
import { addActionSchema, updateActionSchema } from '@/application/schemas';
import { LIMITS, MAX_SCHEDULE_DATES } from '@/domain/limits';
import { ordinal, shortDate } from '@/application/schedule-text';
import { newClientId } from '@/ui/errors';
import type { MatrixMutations } from '@/ui/actions';
import { Button, DateInput, DialogContent, DialogRoot, Field, Input, Select, Textarea } from '@/ui/primitives';
import {
  type FieldErrors,
  type ScheduleState,
  scheduleToState,
  scrollFieldIntoView,
  serverFieldErrors,
  stateToSchedule,
  zodFieldErrors,
} from './form-utils';
import { FormError, toFailure, type FormFailure } from './FormError';


/** Today in the browser (YYYY-MM-DD), for date defaults; the server keeps its own notion of today. */
const localToday = () => new Date().toLocaleDateString('en-CA');

export type ActionEditorMode =
  | { type: 'add'; outcomeId: string; /** Action slot 0..7 being filled. */ position: number; heading?: string }
  | { type: 'edit'; action: ActionDTO };

export interface ActionEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ActionEditorMode;
  mutations: Pick<MatrixMutations, 'addAction' | 'updateAction'>;
  /** Called after the server accepted the change (before the sheet closes). */
  onSaved?: (action: ActionDTO) => void;
  /** Called from the CONFLICT banner; the page should refetch the latest data. */
  onReloadLatest?: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * Editor sheet built on the Dialog primitive (to be swapped for BottomSheet at integration).
 * Uses dvh units so the sheet shrinks with the on-screen keyboard; the footer sits inside the
 * scrolling container (sticky), never fixed beneath the keyboard.
 */
export function ActionEditorSheet({ open, onOpenChange, mode, mutations, onSaved, onReloadLatest }: ActionEditorSheetProps) {
  const pendingRef = React.useRef(false);
  const guardedChange = (next: boolean) => {
    if (!next && pendingRef.current) return; // don't dismiss mid-save
    onOpenChange(next);
  };
  const isAdd = mode.type === 'add';
  return (
    <DialogRoot open={open} onOpenChange={guardedChange}>
      <DialogContent
        title={isAdd ? 'Add action' : 'Edit action'}
        description={isAdd ? (mode.heading ?? 'Plan one concrete step.') : 'Change this action, then save.'}
        className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-lg overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:p-6"
      >
        <ActionForm
          key={mode.type === 'add' ? `add:${mode.outcomeId}:${mode.position}` : `edit:${mode.action.id}`}
          mode={mode}
          onReloadLatest={onReloadLatest}
          mutations={mutations}
          pendingRef={pendingRef}
          onCancel={() => guardedChange(false)}
          onDone={(a) => {
            onSaved?.(a);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </DialogRoot>
  );
}

function ActionForm({
  mode,
  mutations,
  pendingRef,
  onCancel,
  onDone,
  onReloadLatest,
}: {
  mode: ActionEditorMode;
  onReloadLatest?: () => void;
  mutations: ActionEditorSheetProps['mutations'];
  pendingRef: React.MutableRefObject<boolean>;
  onCancel: () => void;
  onDone: (a: ActionDTO) => void;
}) {
  const initial = mode.type === 'edit' ? mode.action : null;
  const [title, setTitle] = React.useState(initial?.title ?? '');
  const [notes, setNotes] = React.useState(initial?.notes ?? '');
  const [kind, setKind] = React.useState<'task' | 'routine'>(initial?.kind ?? 'task');
  const [dueDate, setDueDate] = React.useState(initial?.dueDate ?? '');
  const [sched, setSched] = React.useState<ScheduleState>(scheduleToState(initial?.schedule));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<FormFailure | null>(null);
  // One client id per logical create: reused across retries, renewed only after success.
  const clientId = React.useRef<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingRef.current) return;
    const common = {
      title,
      notes,
      dueDate: kind === 'task' ? dueDate || null : null,
      schedule: kind === 'routine' ? stateToSchedule(sched) : null,
    };
    const parsed =
      mode.type === 'add'
        ? addActionSchema.safeParse({
            id: (clientId.current ??= newClientId()),
            outcomeId: mode.outcomeId,
            position: mode.position,
            kind,
            ...common,
          })
        : updateActionSchema.safeParse({
            actionId: mode.action.id,
            expectedUpdatedAt: mode.action.updatedAt,
            ...(kind !== mode.action.kind ? { kind } : {}),
            ...common,
          });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    pendingRef.current = true;
    setPending(true);
    try {
      const res =
        mode.type === 'add'
          ? await mutations.addAction(parsed.data as Parameters<typeof mutations.addAction>[0])
          : await mutations.updateAction(parsed.data as Parameters<typeof mutations.updateAction>[0]);
      if (res.ok) {
        clientId.current = null;
        pendingRef.current = false;
        setPending(false);
        onDone(res.data);
        return;
      }
      setErrors(serverFieldErrors(res.error.fieldErrors));
      setFormError(toFailure(res.error));
    } catch {
      setFormError({ message: 'Something went wrong. Your changes are still here; try again.', conflict: false });
    }
    pendingRef.current = false;
    setPending(false);
  }

  const toggleDay = (d: number) =>
    setSched((s) => ({ ...s, days: s.days.includes(d) ? s.days.filter((x) => x !== d) : [...s.days, d] }));

  return (
    <form onSubmit={submit} onFocus={(e) => scrollFieldIntoView(e.target)} noValidate className="min-w-0 space-y-4" aria-busy={pending}>
      {formError && <FormError failure={formError} onReloadLatest={onReloadLatest} />}
      <Field label="Title" error={errors.title} hint={`${title.length}/${LIMITS.actionTitle}`}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" enterKeyHint="done" />
      </Field>
      <Field label="Notes" error={errors.notes}>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className="[overflow-wrap:anywhere]" />
      </Field>
      <Field label="Type" error={errors.kind}>
        <Select value={kind} onChange={(e) => setKind(e.target.value as 'task' | 'routine')}>
          <option value="task">Task (one-off, optional due date)</option>
          <option value="routine">Routine (repeats on a schedule)</option>
        </Select>
      </Field>
      {kind === 'task' ? (
        <Field label="Due date (optional)" error={errors.dueDate}>
          <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      ) : (
        <div className="min-w-0 space-y-3">
          <Field label="Schedule" error={errors.schedule}>
            <Select
              value={sched.type}
              onChange={(e) => {
                const type = e.target.value as ScheduleState['type'];
                // "Once a month" by default: start from today's day of the month.
                setSched((s) => ({
                  ...s,
                  type,
                  daysOfMonth: type === 'monthly' && s.daysOfMonth.length === 0 ? [Number(localToday().slice(8, 10))] : s.daysOfMonth,
                }));
              }}
            >
              <option value="daily">Every day</option>
              <option value="weekdays">Specific weekdays</option>
              <option value="weekly">N times per week</option>
              <option value="monthly">Monthly</option>
              <option value="dates">Specific dates</option>
            </Select>
          </Field>
          {sched.type === 'weekdays' && (
            <fieldset className="min-w-0">
              <legend className="mb-1 text-sm font-medium text-ink">Days</legend>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, d) => (
                  <label
                    key={label}
                    className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-rule-strong px-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                  >
                    <input type="checkbox" className="sr-only" checked={sched.days.includes(d)} onChange={() => toggleDay(d)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {sched.type === 'monthly' && (
            <fieldset className="min-w-0">
              <legend className="mb-1 text-sm font-medium text-ink">Days of the month</legend>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <label
                    key={d}
                    className="flex min-h-[44px] cursor-pointer items-center justify-center rounded-[var(--radius-sm)] border border-rule-strong text-sm tabular-nums has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:font-semibold has-[:checked]:text-accent-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      aria-label={`The ${ordinal(d)}`}
                      checked={sched.daysOfMonth.includes(d)}
                      onChange={() =>
                        setSched((s) => ({
                          ...s,
                          daysOfMonth: s.daysOfMonth.includes(d) ? s.daysOfMonth.filter((x) => x !== d) : [...s.daysOfMonth, d],
                        }))
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-sm text-ink-muted">In shorter months, the 29th to 31st fall on the last day.</p>
            </fieldset>
          )}
          {sched.type === 'dates' && (
            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1 text-sm font-medium text-ink">Dates</legend>
              {sched.dates.length === 0 ? (
                <p className="text-sm text-ink-muted">No dates yet. Add the days this routine happens.</p>
              ) : (
                <ul className="divide-y divide-rule border-y border-rule">
                  {sched.dates.map((d) => (
                    <li key={d} className="flex min-h-[44px] items-center justify-between gap-2">
                      <span className="tabular-nums text-ink">{shortDate(d, new Date().getFullYear())}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${shortDate(d, new Date().getFullYear())}`}
                        onClick={() => setSched((s) => ({ ...s, dates: s.dates.filter((x) => x !== d) }))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {sched.dates.length < MAX_SCHEDULE_DATES ? (
                <Field label="Add a date">
                  <DateInput
                    value=""
                    min={localToday()}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v) setSched((s) => ({ ...s, dates: s.dates.includes(v) ? s.dates : [...s.dates, v].sort() }));
                    }}
                  />
                </Field>
              ) : (
                <p className="text-sm text-ink-muted">{`Up to ${MAX_SCHEDULE_DATES} dates.`}</p>
              )}
            </fieldset>
          )}
          {sched.type === 'weekly' && (
            <Field label="Times per week">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={7}
                value={sched.timesPerWeek}
                onChange={(e) => setSched((s) => ({ ...s, timesPerWeek: e.target.value }))}
              />
            </Field>
          )}
        </div>
      )}
      <div className="sticky bottom-0 -mx-1 flex flex-col-reverse gap-2 bg-surface px-1 pb-1 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode.type === 'add' ? 'Add action' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
