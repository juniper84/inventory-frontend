'use client';

import { useParams, usePathname } from 'next/navigation';
import { PlatformShell } from '@/components/platform/shell/PlatformShell';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ locale?: string }>();
  const locale =
    typeof params?.locale === 'string' ? params.locale : 'en';
  const base = `/${locale}/platform`;
  const pathname = usePathname();
  const isLogin = pathname === `${base}/login`;

  if (isLogin) {
    return <>{children}</>;
  }

  return <PlatformShell basePath={base}>{children}</PlatformShell>;
}
