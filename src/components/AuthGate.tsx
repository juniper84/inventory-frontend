'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getAccessToken } from '@/lib/auth';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getAccessToken();
    const isAuthRoute =
      pathname.includes('/login') ||
      pathname.includes('/signup') ||
      pathname.includes('/invite') ||
      pathname.includes('/verify-email') ||
      pathname.includes('/password-reset');
    if (!token && !isAuthRoute) {
      router.replace(`${pathname.split('/').slice(0, 2).join('/')}/login`);
    }
  }, [pathname, router]);

  return <>{children}</>;
}
