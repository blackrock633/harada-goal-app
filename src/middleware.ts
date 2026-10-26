import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEV_AUTH_COOKIE, isDevAuthEnabled } from '@/infrastructure/auth/mode';
import { clientIp, shareLimiter } from '@/infrastructure/http/rate-limit';
import { readSupabasePublicEnv, supabaseCookieOptions } from '@/infrastructure/supabase/env';

/**
 * Session refresh + a cheap redirect for signed-out visitors.
 *
 * THIS IS NOT THE AUTHORIZATION BOUNDARY. Middleware can be bypassed or skipped (matcher gaps,
 * direct server-action posts). Real enforcement is: server code derives the user from
 * AuthGateway.getUser() (server-verified) and every query runs under Postgres RLS.
 */
const PROTECTED = ['/today', '/goal', '/settings', '/matrix', '/review', '/account'];

/** Public share pages (/s/<token>): rate limited per IP, never cached or indexed. */
const isSharePage = (pathname: string) => pathname.startsWith('/s/');

function isProtected(pathname: string): boolean {
  return PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Strict CSP with a per-request nonce. Next reads the nonce from the request's CSP header and puts it on
 * its own scripts; anything injected without it is refused. Styles allow 'unsafe-inline' for React style
 * attributes (no script execution). The browser never talks to Supabase directly, so connect-src is 'self'.
 */
export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV === 'development'): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? ` 'unsafe-eval'` : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isSharePage(pathname) && !shareLimiter.consume(clientIp(request.headers))) {
    return new NextResponse('Too many requests. Please wait a minute and try again.', {
      status: 429,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'retry-after': '60',
        'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    });
  }
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  request.headers.set('content-security-policy', csp);
  let response = NextResponse.next({ request });
  let signedIn = false;

  if (isDevAuthEnabled()) {
    // Presence only; the signature is verified server-side by DevAuthGateway.getUser().
    signedIn = request.cookies.has(DEV_AUTH_COOKIE);
  } else {
    const env = readSupabasePublicEnv();
    if (env) {
      const supabase = createServerClient(env.url, env.anonKey, {
        cookieOptions: supabaseCookieOptions(),
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

  // Server actions (POST) must reach the action so it can answer UNAUTHENTICATED in-band;
  // a 307 would replay the POST against /signin and the client would get HTML instead of a Result.
  const isNavigation = request.method === 'GET' || request.method === 'HEAD';
  if (!signedIn && isProtected(pathname) && isNavigation) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.search = '';
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed/cleared auth cookies on the redirect.
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  response.headers.set('content-security-policy', csp);
  if (isSharePage(pathname)) {
    response.headers.set('cache-control', 'private, no-store');
    response.headers.set('x-robots-tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff2?)$).*)'],
};
