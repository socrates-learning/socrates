import { NextResponse } from 'next/server';
import { ACTIVE_LIBRARY_COOKIE } from '@/lib/library-context';

export async function POST() {
  const response = NextResponse.json({ cleared: true });

  response.cookies.set(ACTIVE_LIBRARY_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  return response;
}
