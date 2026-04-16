import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PREFIXES = [
  '/auth/',
  '/api/auth/',
  '/api/test/',
  '/api/public/',
  '/_next/',
  '/favicon.ico',
];

const PROTECTED_PREFIXES = [
  '/journal',
  '/dashboard',
  '/admin',
  '/api/private/',
  '/api/system/',
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const hasSession =
    req.cookies.has('next-auth.session-token') ||
    req.cookies.has('__Secure-next-auth.session-token');

  if (!hasSession) {
    // API ルートはリダイレクトせずパスさせる（API ハンドラが 401 を返す）
    if (pathname.startsWith('/api/')) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = '/auth/signin';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
