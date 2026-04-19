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

// AppRunner ヘルスチェックは CloudFront を経由せずに直接来る
// (internal fabric → localhost:3000)。CLOUDFRONT_SECRET チェックの例外扱い。
const CLOUDFRONT_SECRET_EXEMPT = ['/api/health'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── CloudFront 経由チェック ──
  // PLACEHOLDER の時期は ENV 未設定のためスキップ（移行期間の互換性）。
  // 本番で CLOUDFRONT_SECRET が設定されたら、例外パス以外で一致しないものは 403。
  const expectedSecret = process.env.CLOUDFRONT_SECRET;
  if (expectedSecret && !CLOUDFRONT_SECRET_EXEMPT.includes(pathname)) {
    const received = req.headers.get('x-cloudfront-secret');
    if (received !== expectedSecret) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

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
