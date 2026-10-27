import { PublicShell } from '@/ui/features/marketing';
import { ButtonLink } from '@/ui/primitives';
import { routes } from '@/ui/routes';

/** One generic 404 for everything (unknown pages, bad share links, pages you may not see). */
export default function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[720px] px-4 py-16 md:px-8">
        <h1 className="font-serif text-3xl font-medium text-ink">Page not found</h1>
        <p className="mt-3 text-ink-muted">This page doesn’t exist, or the link is no longer available.</p>
        <div className="mt-8">
          <ButtonLink href={routes.home}>Go to Harada</ButtonLink>
        </div>
      </div>
    </PublicShell>
  );
}
