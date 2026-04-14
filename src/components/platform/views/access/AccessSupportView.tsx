'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Clock,
  Wifi,
  CreditCard,
  CheckCircle,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/notifications/Banner';
import { FlipCounter } from '@/components/analog/FlipCounter';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import { SupportRequestsTab } from './tabs/SupportRequestsTab';
import { SupportSessionsTab } from './tabs/SupportSessionsTab';

type TabKey = 'requests' | 'sessions';

type SubscriptionRequestsResponse = {
  items: { id: string; businessId: string; status: string }[];
};

type SupportRequestsResponse = {
  items: {
    id: string;
    status: string;
    decidedAt?: string | null;
  }[];
};

type SupportSessionsResponse = {
  items: { id: string; expiresAt: string; revokedAt?: string | null }[];
};

export function AccessSupportView() {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';

  const [activeTab, setActiveTab] = useState<TabKey>('requests');
  const [kpis, setKpis] = useState({
    pendingRequests: 0,
    activeSessions: 0,
    pendingSubscriptions: 0,
    resolvedToday: 0,
  });
  const [pendingSubscriptionFirstId, setPendingSubscriptionFirstId] =
    useState<{ id: string; businessId: string } | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const loadKpis = async () => {
    try {
      const token = getPlatformAccessToken();
      if (!token) return;

      const [requestsRes, sessionsRes, subRes] = await Promise.all([
        apiFetch<SupportRequestsResponse>(
          '/platform/support-access/requests?limit=200',
          { token },
        ),
        apiFetch<SupportSessionsResponse>(
          '/platform/support-access/sessions?limit=200&activeOnly=true',
          { token },
        ),
        apiFetch<SubscriptionRequestsResponse>(
          '/platform/subscription-requests?limit=50&status=PENDING',
          { token },
        ),
      ]);

      const now = Date.now();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const pendingRequests = (requestsRes.items ?? []).filter(
        (r) => r.status === 'PENDING',
      ).length;

      const activeSessions = (sessionsRes.items ?? []).filter(
        (s) => !s.revokedAt && new Date(s.expiresAt).getTime() > now,
      ).length;

      const resolvedToday = (requestsRes.items ?? []).filter((r) => {
        if (r.status === 'PENDING') return false;
        if (!r.decidedAt) return false;
        return new Date(r.decidedAt).getTime() >= startOfDay.getTime();
      }).length;

      const pendingSub = subRes.items ?? [];
      setKpis({
        pendingRequests,
        activeSessions,
        pendingSubscriptions: pendingSub.length,
        resolvedToday,
      });
      setPendingSubscriptionFirstId(
        pendingSub[0]
          ? { id: pendingSub[0].id, businessId: pendingSub[0].businessId }
          : null,
      );
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Failed to load summary',
      );
    }
  };

  useEffect(() => {
    loadKpis();
    const id = setInterval(loadKpis, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4 nvi-stagger">
      <PageHeader
        title={t('accessTitle')}
        subtitle={t('accessSubtitle')}
      />

      {bannerError && (
        <Banner
          severity="error"
          message={bannerError}
          onDismiss={() => setBannerError(null)}
        />
      )}

      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 nvi-stagger">
        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
              <Clock size={14} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiPendingRequests')}
              </p>
              <FlipCounter value={kpis.pendingRequests} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <Wifi size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiActiveSessions')}
              </p>
              <FlipCounter value={kpis.activeSessions} size="md" digits={3} />
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-yellow-500/10">
              <CreditCard size={14} className="text-yellow-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiSubscriptionQueue')}
              </p>
              <div className="flex items-baseline gap-2">
                <FlipCounter
                  value={kpis.pendingSubscriptions}
                  size="md"
                  digits={3}
                />
                {pendingSubscriptionFirstId && (
                  <Link
                    href={`/${locale}/platform/businesses/${pendingSubscriptionFirstId.businessId}`}
                    className="inline-flex items-center gap-0.5 text-[9px] text-[var(--pt-text-muted)] hover:text-[var(--pt-accent)]"
                    title={t('kpiSubscriptionQueueLinkHint')}
                  >
                    {t('kpiSubscriptionQueueOpen')}
                    <ExternalLink size={9} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card padding="md" className="nvi-slide-in-bottom">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10">
              <CheckCircle size={14} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('kpiResolvedToday')}
              </p>
              <FlipCounter value={kpis.resolvedToday} size="md" digits={3} />
            </div>
          </div>
        </Card>
      </div>

      {/* Tab nav */}
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'requests'
              ? 'bg-[var(--pt-accent)] text-black'
              : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
          }`}
        >
          <ShieldCheck size={12} />
          {t('tabSupportRequests')}
          {kpis.pendingRequests > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                activeTab === 'requests'
                  ? 'bg-black/20 text-black'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {kpis.pendingRequests}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activeTab === 'sessions'
              ? 'bg-[var(--pt-accent)] text-black'
              : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
          }`}
        >
          <Wifi size={12} />
          {t('tabActiveSessions')}
          {kpis.activeSessions > 0 && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[9px] font-semibold leading-none ${
                activeTab === 'sessions'
                  ? 'bg-black/20 text-black'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              {kpis.activeSessions}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'requests' && <SupportRequestsTab />}
      {activeTab === 'sessions' && <SupportSessionsTab />}
    </div>
  );
}
