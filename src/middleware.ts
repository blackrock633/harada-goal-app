import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEV_AUTH_COOKIE, isDevAuthEnabled } from '@/infrastructure/auth/mode';
import { readSupabasePublicEnv } from '@/infrastructure/supabase/env';

/**
 * Session refresh + a cheap redirect for signed-out visitors.
 *
 * THIS IS NOT THE AUTHORIZATION BOUNDARY. Middleware can be bypassed or skipped (matcher gaps,
 * direct server-action posts). Real enforcement is: server code derives the user from
 * AuthGateway.getUser() (server-verified) and every query runs under Postgres RLS.
 */
const PROTECTED = ['/today', '/goal', '/settings', '/matrix', '/review'];

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (isDevAuthEnabled()) {
    // Presence only; the signature is verified server-side by DevAuthGateway.getUser().
    signedIn = request.cookies.has(DEV_AUTH_COOKIE);
  } else {
    const env = readSupabasePublicEnv();
    if (env) {
      const supabase = createServerClient(env.url, env.anonKey, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (toSet, headers) => {
            for (const { name, value } of toSet) request.cookies.set(name, value);
            response = NextResponse.next({ request });
            for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
            for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
          },
        },
      });
      // getUser() validates with the Auth server and refreshes expiring tokens (writes cookies via setAll).
      try {
        const { data } = await supabase.auth.getUser();
        signedIn = !!data.user;
      } catch {
        signedIn = false;
      }
    }
  }

  if (!signedIn && isProtected(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.search = '';
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed/cleared auth cookies on the redirect.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)'],
};
