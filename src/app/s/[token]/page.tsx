import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isShareToken } from '@/application/web-public';
import { fetchSharedCard, randomVisitorId, trackEvent } from '@/infrastructure/supabase/public-data';
import { anonSupabase } from '@/infrastructure/supabase/server';
import { PublicShell, SharedCard } from '@/ui/features/marketing';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

// Every view is counted and may be revoked at any moment: never cached, never indexed.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Shared progress',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

/**
 * Public share page. Only the anon key is used (get_shared_card); no session, no other data. A malformed,
 * unknown, revoked or expired token all end in the same generic 404. Rate limited per IP in middleware.
 */
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) notFound();
  const client = anonSupabase();
  const shared = await fetchSharedCard(client, token);
  if (!shared) notFound();
  await trackEvent(client, 'shared_page_viewed', { kind: shared.card.kind }, randomVisitorId());

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 md:px-8 md:py-14">
        <SharedCard card={shared.card} createdAt={shared.createdAt} />
        <section aria-labelledby="own-heading" className="mt-12 border-t border-rule pt-6">
          <h2 id="own-heading" className="font-serif text-xl text-ink">Start your own</h2>
          <p className="mt-2 text-ink-muted">
            Harada turns one goal into 8 key areas and 64 actions, then helps you act on it every day and review it each
            week.
          </p>
          <div className="mt-5">
            <ButtonLink href={routes.signUpWith({ ref: shared.ref })} className="w-full sm:w-auto">Start your own</ButtonLink>
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
