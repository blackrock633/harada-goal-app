import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Dev-only routes (e.g. /styleguide): a server-side 404 in production, before any client code runs. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <>{children}</>;
}
