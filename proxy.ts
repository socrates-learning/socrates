import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  REQUEST_USER_DISPLAY_NAME_HEADER,
  REQUEST_USER_EMAIL_HEADER,
  REQUEST_USER_ID_HEADER,
  REQUEST_USER_ROLE_HEADER,
} from '@/lib/request-auth-context';

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
  const pathname = request.nextUrl.pathname;
  const requestHeaders = new Headers(request.headers);
  const refreshedCookies: Array<{
    name: string;
    value: string;
    options?: Parameters<NextResponse['cookies']['set']>[2];
  }> = [];

  requestHeaders.delete(REQUEST_USER_ID_HEADER);
  requestHeaders.delete(REQUEST_USER_EMAIL_HEADER);
  requestHeaders.delete(REQUEST_USER_ROLE_HEADER);
  requestHeaders.delete(REQUEST_USER_DISPLAY_NAME_HEADER);

  function applyRefreshedCookies(response: NextResponse) {
    refreshedCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    return response;
  }

  function continueRequest() {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
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

  requestHeaders.set(REQUEST_USER_ID_HEADER, user.id);
  requestHeaders.set(REQUEST_USER_ROLE_HEADER, role);
  requestHeaders.set(
    REQUEST_USER_EMAIL_HEADER,
    encodeURIComponent(user.email ?? '')
  );
  requestHeaders.set(
    REQUEST_USER_DISPLAY_NAME_HEADER,
    encodeURIComponent(
      (user.user_metadata?.full_name as string | undefined) ||
        (user.email ? user.email.split('@')[0] : 'there')
    )
  );

  return continueRequest();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
