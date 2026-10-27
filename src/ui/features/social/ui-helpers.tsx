'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import {
  addPostCommentAction,
  deletePostCommentAction,
  deleteSocialPostAction,
  getSocialPostAction,
  hideOrReportPostAction,
  togglePostLikeAction,
  updateSocialPostAction,
} from '@/app/actions/social';
import { EmptyState, Field, Input, Textarea } from '@/ui/primitives';
import type { PostCardActions } from './PostCard';

export const defaultPostCardActions: PostCardActions = {
  toggleLike: togglePostLikeAction,
  addComment: addPostCommentAction,
  deleteComment: deletePostCommentAction,
  loadPostDetail: getSocialPostAction,
  updatePost: updateSocialPostAction,
  deletePost: deleteSocialPostAction,
  hideOrReportPost: hideOrReportPostAction,
};

export function Card({
  padding = 'md',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}) {
  const padClass =
    padding === 'none'
      ? ''
      : padding === 'sm'
        ? 'p-3'
        : padding === 'lg'
          ? 'p-6'
          : 'p-4';
  return (
    <div
      className={clsx(
        'rounded-[var(--radius-md)] border border-rule bg-surface text-ink',
        padClass,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface LabeledInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function LabeledInput({ label, hint, error, className, ...props }: LabeledInputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <Input {...props} />
    </Field>
  );
}

export interface LabeledTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: string;
  error?: string;
  maxLength?: number;
}

export function LabeledTextarea({
  label,
  hint,
  error,
  className,
  ...props
}: LabeledTextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      <Textarea {...props} />
    </Field>
  );
}

export function SocialEmptyState({
  title,
  body,
  action,
}: {
  index?: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return <EmptyState title={title} description={body} action={action} />;
}
