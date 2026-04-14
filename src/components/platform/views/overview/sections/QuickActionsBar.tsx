'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Building2, Megaphone, BarChart3, Activity } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function QuickActionsBar() {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();

  const actions = [
    { key: 'newBusiness', icon: <Building2 size={14} />, href: `/${params.locale}/platform/businesses`, label: t('overviewQuickNewBusiness') },
    { key: 'announce', icon: <Megaphone size={14} />, href: `/${params.locale}/platform/announcements`, label: t('overviewQuickAnnouncement') },
    { key: 'analytics', icon: <BarChart3 size={14} />, href: `/${params.locale}/platform/analytics`, label: t('overviewQuickAnalytics') },
    { key: 'health', icon: <Activity size={14} />, href: `/${params.locale}/platform/intelligence`, label: t('overviewQuickHealthCheck') },
  ];

  return (
    <Card padding="md" className="nvi-slide-in-bottom">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('overviewQuickActionsTitle')}
        </p>
        {actions.map((action) => (
          <Link
            key={action.key}
            href={action.href}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--pt-accent-border)] px-3 py-1.5 text-[10px] font-semibold text-[var(--pt-accent)] transition hover:bg-[var(--pt-accent-dim)] nvi-press"
          >
            {action.icon}
            {action.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}
