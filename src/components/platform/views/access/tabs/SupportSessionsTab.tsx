'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Wifi,
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
  Clock,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SmartSelect } from '@/components/SmartSelect';
import { useSupportSessions } from '../hooks/useSupportSessions';
import { SessionCard } from '../components/SessionCard';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

type BusinessOption = { value: string; label: string };

export function SupportSessionsTab() {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const sess = useSupportSessions();

  const [businessOptions, setBusinessOptions] = useState<BusinessOption[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = getPlatformAccessToken();
        if (!token) return;
        const data = await apiFetch<{ items: { id: string; name: string }[] }>(
          '/platform/businesses?limit=200',
          { token },
        );
        setBusinessOptions(
          (data.items ?? []).map((b) => ({ value: b.id, label: b.name })),
        );
      } catch {
        /* silent */
      }
    };
    load();
  }, []);

  const VIEW_TABS: {
    key: 'ACTIVE' | 'ALL' | 'REVOKED' | 'EXPIRED';
    label: string;
  }[] = [
    { key: 'ACTIVE', label: t('sessionViewActive') },
    { key: 'ALL', label: t('sessionViewAll') },
    { key: 'REVOKED', label: t('sessionViewRevoked') },
    { key: 'EXPIRED', label: t('sessionViewExpired') },
  ];

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Summary bar */}
      <Card padding="md" className="nvi-slide-in-bottom">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 p-2">
            <div className="flex items-center gap-1.5">
              <Wifi size={11} className="text-emerald-400" />
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('sessionSummaryActive')}
              </p>
            </div>
            <p className="mt-0.5 text-lg font-bold text-emerald-300">
              {sess.activeCount}
            </p>
          </div>
          <div className="rounded-lg bg-blue-500/[0.06] border border-blue-500/20 p-2">
            <div className="flex items-center gap-1.5">
              <UsersIcon size={11} className="text-blue-400" />
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('sessionSummaryBusinesses')}
              </p>
            </div>
            <p className="mt-0.5 text-lg font-bold text-blue-300">
              {sess.businessesCount}
            </p>
          </div>
          <div className="rounded-lg bg-amber-500/[0.06] border border-amber-500/20 p-2">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-amber-400" />
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('sessionSummaryHoursLeft')}
              </p>
            </div>
            <p className="mt-0.5 text-lg font-bold text-amber-300">
              {sess.totalHoursRemaining.toFixed(1)}h
            </p>
          </div>
        </div>
      </Card>

      {/* Filters */}
      <Card padding="md">
        <div className="flex flex-wrap items-center gap-1.5">
          {VIEW_TABS.map((tab) => {
            const isActive = sess.filters.view === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => sess.setView(tab.key)}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition nvi-press ${
                  isActive
                    ? 'bg-[var(--pt-accent)] text-black'
                    : 'bg-white/[0.04] text-[var(--pt-text-2)] hover:bg-white/[0.08]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2">
          <label className="text-[9px] text-[var(--pt-text-muted)]">
            {t('sessionFilterBusiness')}
          </label>
          <SmartSelect
            instanceId="session-filter-business"
            value={sess.filters.businessId}
            onChange={(value) => sess.setBusinessFilter(value)}
            options={businessOptions}
            placeholder={t('sessionFilterBusinessPlaceholder')}
            isClearable
          />
        </div>
      </Card>

      {/* Error */}
      {sess.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2 text-[10px] text-red-300">
          {sess.error}
        </div>
      )}

      {/* List */}
      {sess.isLoading ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : sess.sessions.length === 0 ? (
        <EmptyState
          icon={<Wifi size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('sessionsEmptyTitle')}
          description={t('sessionsEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {sess.sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              locale={locale}
              isRevoking={sess.revokingId === session.id}
              isExtending={sess.extendingId === session.id}
              onRevoke={(reason) => sess.revokeSession(session.id, reason)}
              onExtend={(hours, reason) =>
                sess.extendSession(session.id, hours, reason)
              }
              t={(key, values) => t(key, values)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(sess.hasNextPage || sess.hasPrevPage) && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={sess.prevPage}
            disabled={!sess.hasPrevPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('prevPage')}
          </button>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {t('pageLabel', { page: sess.page })}
          </span>
          <button
            type="button"
            onClick={sess.nextPage}
            disabled={!sess.hasNextPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            {t('nextPage')}
            <ChevronRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}
