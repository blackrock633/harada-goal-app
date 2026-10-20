import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireCtx } from '@/app/lib/session';
import { resolveFocusedGoal } from '@/app/lib/focus';
import { Screen } from '@/ui/layout';
import { KeyAreaScreen } from './KeyAreaScreen';

export const metadata: Metadata = { title: 'Key area' };

export default async function KeyAreaPage({
  params,
  searchParams,
}: {
  params: Promise<{ position: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { position: raw } = await params;
  const position = Number(raw);
  if (!/^[0-7]$/.test(raw) || !Number.isInteger(position)) notFound();

  const ctx = await requireCtx();
  const { goal } = await resolveFocusedGoal(ctx, (await searchParams).goal);
  return (
    <Screen width="reading">
      <KeyAreaScreen goal={goal} position={position} today={ctx.today} />
    </Screen>
  );
}
