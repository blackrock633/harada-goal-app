import * as React from 'react';
import Link from 'next/link';
import { routes } from '@/ui/routes';

/** Header + footer for the public pages (landing, pricing, challenge, share, billing results). */
export function PublicShell({ children, signedIn = false }: { children: React.ReactNode; signedIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-sm)] focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-rule pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-2 md:px-8">
          <Link href={routes.home} className="inline-flex min-h-11 items-center font-serif text-xl font-semibold tracking-tight text-ink">
            Harada
          </Link>
          <nav aria-label="Site" className="flex min-w-0 items-center gap-1 text-sm sm:gap-3">
            <Link href={routes.pricing} className="inline-flex min-h-11 items-center px-2 text-ink-muted hover:text-ink">
              Pricing
            </Link>
            {signedIn ? (
              <Link href={routes.today} className="inline-flex min-h-11 items-center px-2 font-medium text-accent">
                Open app
              </Link>
            ) : (
              <Link href={routes.signIn} className="inline-flex min-h-11 items-center px-2 text-ink-muted hover:text-ink">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-rule pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-6 text-sm text-ink-muted md:px-8">
          <span className="font-serif text-ink">Harada</span>
          <Link href={routes.pricing} className="inline-flex min-h-11 items-center hover:text-ink">Pricing</Link>
          <Link href={routes.challenge} className="inline-flex min-h-11 items-center hover:text-ink">30-Day Challenge</Link>
          <Link href={routes.signUp} className="inline-flex min-h-11 items-center hover:text-ink">Create an account</Link>
        </div>
      </footer>
    </div>
  );
}
