import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireCtx } from '@/app/lib/session';
import { getDeps } from '@/infrastructure/container';
import * as uc from '@/application/use-cases';
import { ProfileView } from '@/ui/features/social';
import { Screen, ScreenHeader } from '@/ui/layout';
import { routes } from '@/ui/routes';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)}` };
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const ctx = await requireCtx();
  const deps = await getDeps();
  const { username: rawUsername } = await params;
  const username = decodeURIComponent(rawUsername).replace(/^@/, '');

  const res = await uc.getSocialProfile(deps, ctx, { username });
  if (!res.ok) {
    notFound();
  }

  return (
    <Screen width="reading">
      <ScreenHeader
        back={{ href: routes.community, label: 'Community' }}
        eyebrow="MEMBER PROFILE"
        title={res.data.displayName}
        meta={`@${res.data.username}`}
      />
      <ProfileView initialProfile={res.data} />
    </Screen>
  );
}
