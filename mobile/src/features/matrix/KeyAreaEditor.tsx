import { useEffect, useRef, useState } from 'react';

import { newClientId } from '@/data/errors';
import type { MatrixMutations } from '@/data/mutations';
import { useTheme } from '@/theme';
import { Button, Sheet, TextField } from '@/ui';
import type { OutcomeFieldsDTO } from '@shared/application/dto';
import { addOutcomeSchema, updateOutcomeSchema } from '@shared/application/schemas';
import { LIMITS } from '@shared/domain/limits';

import { FormError, toFailure, type FormFailure } from './FormError';
import { type FieldErrors, serverFieldErrors, zodFieldErrors } from './form-utils';

export type KeyAreaEditorMode =
  | { type: 'create'; goalId: string; /** Key area slot 0..7 being filled. */ position: number }
  | { type: 'edit'; outcome: Pick<OutcomeFieldsDTO, 'id' | 'title' | 'description' | 'updatedAt'> };

export interface KeyAreaEditorProps {
  mode: KeyAreaEditorMode;
  mutations: Pick<MatrixMutations, 'addOutcome' | 'updateOutcome'>;
  /** Sheet visibility. The draft survives closing the sheet, so unsaved input is never lost silently. */
  visible: boolean;
  onClose: () => void;
  onDone?: (outcome: OutcomeFieldsDTO) => void;
  /** Reports whether the form holds unsaved input (for navigation guards). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Offered on CONFLICT; the route should refetch the latest data. */
  onReloadLatest?: () => void;
}

/** Create a key area or edit its title/description, in a bottom sheet. */
export function KeyAreaEditor({ mode, mutations, visible, onClose, onDone, onDirtyChange, onReloadLatest }: KeyAreaEditorProps) {
  const { space } = useTheme();
  const isCreate = mode.type === 'create';
  const [baseline, setBaseline] = useState(() =>
    mode.type === 'edit' ? { title: mode.outcome.title, description: mode.outcome.description } : { title: '', description: '' },
  );
  const [title, setTitle] = useState(baseline.title);
  const [description, setDescription] = useState(baseline.description);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormFailure | null>(null);
  // One client id per logical create: reused across retries, renewed only after success.
  const clientId = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const dirty = title !== baseline.title || description !== baseline.description;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  async function submit() {
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
        setBaseline({ title, description });
        inFlight.current = false;
        setPending(false);
        onDone?.(res.data);
        onClose();
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
    <Sheet
      visible={visible}
      onClose={() => {
        if (!inFlight.current) onClose();
      }}
      title={isCreate ? `New key area ${mode.position + 1}` : 'Edit key area details'}
      footer={
        <>
          {formError ? <FormError failure={formError} onReloadLatest={onReloadLatest} /> : null}
          <Button
            title={isCreate ? 'Create key area' : 'Save key area'}
            loading={pending}
            onPress={() => void submit()}
            style={formError ? { marginTop: space[3] } : undefined}
          />
        </>
      }
    >
      <TextField
        label="Key area title"
        value={title}
        onChangeText={setTitle}
        error={errors.title}
        hint={`${title.length}/${LIMITS.outcomeTitle}`}
        placeholder="e.g. Fitness"
        autoComplete="off"
        editable={!pending}
      />
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        multiline
        editable={!pending}
      />
    </Sheet>
  );
}
