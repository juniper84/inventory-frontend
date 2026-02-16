import Link from 'next/link';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';

type Business = {
  id: string;
  name: string;
  status: string;
  underReview?: boolean | null;
  subscription?: {
    tier: string;
    status: string;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
  } | null;
  lastActivityAt?: string | null;
};

type Option = { id: string; label: string };

type StatusFilter = 'ACTIVE' | 'UNDER_REVIEW' | 'ARCHIVED' | 'DELETED';

export function PlatformBusinessRegistryPanel({
  show,
  t,
  locale,
  withAction,
  actionLoading,
  businessSearch,
  setBusinessSearch,
  businessOptions,
  selectedBusinessId,
  setSelectedBusinessId,
  businessSelectOptions,
  applySelectedBusiness,
  businessStatusFilter,
  setBusinessStatusFilter,
  filteredBusinesses,
  businesses,
  getBusinessRiskScore,
  pinnedBusinessIds,
  togglePinnedBusiness,
  updateReview,
  nextBusinessCursor,
  loadBusinesses,
  isLoadingMoreBusinesses,
}: {
  show: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  actionLoading: Record<string, boolean>;
  businessSearch: string;
  setBusinessSearch: (value: string) => void;
  businessOptions: Option[];
  selectedBusinessId: string;
  setSelectedBusinessId: (value: string) => void;
  businessSelectOptions: { value: string; label: string }[];
  applySelectedBusiness: () => void | Promise<void>;
  businessStatusFilter: StatusFilter;
  setBusinessStatusFilter: (value: StatusFilter) => void;
  filteredBusinesses: Business[];
  businesses: Business[];
  getBusinessRiskScore: (business: Business) => number;
  pinnedBusinessIds: string[];
  togglePinnedBusiness: (businessId: string) => void;
  updateReview: (
    businessId: string,
    options?: { underReview: boolean; reason: string; severity: string },
  ) => Promise<void>;
  nextBusinessCursor: string | null;
  loadBusinesses: (cursor?: string, append?: boolean) => Promise<void>;
  isLoadingMoreBusinesses: boolean;
}) {
  if (!show) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[2fr_1fr_auto]">
        <TypeaheadInput
          value={businessSearch}
          onChange={setBusinessSearch}
          onSelect={(option) => {
            setBusinessSearch(option.label);
            setSelectedBusinessId(option.id);
          }}
          options={businessOptions}
          placeholder={t('searchBusinesses')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <SmartSelect
          value={selectedBusinessId}
          onChange={setSelectedBusinessId}
          options={businessSelectOptions}
          placeholder={t('selectBusiness')}
        />
        <button
          type="button"
          onClick={() => withAction('businesses:apply', async () => applySelectedBusiness())}
          className="rounded bg-gold-500 px-3 py-2 text-xs font-semibold text-black"
        >
          <span className="inline-flex items-center gap-2">
            {actionLoading['businesses:apply'] ? <Spinner size="xs" variant="dots" /> : null}
            {t('useSelectedBusiness')}
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            { value: 'ACTIVE', label: t('statusActive') },
            { value: 'UNDER_REVIEW', label: t('underReview') },
            { value: 'ARCHIVED', label: t('statusArchived') },
            { value: 'DELETED', label: t('statusDeletedReady') },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setBusinessStatusFilter(option.value as StatusFilter)}
              className={`rounded border px-3 py-1 text-[10px] uppercase tracking-[0.25em] transition ${
                businessStatusFilter === option.value
                  ? 'border-gold-500 bg-gold-500/15 text-gold-100'
                  : 'border-gold-800/60 text-gold-500'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gold-500">
          {t('businessesShowingSummary', {
            shown: filteredBusinesses.length,
            total: businesses.length,
          })}
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-gold-700/30 bg-black/40">
        <table className="min-w-full text-[13px] text-gold-200">
          <thead>
            <tr className="border-b border-gold-700/40 text-left text-xs uppercase tracking-[0.22em] text-gold-400">
              <th className="px-3 py-2">{t('tableBusiness')}</th>
              <th className="px-3 py-2">{t('tableStatus')}</th>
              <th className="px-3 py-2">{t('tableTier')}</th>
              <th className="px-3 py-2">{t('tableRisk')}</th>
              <th className="px-3 py-2">{t('tableLastActivity')}</th>
              <th className="px-3 py-2">{t('tableActions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredBusinesses.map((business) => {
              const riskScore = getBusinessRiskScore(business);
              return (
                <tr
                  key={`${business.id}-row`}
                  className="border-b border-gold-800/40 last:border-0 hover:bg-gold-500/5"
                >
                  <td className="px-3 py-2">
                    <p className="text-base text-gold-100">{business.name}</p>
                    <p className="text-xs text-gold-500">{business.id}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border border-gold-700/50 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gold-200">
                      {business.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{business.subscription?.tier ?? t('notAvailable')}</td>
                  <td className="px-3 py-2">{riskScore}</td>
                  <td className="px-3 py-2">
                    {business.lastActivityAt
                      ? new Date(business.lastActivityAt).toLocaleDateString()
                      : t('notAvailable')}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <Link
                        href={`/${locale}/platform/businesses/${business.id}`}
                        className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-200"
                      >
                        {t('open')}
                      </Link>
                      <button
                        type="button"
                        onClick={() => togglePinnedBusiness(business.id)}
                        className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-200"
                      >
                        {pinnedBusinessIds.includes(business.id) ? t('pinned') : t('pin')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          withAction(`review:flag:${business.id}`, async () => {
                            await updateReview(business.id, {
                              underReview: true,
                              reason: t('markRiskDefaultReason'),
                              severity: 'MEDIUM',
                            });
                          })
                        }
                        className="rounded border border-amber-500/60 px-2 py-1 text-xs text-amber-200"
                      >
                        {t('markRisk')}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filteredBusinesses.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-gold-400">
                  {t('noBusinesses')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {nextBusinessCursor ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() =>
              withAction('businesses:loadMore', () => loadBusinesses(nextBusinessCursor, true))
            }
            className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLoadingMoreBusinesses}
          >
            {isLoadingMoreBusinesses ? (
              <Spinner size="xs" variant="grid" />
            ) : actionLoading['businesses:loadMore'] ? (
              <Spinner size="xs" variant="grid" />
            ) : null}
            {isLoadingMoreBusinesses ? t('loading') : t('loadMoreBusinesses')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
