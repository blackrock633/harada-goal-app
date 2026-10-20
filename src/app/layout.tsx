import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { ToastProvider } from '@/ui/primitives/Toast';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['opsz'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: { default: 'Harada', template: '%s · Harada' },
  description: 'Turn a meaningful long-term goal into daily action with the Harada Method.',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const theme = cookieStore.get('theme')?.value ?? 'system';
  
  const themeValue = theme === 'system' ? undefined : theme;

  return (
    <html lang="en" data-theme={themeValue} className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F5F0" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131311" />
      </head>
      <body>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:p-4 focus:bg-paper focus:text-ink focus:z-50 focus:top-0 focus:left-0">
          Skip to main content
        </a>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
