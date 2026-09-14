import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_LIBRARY_COOKIE, isValidLibrarySlug } from '@/lib/library-context';
import { getSafeInternalPath } from '@/lib/safe-internal-path';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), 303);
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = roleData?.role;
  if (role !== 'admin' && role !== 'editor' && role !== 'learner') {
    return new NextResponse('Access denied', { status: 403 });
  }

  const formData = await request.formData();
  const librarySlug = String(formData.get('library_slug') || '');
  const returnTo = String(formData.get('return_to') || '');

  if (!isValidLibrarySlug(librarySlug)) {
    return new NextResponse('Invalid library slug', { status: 400 });
  }

  const { data: library } = await supabase
    .from('libraries')
    .select('id, slug, status')
    .eq('slug', librarySlug)
    .eq('status', 'active')
    .maybeSingle();

  if (!library?.slug) {
    return new NextResponse('Library not found', { status: 404 });
  }

  if (role === 'learner') {
    const { data: membership } = await supabase
      .from('user_libraries')
      .select('library_id')
      .eq('user_id', user.id)
      .eq('library_id', library.id)
      .maybeSingle();

    if (!membership) {
      return new NextResponse('Library access denied', { status: 403 });
    }
  }

  const redirectPath = getSafeInternalPath(
    returnTo,
    `/library/${library.slug}`
  );
  const response = NextResponse.redirect(new URL(redirectPath, request.url), 303);

  response.cookies.set(ACTIVE_LIBRARY_COOKIE, library.slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
