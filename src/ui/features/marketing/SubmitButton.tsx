'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from '@/ui/primitives';

/** A submit button for server-action forms: disabled with a spinner while the form is submitting. */
export function SubmitButton(props: Omit<ButtonProps, 'type' | 'loading'>) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending} {...props} />;
}
