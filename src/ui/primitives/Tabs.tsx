'use client';

import * as React from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { usePathname } from 'next/navigation';

export interface TabItem {
  name: string;
  href: string;
  exact?: boolean;
}

export function Tabs({ tabs, className }: { tabs: TabItem[], className?: string }) {
  const pathname = usePathname();
  
  return (
    <nav className={clsx('flex space-x-4 border-b border-rule', className)} aria-label="Tabs">
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={clsx(
              'px-1 py-3 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-sm',
              isActive
                ? 'border-accent text-accent'
                : 'border-transparent text-ink-muted hover:text-ink hover:border-rule-strong'
            )}
          >
            {tab.name}
          </Link>
        );
      })}
    </nav>
  );
}
