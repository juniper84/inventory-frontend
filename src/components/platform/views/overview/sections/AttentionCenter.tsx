'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Eye,
  WifiOff,
  Loader,
  Activity,
  Layers,
  CircleX,
  Megaphone,
  CircleCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import type { AttentionFlag } from '../hooks/useOverviewDashboard';

type Props = {
  activeFlags: AttentionFlag[];
  inactiveCount: number;
};

const FLAG_ICONS: Record<string, React.ReactNode> = {
  underReview: <Eye size={16} />,
  offlineFailures: <WifiOff size={16} />,
  exportsPending: <Loader size={16} />,
  apiErrorRate: <Activity size={16} />,
  queuePressure: <Layers size={16} />,
  exportsFailed: <CircleX size={16} />,
  activeAnnouncements: <Megaphone size={16} />,
};

export function AttentionCenter({ activeFlags, inactiveCount }: Props) {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();

  if (activeFlags.length === 0) {
    return (
      <Card padding="lg" className="nvi-slide-in-bottom">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('overviewNeedsAttentionTitle')}
        </p>
        <div className="flex items-center gap-3 py-4 nvi-float">
          <CircleCheck size={24} className="text-emerald-400" />
          <p className="text-sm text-emerald-300">{t('overviewAllClear')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="lg" className="nvi-slide-in-bottom">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-muted)]">
          {t('overviewNeedsAttentionTitle')}
        </p>
        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-400">
          {activeFlags.length}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {activeFlags.map((flag) => (
          <Link
            key={flag.key}
            href={`/${params.locale}${flag.href}`}
            className={`flex items-center gap-3 rounded-xl border p-3 transition nvi-press ${
              flag.severity === 'critical'
                ? 'border-red-500/20 bg-red-500/5 text-red-400'
                : 'border-amber-500/20 bg-amber-500/5 text-amber-400'
            }`}
          >
            <div className={`shrink-0 ${flag.severity === 'critical' ? 'animate-pulse' : ''}`}>
              {FLAG_ICONS[flag.key] ?? <Activity size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{t(`overviewFlag.${flag.key}`, { count: flag.count })}</p>
            </div>
            <span className="shrink-0 text-sm font-bold">{flag.count}</span>
          </Link>
        ))}
      </div>

      {inactiveCount > 0 && (
        <p className="mt-3 text-[10px] text-[var(--pt-text-muted)]">
          {t('overviewSystemsOk', { count: inactiveCount })}
        </p>
      )}
    </Card>
  );
}
