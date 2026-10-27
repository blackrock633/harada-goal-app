'use client';

import { addReflectionAction } from '@/app/actions/review';
import { ReflectionForm } from '@/ui/features/review';
import { guardMutations } from '@/ui/pending-writes';

const { addReflection } = guardMutations({ addReflection: addReflectionAction });

export function ReflectionFormScreen({
  goalId,
  today,
  advanced = false,
}: {
  goalId: string;
  today: string;
  advanced?: boolean;
}) {
  return <ReflectionForm goalId={goalId} today={today} addReflection={addReflection} advanced={advanced} />;
}
