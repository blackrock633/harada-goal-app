'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { CalendarCheck, Target, Grid3x3, NotebookPen, Settings, LogOut, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '../primitives/Menu';
import { primaryTabs, routes } from '../routes';

export interface AppShellProps {
  user: { displayName: string };
  focusedGoalId?: string;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}

const tabIcons: Record<(typeof primaryTabs)[number]['key'], LucideIcon> = {
  today: CalendarCheck,
  goal: Target,
  matrix: Grid3x3,
  review: NotebookPen,
};

function isActivePath(pathname: string | null, key: string): boolean {
  if (!pathname) return false;
  const prefix = `/${key}`;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function AppShell({ user, focusedGoalId, signOutAction, children }: AppShellProps) {
  const pathname = usePathname();
  const tabs = primaryTabs.map((tab) => ({
    key: tab.key,
    label: tab.label,
    href: tab.href(focusedGoalId),
    Icon: tabIcons[tab.key],
    active: isActivePath(pathname, tab.key),
  }));
  const settingsActive = isActivePath(pathname, 'settings');

  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-[var(--radius-sm)] focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-ink focus:outline-2 focus:outline-accent"
      >
        Skip to content
      </a>

      {/* Phone / tablet top bar */}
      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between border-b border-rule bg-paper px-4 pt-[env(safe-area-inset-top)] lg:hidden">
        <span className="font-serif text-lg font-semibold tracking-tight">Harada</span>
        <MenuRoot>
          <MenuTrigger asChild>
            <button
              type="button"
              className={clsx(
                'flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-surface-sunken',
                focusRing
              )}
            >
              <User className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">Account menu</span>
            </button>
          </MenuTrigger>
          <MenuContent align="end" className="w-56">
            <div className="truncate px-2 py-1.5 text-sm font-medium">{user.displayName}</div>
            <MenuSeparator />
            <MenuItem asChild className="min-h-11">
              <Link href={routes.settings}>
                <Settings className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Settings
              </Link>
            </MenuItem>
            <MenuItem className="min-h-11" onSelect={() => void signOutAction()}>
              <LogOut className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </header>

      {/* Desktop left rail */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-rule bg-paper lg:flex">
        <div className="flex h-16 items-center px-6">
          <span className="font-serif text-xl font-semibold tracking-tight">Harada</span>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Primary">
          {tabs.map(({ key, label, href, Icon, active }) => (
            <Link
              key={key}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm font-medium',
                focusRing,
                active ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t border-rule p-3">
          <Link
            href={routes.settings}
            aria-current={settingsActive ? 'page' : undefined}
            className={clsx(
              'flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] px-3 text-sm font-medium',
              focusRing,
              settingsActive ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
            )}
          >
            <Settings className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            Settings
          </Link>
          <div className="px-3 py-1">
            <p className="truncate text-sm text-ink-muted">{user.displayName}</p>
            <form action={signOutAction}>
              <button
                type="submit"
                className={clsx(
                  'flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-muted hover:text-ink',
                  focusRing
                )}
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] outline-none lg:pb-0"
      >
        {children}
      </main>

      {/* Phone / tablet bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="flex">
          {tabs.map(({ key, label, href, Icon, active }) => (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.8125rem] font-medium',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                  active ? 'text-accent' : 'text-ink-muted hover:text-ink'
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
