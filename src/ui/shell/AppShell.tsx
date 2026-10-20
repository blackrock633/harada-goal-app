"use client";

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { LayoutDashboard, Target, Settings, LogOut, User } from 'lucide-react';
import { MenuRoot, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '../primitives/Menu';

export interface AppShellProps {
  user: { displayName: string };
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}

export function AppShell({ user, signOutAction, children }: AppShellProps) {
  const pathname = usePathname();
  
  const navItems = [
    { name: 'Today', href: '/today', icon: LayoutDashboard },
    { name: 'Goals', href: '/goals', icon: Target },
  ];

  const bottomNavItems = [
    { name: 'Today', href: '/today', icon: LayoutDashboard },
    { name: 'Goals', href: '/goals', icon: Target },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row bg-paper">
      {/* Mobile Top Bar */}
      <header className="lg:hidden sticky top-0 z-40 flex h-14 items-center justify-between border-b border-rule bg-paper/90 px-4 backdrop-blur-sm safe-top">
        <div className="font-serif text-lg font-semibold tracking-tight text-ink">Harada</div>
        <MenuRoot>
          <MenuTrigger asChild>
            <button className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-sunken text-ink transition-colors hover:bg-rule focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer">
              <User className="h-4 w-4" />
              <span className="sr-only">User menu</span>
            </button>
          </MenuTrigger>
          <MenuContent align="end">
            <div className="px-2 py-1.5 text-sm font-medium text-ink truncate max-w-[200px]">{user.displayName}</div>
            <MenuSeparator />
            <MenuItem onSelect={() => signOutAction()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </header>

      {/* Desktop Left Rail */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-rule bg-surface sticky top-0 h-screen overflow-y-auto">
        <div className="flex h-16 items-center px-6">
          <div className="font-serif text-xl font-semibold tracking-tight text-ink">Harada</div>
        </div>
        
        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex items-center rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isActive ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" strokeWidth={1.75} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-3">
          <Link
            href="/settings"
            className={clsx(
              'flex items-center rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent mb-2',
              pathname?.startsWith('/settings') ? 'bg-accent-soft text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
            )}
          >
            <Settings className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" strokeWidth={1.75} />
            Settings
          </Link>

          <MenuRoot>
            <MenuTrigger asChild>
              <button className="flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer group">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rule text-ink-muted group-hover:text-ink transition-colors mr-3">
                  <User className="h-4 w-4" />
                </div>
                <div className="flex-1 truncate text-sm font-medium text-ink">
                  {user.displayName}
                </div>
              </button>
            </MenuTrigger>
            <MenuContent align="end" className="w-56">
              <MenuItem onSelect={() => signOutAction()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </MenuItem>
            </MenuContent>
          </MenuRoot>
        </div>
      </aside>

      {/* Main Content */}
      <main id="main-content" className="flex-1 w-full max-w-[1120px] mx-auto pb-20 lg:pb-0 outline-none" tabIndex={-1}>
        {children}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-rule bg-surface/90 backdrop-blur-sm safe-bottom" aria-label="Mobile Navigation">
        <div className="flex justify-around">
          {bottomNavItems.map((item) => {
            const isActive = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={clsx(
                  'flex flex-col items-center justify-center w-full py-2 px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
                  isActive ? 'text-accent' : 'text-ink-muted hover:text-ink'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="mb-1 h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
                {item.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
