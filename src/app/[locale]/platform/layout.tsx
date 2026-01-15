'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ locale?: string }>();
  const locale =
    typeof params?.locale === 'string' ? params.locale : 'en';
  const base = `/${locale}/platform`;
  const pathname = usePathname();
  const isLogin = pathname === `${base}/login`;
  const nav = [
    { href: `${base}/overview`, label: 'Overview' },
    { href: `${base}/health`, label: 'Health' },
    { href: `${base}/businesses`, label: 'Businesses' },
    { href: `${base}/support`, label: 'Support' },
    { href: `${base}/exports`, label: 'Exports' },
    { href: `${base}/announcements`, label: 'Announcements' },
    { href: `${base}/audit`, label: 'Audit' },
    { href: `${base}/incidents`, label: 'Incidents' },
  ];

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-6 nvi-reveal">
      <div className="rounded border border-gold-700/40 bg-black/60 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
          Platform Console
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-gold-100">
          Control center
        </h2>
        <p className="mt-1 text-sm text-gold-300">
          Business registry, health telemetry, audits, and safety controls.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-gold-700/50 px-3 py-1 text-gold-200 hover:border-gold-500 hover:text-gold-100"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
