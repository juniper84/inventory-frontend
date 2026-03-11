import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

/**
 * Business routes that do NOT require the nvi.auth cookie.
 * Paths are relative to the locale root (e.g. /en/).
 */
const BUSINESS_PUBLIC_PATHS = [
  '/login',
  '/signup',
  '/invite',
  '/verify-email',
  '/password-reset',
  '/password-reset/confirm',
];

/**
 * Platform routes that do NOT require the nvi.platform_auth cookie.
 */
const PLATFORM_PUBLIC_PATHS = ['/platform/login'];

/**
 * Strip the locale prefix from a pathname and return both parts.
 * Returns null if the pathname does not begin with a supported locale.
 */
function parseLocalePath(pathname: string): { locale: string; path: string } | null {
  const match = pathname.match(/^\/(en|sw)(\/.*)?$/);
  if (!match) return null;
  return { locale: match[1], path: match[2] ?? '/' };
}

function isPublicPath(path: string, publicPaths: string[]): boolean {
  return publicPaths.some((p) => path === p || path.startsWith(p + '/'));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // ── Maintenance mode ────────────────────────────────────────────────────────
  // Activated by setting NEXT_PUBLIC_MAINTENANCE_MODE=true in Vercel env vars.
  // Platform admin routes remain accessible so you can manage the system.
  // Update NEXT_PUBLIC_MAINTENANCE_END (ISO timestamp, EAT timezone) to show
  // the expected return time on the maintenance page, e.g.:
  //   NEXT_PUBLIC_MAINTENANCE_END=2026-03-11T06:00:00+03:00
  if (process.env.NEXT_PUBLIC_MAINTENANCE_MODE === 'true') {
    const isExempt =
      pathname === '/maintenance' ||
      pathname.includes('/platform') ||
      pathname.startsWith('/_next') ||
      pathname.startsWith('/api') ||
      pathname === '/favicon.ico' ||
      /\.(png|svg|jpg|webp|ico|json|txt|xml)$/.test(pathname);

    if (!isExempt) {
      const url = request.nextUrl.clone();
      url.pathname = '/maintenance';
      return NextResponse.rewrite(url);
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  const parsed = parseLocalePath(pathname);

  // No recognised locale prefix yet (e.g. bare `/`) — let next-intl redirect.
  if (!parsed) {
    return intlMiddleware(request) as NextResponse;
  }

  const { locale, path } = parsed;

  if (path.startsWith('/platform')) {
    // ── Platform admin routes ──────────────────────────────────────────────
    if (isPublicPath(path, PLATFORM_PUBLIC_PATHS)) {
      return intlMiddleware(request) as NextResponse;
    }
    if (!request.cookies.has('nvi.platform_auth')) {
      const loginUrl = new URL(`/${locale}/platform/login`, request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  } else {
    // ── Business routes ────────────────────────────────────────────────────
    if (isPublicPath(path, BUSINESS_PUBLIC_PATHS)) {
      return intlMiddleware(request) as NextResponse;
    }
    if (!request.cookies.has('nvi.auth')) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return intlMiddleware(request) as NextResponse;
}

export const config = {
  // Run on all paths except Next.js internals, static files, and API routes.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|api/).*)'],
};
