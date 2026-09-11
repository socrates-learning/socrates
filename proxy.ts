import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  REQUEST_USER_DISPLAY_NAME_HEADER,
  REQUEST_USER_EMAIL_HEADER,
  REQUEST_USER_ID_HEADER,
  REQUEST_USER_ROLE_HEADER,
} from '@/lib/request-auth-context';
import {
  formatServerTiming,
  PROXY_AUTH_TIMING_HEADER,
  PROXY_ROLE_TIMING_HEADER,
  PROXY_TOTAL_TIMING_HEADER,
  REQUEST_ID_HEADER,
  type ServerTimingEntry,
} from '@/lib/request-performance';

const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export async function proxy(request: NextRequest) {
  const proxyStartedAt = performance.now();
  const requestId = crypto.randomUUID();
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  const timingEntries: ServerTimingEntry[] = [];
  const refreshedCookies: Array<{
    name: string;
    value: string;
    options?: Parameters<NextResponse['cookies']['set']>[2];
  }> = [];

  requestHeaders.delete(REQUEST_USER_ID_HEADER);
  requestHeaders.delete(REQUEST_USER_EMAIL_HEADER);
  requestHeaders.delete(REQUEST_USER_ROLE_HEADER);
  requestHeaders.delete(REQUEST_USER_DISPLAY_NAME_HEADER);
  requestHeaders.delete(REQUEST_ID_HEADER);
  requestHeaders.delete(PROXY_AUTH_TIMING_HEADER);
  requestHeaders.delete(PROXY_ROLE_TIMING_HEADER);
  requestHeaders.delete(PROXY_TOTAL_TIMING_HEADER);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  function applyRefreshedCookies(response: NextResponse) {
    const proxyTotalMs = performance.now() - proxyStartedAt;
    const totalEntry = { name: 'proxy_total', durationMs: proxyTotalMs };

    response.headers.set(REQUEST_ID_HEADER, requestId);
    response.headers.set(
      'Server-Timing',
      formatServerTiming([...timingEntries, totalEntry])
    );
    refreshedCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  }

  function continueRequest() {
    requestHeaders.set(
      PROXY_TOTAL_TIMING_HEADER,
      String(Math.round((performance.now() - proxyStartedAt) * 10) / 10)
    );
    return applyRefreshedCookies(
      NextResponse.next({ request: { headers: requestHeaders } })
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          refreshedCookies.splice(0, refreshedCookies.length, ...cookiesToSet);
        },
      },
    }
  );

  const authStartedAt = performance.now();
  const { data: claimsData } = await supabase.auth.getClaims();
  const authDurationMs = performance.now() - authStartedAt;
  const claims = claimsData?.claims;
  const userId = typeof claims?.sub === 'string' ? claims.sub : null;
  const email = typeof claims?.email === 'string' ? claims.email : null;
  const userMetadata =
    claims?.user_metadata && typeof claims.user_metadata === 'object'
      ? (claims.user_metadata as Record<string, unknown>)
      : null;
  const fullName =
    typeof userMetadata?.full_name === 'string'
      ? userMetadata.full_name
      : null;

  timingEntries.push({ name: 'proxy_auth', durationMs: authDurationMs });
  requestHeaders.set(
    PROXY_AUTH_TIMING_HEADER,
    String(Math.round(authDurationMs * 10) / 10)
  );

  if (!userId) {
    if (isPublicPath(pathname)) return continueRequest();

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set(
      'next',
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return applyRefreshedCookies(NextResponse.redirect(loginUrl));
  }

  if (
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/auth/callback'
  ) {
    return continueRequest();
  }

  const roleStartedAt = performance.now();
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  const roleDurationMs = performance.now() - roleStartedAt;
  timingEntries.push({ name: 'proxy_role', durationMs: roleDurationMs });
  requestHeaders.set(
    PROXY_ROLE_TIMING_HEADER,
    String(Math.round(roleDurationMs * 10) / 10)
  );
  const role = roleData?.role;
  const hasValidRole = role === 'learner' || role === 'editor' || role === 'admin';

  if (!hasValidRole) {
    if (pathname === '/pending-approval') return continueRequest();

    const pendingUrl = request.nextUrl.clone();
    pendingUrl.pathname = '/pending-approval';
    pendingUrl.search = '';
    return applyRefreshedCookies(NextResponse.redirect(pendingUrl));
  }

  if (pathname === '/login' || pathname === '/pending-approval') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return applyRefreshedCookies(NextResponse.redirect(homeUrl));
  }

  if (
    (pathname === '/admin' || pathname.startsWith('/admin/')) &&
    role !== 'admin'
  ) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return applyRefreshedCookies(NextResponse.redirect(homeUrl));
  }

  if (
    (pathname === '/creator' || pathname.startsWith('/creator/')) &&
    role !== 'editor' &&
    role !== 'admin'
  ) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return applyRefreshedCookies(NextResponse.redirect(homeUrl));
  }

  requestHeaders.set(REQUEST_USER_ID_HEADER, userId);
  requestHeaders.set(REQUEST_USER_ROLE_HEADER, role);
  requestHeaders.set(
    REQUEST_USER_EMAIL_HEADER,
    encodeURIComponent(email ?? '')
  );
  requestHeaders.set(
    REQUEST_USER_DISPLAY_NAME_HEADER,
    encodeURIComponent(
      fullName || (email ? email.split('@')[0] : 'there')
    )
  );

  return continueRequest();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
