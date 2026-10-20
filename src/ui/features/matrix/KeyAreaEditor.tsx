'use client';

import * as React from 'react';
import type { OutcomeFieldsDTO } from '@/application/dto';
import { addOutcomeSchema, updateOutcomeSchema } from '@/application/schemas';
import { LIMITS } from '@/domain/limits';
import { newClientId } from '@/ui/errors';
import type { MatrixMutations } from '@/ui/actions';
import { Button, Field, Input, Textarea } from '@/ui/primitives';
import { type FieldErrors, scrollFieldIntoView, serverFieldErrors, zodFieldErrors } from './form-utils';
import { FormError, toFailure, type FormFailure } from './FormError';

export type KeyAreaEditorMode =
  | { type: 'create'; goalId: string; /** Key area slot 0..7 being filled. */ position: number }
  | { type: 'edit'; outcome: Pick<OutcomeFieldsDTO, 'id' | 'title' | 'description' | 'updatedAt'> };

export interface KeyAreaEditorProps {
  mode: KeyAreaEditorMode;
  mutations: Pick<MatrixMutations, 'addOutcome' | 'updateOutcome'>;
  onDone?: (outcome: OutcomeFieldsDTO) => void;
  onCancel?: () => void;
  /** Reports whether the form holds unsaved input (for navigation guards). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Called from the CONFLICT banner; the page should refetch the latest data. */
  onReloadLatest?: () => void;
}

/** Inline form to create a key area or edit its title/description. */
export function KeyAreaEditor({ mode, mutations, onDone, onCancel, onDirtyChange, onReloadLatest }: KeyAreaEditorProps) {
  const initialTitle = mode.type === 'edit' ? mode.outcome.title : '';
  const initialDesc = mode.type === 'edit' ? mode.outcome.description : '';
  const [title, setTitle] = React.useState(initialTitle);
  const [description, setDescription] = React.useState(initialDesc);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<FormFailure | null>(null);
  // One client id per logical create: reused across retries, renewed only after success.
  const clientId = React.useRef<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const inFlight = React.useRef(false);

  const dirty = title !== initialTitle || description !== initialDesc;
  React.useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  React.useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    const parsed =
      mode.type === 'create'
        ? addOutcomeSchema.safeParse({
            id: (clientId.current ??= newClientId()),
            goalId: mode.goalId,
            position: mode.position,
            title,
            description,
          })
        : updateOutcomeSchema.safeParse({
            outcomeId: mode.outcome.id,
            expectedUpdatedAt: mode.outcome.updatedAt,
            title,
            description,
          });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      setFormError(null);
      return;
    }
    setErrors({});
    setFormError(null);
    inFlight.current = true;
    setPending(true);
    try {
      const res =
        mode.type === 'create'
          ? await mutations.addOutcome(parsed.data as Parameters<typeof mutations.addOutcome>[0])
          : await mutations.updateOutcome(parsed.data as Parameters<typeof mutations.updateOutcome>[0]);
      if (res.ok) {
        clientId.current = null;
        inFlight.current = false;
        setPending(false);
        onDirtyChange?.(false);
        onDone?.(res.data);
        return;
      }
      setErrors(serverFieldErrors(res.error.fieldErrors));
      setFormError(toFailure(res.error));
    } catch {
      setFormError({ message: 'Something went wrong. Your changes are still here; try again.', conflict: false });
    }
    inFlight.current = false;
    setPending(false);
  }

  return (
    <form onSubmit={submit} onFocus={(e) => scrollFieldIntoView(e.target)} noValidate className="min-w-0 space-y-4" aria-busy={pending}>
      {formError && <FormError failure={formError} onReloadLatest={onReloadLatest} />}
      <Field label="Key area title" error={errors.title} hint={`${title.length}/${LIMITS.outcomeTitle}`}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" placeholder="e.g. Fitness" />
      </Field>
      <Field label="Description" error={errors.description}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="[overflow-wrap:anywhere]" />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode.type === 'create' ? 'Create key area' : 'Save key area'}
        </Button>
      </div>
    </form>
  );
}
