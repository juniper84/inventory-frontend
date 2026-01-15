'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getPlatformAccessToken } from '@/lib/auth';

export function PlatformAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = getPlatformAccessToken();
    const isPlatformLogin = pathname.includes('/platform/login');
    if (!token && !isPlatformLogin) {
      router.replace(`/${pathname.split('/')[1]}/platform/login`);
    }
  }, [pathname, router]);

  return <>{children}</>;
}
