'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { Headset, Package, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { QueueSummaryPayload } from '@/components/platform/types';

type Props = {
  queues: QueueSummaryPayload | null;
};

export function QueueMonitor({ queues }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();

  if (!queues) return null;

  const rows = [
    {
      key: 'support',
      icon: <Headset size={16} />,
      label: t('overviewQueueSupport'),
      actionable: queues.support.actionable,
      byStatus: queues.support.byStatus,
      href: `/${params.locale}/platform/access`,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      key: 'exports',
      icon: <Package size={16} />,
      label: t('overviewQueueExports'),
      actionable: queues.exports.actionable,
      byStatus: queues.exports.byStatus,
      href: `/${params.locale}/platform/operations`,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    {
      key: 'subscriptions',
      icon: <CreditCard size={16} />,
      label: t('overviewQueueSubscriptions'),
      actionable: queues.subscriptions.actionable,
      byStatus: queues.subscriptions.byStatus,
      href: `/${params.locale}/platform/businesses`,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
  ];

  return (
    <Card padding="lg" className="nvi-slide-in-bottom">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
        {t('overviewQueuesTitle')}
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <Link
            key={row.key}
            href={row.href}
            className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 transition hover:border-[var(--pt-accent-border)] nvi-press"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${row.bg} ${row.color}`}>
              {row.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--pt-text-1)]">{row.label}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(row.byStatus)
                  .filter(([, count]) => count > 0)
                  .slice(0, 4)
                  .map(([status, count]) => (
                    <span
                      key={status}
                      className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-[var(--pt-text-muted)]"
                    >
                      {status}: {count}
                    </span>
                  ))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-lg font-bold ${row.actionable > 0 ? row.color : 'text-[var(--pt-text-muted)]'}`}>
                {row.actionable}
              </p>
              <p className="text-[9px] text-[var(--pt-text-muted)]">{t('overviewActionable')}</p>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
