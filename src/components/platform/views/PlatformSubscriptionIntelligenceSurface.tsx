import { Doughnut } from 'react-chartjs-2';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type SelectOption = { value: string; label: string };

type SubscriptionHistoryEntry = {
  previousStatus?: string | null;
  newStatus?: string | null;
  previousTier?: string | null;
  newTier?: string | null;
  createdAt: string;
  changedByPlatformAdminId?: string | null;
  reason?: string | null;
};

type SubscriptionHistoryStats = {
  statusChanges: number;
  tierChanges: number;
  unchanged: number;
  statusPct: number;
  tierPct: number;
  unchangedPct: number;
};

export function PlatformSubscriptionIntelligenceSurface({
  show,
  t,
  historyBusinessId,
  setHistoryBusinessId,
  businessSelectOptions,
  withAction,
  loadSubscriptionHistory,
  loadingHistory,
  subscriptionHistory,
  subscriptionHistoryStats,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  historyBusinessId: string;
  setHistoryBusinessId: (value: string) => void;
  businessSelectOptions: SelectOption[];
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  loadSubscriptionHistory: () => Promise<void>;
  loadingHistory: boolean;
  subscriptionHistory: SubscriptionHistoryEntry[];
  subscriptionHistoryStats: SubscriptionHistoryStats;
}) {
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-5 nvi-reveal">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
          {t('subscriptionIntelligenceTag')}
        </p>
        <h3 className="text-xl font-semibold text-gold-100">{t('subscriptionHistoryTitle')}</h3>
      </div>
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <SmartSelect
              value={historyBusinessId}
              onChange={setHistoryBusinessId}
              options={businessSelectOptions}
              placeholder={t('selectBusiness')}
            />
            <input
              value={historyBusinessId}
              onChange={(event) => setHistoryBusinessId(event.target.value)}
              placeholder={t('historyBusinessIdPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <button
              type="button"
              onClick={() => withAction('subscription:history', loadSubscriptionHistory)}
              className="rounded bg-gold-500 px-3 py-2 text-sm font-semibold text-black"
            >
              <span className="inline-flex items-center gap-2">
                {loadingHistory ? <Spinner size="xs" variant="ring" /> : null}
                {loadingHistory ? t('loading') : t('loadHistory')}
              </span>
            </button>
          </div>
          <div className="space-y-2 text-xs text-gold-300 nvi-stagger">
            {subscriptionHistory.map((entry, index) => (
              <div
                key={`${entry.createdAt}-${index}`}
                className="rounded border border-gold-700/40 bg-black/40 p-3"
              >
                <p className="text-gold-100">
                  {entry.previousStatus ?? t('notAvailable')} → {entry.newStatus ?? t('notAvailable')} •{' '}
                  {entry.previousTier ?? t('notAvailable')} → {entry.newTier ?? t('notAvailable')}
                </p>
                <p>{new Date(entry.createdAt).toLocaleString()}</p>
                {entry.changedByPlatformAdminId ? (
                  <p>{t('adminLabel', { admin: entry.changedByPlatformAdminId })}</p>
                ) : null}
                {entry.reason ? <p>{t('reasonLabel', { reason: entry.reason })}</p> : null}
              </div>
            ))}
            {!subscriptionHistory.length ? <p className="text-gold-400">{t('noHistory')}</p> : null}
          </div>
        </div>
        <div className="rounded border border-gold-700/40 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-500">
            {t('subscriptionChangeMixTitle')}
          </p>
          <p className="mt-1 text-xs text-gold-400">{t('subscriptionChangeMixSubtitle')}</p>
          <div className="mt-3">
            <Doughnut
              data={{
                labels: [
                  t('subscriptionChangeStatusLabel'),
                  t('subscriptionChangeTierLabel'),
                  t('subscriptionChangeOtherLabel'),
                ],
                datasets: [
                  {
                    data: [
                      subscriptionHistoryStats.statusChanges,
                      subscriptionHistoryStats.tierChanges,
                      subscriptionHistoryStats.unchanged,
                    ],
                    backgroundColor: ['#f59e0b', '#f97316', '#78350f'],
                    borderColor: ['#f59e0b', '#f97316', '#78350f'],
                  },
                ],
              }}
              options={{ plugins: { legend: { labels: { color: '#fcd34d' } } } }}
            />
          </div>
          <div className="mt-3 space-y-1 text-xs text-gold-300">
            <p>
              {t('subscriptionChangeStatusSummary', {
                value: subscriptionHistoryStats.statusChanges,
              })}{' '}
              ({subscriptionHistoryStats.statusPct}%)
            </p>
            <p>
              {t('subscriptionChangeTierSummary', {
                value: subscriptionHistoryStats.tierChanges,
              })}{' '}
              ({subscriptionHistoryStats.tierPct}%)
            </p>
            <p>
              {t('subscriptionChangeOtherSummary', {
                value: subscriptionHistoryStats.unchanged,
              })}{' '}
              ({subscriptionHistoryStats.unchangedPct}%)
            </p>
            <p className="text-gold-500">
              {t('subscriptionChangeTotalSummary', { value: subscriptionHistory.length })}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
