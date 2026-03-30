'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearPlatformSession, decodeJwt, getPlatformAccessToken } from '@/lib/auth';
import { refreshPlatformAdminToken } from '@/lib/api';

function isTokenExpired(token: string): boolean {
  const payload = decodeJwt<{ exp?: number }>(token);
  if (typeof payload?.exp !== 'number') {
    return false;
  }
  return payload.exp < Math.floor(Date.now() / 1000);
}

export function PlatformAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const isPlatformLogin = pathname.includes('/platform/login');
      if (isPlatformLogin) {
        return;
      }
      const locale = pathname.split('/')[1];
      const loginUrl = `/${locale}/platform/login?returnTo=${encodeURIComponent(pathname)}`;
      const token = getPlatformAccessToken();
      if (!token) {
        router.replace(loginUrl);
        return;
      }
      if (isTokenExpired(token)) {
        const refreshed = await refreshPlatformAdminToken();
        if (cancelled) {
          return;
        }
        if (!refreshed) {
          clearPlatformSession();
          router.replace(`${loginUrl}&expired=1`);
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
