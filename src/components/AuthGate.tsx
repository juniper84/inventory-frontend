'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { decodeJwt, getAccessToken } from '@/lib/auth';
import { refreshSessionToken } from '@/lib/api';

function isTokenExpired(token: string): boolean {
  const payload = decodeJwt<{ exp?: number }>(token);
  if (typeof payload?.exp !== 'number') {
    return false;
  }
  return payload.exp < Math.floor(Date.now() / 1000);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const token = getAccessToken();
      const isAuthRoute =
        pathname.includes('/login') ||
        pathname.includes('/signup') ||
        pathname.includes('/invite') ||
        pathname.includes('/verify-email') ||
        pathname.includes('/password-reset');
      if (isAuthRoute) {
        return;
      }
      const base = pathname.split('/').slice(0, 2).join('/');
      const safeReturn =
        pathname.startsWith('/') && !pathname.startsWith('//')
          ? encodeURIComponent(pathname)
          : '';
      const loginUrl = `${base}/login${safeReturn ? `?returnTo=${safeReturn}` : ''}`;
      if (!token) {
        router.replace(loginUrl);
        return;
      }
      if (isTokenExpired(token)) {
        const refreshed = await refreshSessionToken();
        if (cancelled) {
          return;
        }
        if (!refreshed) {
          router.replace(loginUrl);
        }
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return <>{children}</>;
}
