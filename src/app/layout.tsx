import type { Metadata, Viewport } from 'next';
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
});

// viewport-fit=cover lets env(safe-area-inset-*) apply on notched phones.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

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
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
