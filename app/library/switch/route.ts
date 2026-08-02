import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_LIBRARY_COOKIE, isValidLibrarySlug } from '@/lib/library-context';
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

  if (roleData?.role !== 'admin' && roleData?.role !== 'editor') {
    return new NextResponse('Access denied', { status: 403 });
  }

  const formData = await request.formData();
  const librarySlug = String(formData.get('library_slug') || '');

  if (!isValidLibrarySlug(librarySlug)) {
    return new NextResponse('Invalid library slug', { status: 400 });
  }

  const { data: library } = await supabase
    .from('libraries')
    .select('slug, status')
    .eq('slug', librarySlug)
    .eq('status', 'active')
    .maybeSingle();

  if (!library?.slug) {
    return new NextResponse('Library not found', { status: 404 });
  }

  const response = NextResponse.redirect(
    new URL(`/library/${library.slug}`, request.url),
    303
  );

  response.cookies.set(ACTIVE_LIBRARY_COOKIE, library.slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
