import type { Dispatch, SetStateAction } from 'react';
import { Spinner } from '@/components/Spinner';
import { PlatformBusinessActionModal } from '@/components/platform/views/PlatformBusinessActionModal';
import { PlatformBusinessRegistryPanel } from '@/components/platform/views/PlatformBusinessRegistryPanel';
import { PlatformBusinessWorkspacePanel } from '@/components/platform/views/PlatformBusinessWorkspacePanel';

type Business = {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  lastActivityAt?: string | null;
  underReview?: boolean | null;
  reviewReason?: string | null;
  reviewSeverity?: string | null;
  subscription?: {
    tier: string;
    status: string;
    trialEndsAt?: string | null;
    graceEndsAt?: string | null;
    expiresAt?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
  } | null;
  counts?: { branches: number; users: number; offlineDevices: number };
};

type BusinessWorkspace = {
  business: {
    id: string;
    name: string;
    status: string;
    underReview?: boolean | null;
    reviewReason?: string | null;
    reviewSeverity?: string | null;
    createdAt?: string;
    updatedAt?: string;
    lastActivityAt?: string | null;
  };
  subscription?: {
    tier?: string | null;
    status?: string | null;
  } | null;
  settings?: {
    readOnlyEnabled?: boolean;
    readOnlyReason?: string | null;
    rateLimitOverride?: Record<string, unknown> | null;
  } | null;
  counts?: {
    branches: number;
    users: number;
    offlineDevices: number;
  };
  risk?: {
    subscriptionStatus?: string;
    offlineFailed?: number;
    exportsPending?: number;
    score?: number;
  } | null;
  queues?: {
    pendingSupport: number;
    pendingExports: number;
    pendingSubscriptionRequests: number;
  } | null;
  devices?: { id: string; deviceName?: string | null; status: string }[];
  recentAdminActions?: {
    id: string;
    action: string;
    outcome: string;
    resourceType: string;
    resourceId?: string | null;
    reason?: string | null;
    createdAt: string;
  }[];
  generatedAt?: string;
};

type BusinessActionPreflight = {
  action: string;
  business: {
    id: string;
    name: string;
    status: string;
    updatedAt: string;
  };
  impact: {
    users: number;
    pendingExports: number;
    activeDevices: number;
    failedOfflineActions: number;
    currentStatus: string;
    readOnlyEnabled: boolean;
    subscriptionStatus?: string | null;
  };
  preconditions: { code: string; ok: boolean; message: string }[];
  ready: boolean;
  generatedAt: string;
};

type BusinessActionModalState = {
  businessId: string;
  action:
    | 'SUSPEND'
    | 'READ_ONLY'
    | 'FORCE_LOGOUT'
    | 'ARCHIVE'
    | 'DELETE_READY'
    | 'RESTORE'
    | 'PURGE';
  step: 1 | 2 | 3;
  reason: string;
  confirmBusinessId: string;
  confirmText: string;
  preflightLoading: boolean;
  preflightError: string | null;
  preflight: BusinessActionPreflight | null;
};

type SeverityOption = { value: string; label: string };

type BusinessOption = { id: string; label: string };
type BusinessSelectOption = { value: string; label: string };

type BusinessStatusFilter = 'ACTIVE' | 'UNDER_REVIEW' | 'ARCHIVED' | 'DELETED';

type WorkspaceTab =
  | 'SUMMARY'
  | 'SUBSCRIPTION'
  | 'RISK_STATUS'
  | 'ACCESS'
  | 'DEVICES'
  | 'DANGER';

type SubscriptionEdit = {
  tier: string;
  status: string;
  reason: string;
  startsAt?: string;
  trialEndsAt: string;
  graceEndsAt: string;
  expiresAt: string;
  durationDays?: string;
};

type ReadOnlyEdit = { enabled: boolean; reason: string };
type StatusEdit = { status: string; reason: string };
type ReviewEdit = { underReview: boolean; reason: string; severity: string };

type TrendPoint = { label: string; offlineFailed: number; exportsPending: number };
type Device = { id: string; deviceName?: string | null; status: string };

export function PlatformBusinessesCommandSurface({
  show,
  showBusinessDetailPage,
  t,
  locale,
  withAction,
  actionLoading,
  loadBusinesses,
  businesses,
  openedBusiness,
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
  getBusinessRiskScore,
  pinnedBusinessIds,
  togglePinnedBusiness,
  updateReview,
  nextBusinessCursor,
  isLoadingMoreBusinesses,
  openedBusinessWorkspace,
  loadingBusinessWorkspace,
  businessDrawerTab,
  setBusinessDrawerTab,
  loadBusinessWorkspace,
  loadBusinessHealth,
  healthMap,
  businessTrendRange,
  setBusinessTrendRange,
  businessTrendSeries,
  formatDateLabel,
  getDaysRemaining,
  subscriptionEdits,
  setSubscriptionEdits,
  updateSubscription,
  recordSubscriptionPurchase,
  resetSubscriptionLimits,
  statusEdits,
  setStatusEdits,
  updateStatus,
  reviewEdits,
  setReviewEdits,
  incidentSeverityOptions,
  supportNotes,
  setSupportNotes,
  readOnlyEdits,
  setReadOnlyEdits,
  updateReadOnly,
  openBusinessActionModal,
  exportOnExit,
  deviceRevokeReason,
  setDeviceRevokeReason,
  loadDevices,
  devicesMap,
  loadingDevices,
  revokeDevice,
  businessActionModal,
  setBusinessActionModal,
  actionNeedsPreflight,
  executeBusinessActionModal,
}: {
  show: boolean;
  showBusinessDetailPage: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  actionLoading: Record<string, boolean>;
  loadBusinesses: (cursor?: string, append?: boolean) => Promise<void>;
  businesses: Business[];
  openedBusiness: Business | null;
  businessSearch: string;
  setBusinessSearch: Dispatch<SetStateAction<string>>;
  businessOptions: BusinessOption[];
  selectedBusinessId: string;
  setSelectedBusinessId: Dispatch<SetStateAction<string>>;
  businessSelectOptions: BusinessSelectOption[];
  applySelectedBusiness: () => void | Promise<void>;
  businessStatusFilter: BusinessStatusFilter;
  setBusinessStatusFilter: Dispatch<SetStateAction<BusinessStatusFilter>>;
  filteredBusinesses: Business[];
  getBusinessRiskScore: (business: Business) => number;
  pinnedBusinessIds: string[];
  togglePinnedBusiness: (businessId: string) => void;
  updateReview: (
    businessId: string,
    options?: { underReview: boolean; reason: string; severity: string },
  ) => Promise<void>;
  nextBusinessCursor: string | null;
  isLoadingMoreBusinesses: boolean;
  openedBusinessWorkspace: BusinessWorkspace | null;
  loadingBusinessWorkspace: Record<string, boolean>;
  businessDrawerTab: WorkspaceTab;
  setBusinessDrawerTab: Dispatch<SetStateAction<WorkspaceTab>>;
  loadBusinessWorkspace: (businessId: string) => Promise<void>;
  loadBusinessHealth: (businessId: string) => Promise<void>;
  healthMap: Record<string, { score: number }>;
  businessTrendRange: '7d' | '30d';
  setBusinessTrendRange: Dispatch<SetStateAction<'7d' | '30d'>>;
  businessTrendSeries: TrendPoint[];
  formatDateLabel: (value?: string | null) => string;
  getDaysRemaining: (value?: string | null) => number | null;
  subscriptionEdits: Record<string, SubscriptionEdit>;
  setSubscriptionEdits: Dispatch<SetStateAction<Record<string, SubscriptionEdit>>>;
  updateSubscription: (businessId: string) => Promise<void>;
  recordSubscriptionPurchase: (businessId: string) => Promise<void>;
  resetSubscriptionLimits: (businessId: string) => Promise<void>;
  statusEdits: Record<string, StatusEdit>;
  setStatusEdits: Dispatch<SetStateAction<Record<string, StatusEdit>>>;
  updateStatus: (businessId: string) => Promise<void>;
  reviewEdits: Record<string, ReviewEdit>;
  setReviewEdits: Dispatch<SetStateAction<Record<string, ReviewEdit>>>;
  incidentSeverityOptions: SeverityOption[];
  supportNotes: Record<string, string>;
  setSupportNotes: Dispatch<SetStateAction<Record<string, string>>>;
  readOnlyEdits: Record<string, ReadOnlyEdit>;
  setReadOnlyEdits: Dispatch<SetStateAction<Record<string, ReadOnlyEdit>>>;
  updateReadOnly: (businessId: string) => Promise<void>;
  openBusinessActionModal: (
    businessId: string,
    action:
      | 'SUSPEND'
      | 'READ_ONLY'
      | 'FORCE_LOGOUT'
      | 'ARCHIVE'
      | 'DELETE_READY'
      | 'RESTORE'
      | 'PURGE',
  ) => void;
  exportOnExit: (businessId: string) => Promise<void>;
  deviceRevokeReason: string;
  setDeviceRevokeReason: Dispatch<SetStateAction<string>>;
  loadDevices: (businessId: string) => Promise<void>;
  devicesMap: Record<string, Device[]>;
  loadingDevices: Record<string, boolean>;
  revokeDevice: (deviceId: string, businessId: string, reason?: string) => Promise<void>;
  businessActionModal: BusinessActionModalState | null;
  setBusinessActionModal: Dispatch<SetStateAction<BusinessActionModalState | null>>;
  actionNeedsPreflight: (action: BusinessActionModalState['action']) => boolean;
  executeBusinessActionModal: () => Promise<void>;
}) {
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-5 nvi-reveal">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-400">
            {showBusinessDetailPage ? t('businessWorkspaceTag') : t('businessCommandCenterTag')}
          </p>
          <h3 className="text-xl font-semibold text-gold-100">
            {showBusinessDetailPage
              ? openedBusiness?.name ?? t('businessRegistryTitle')
              : t('businessRegistryTitle')}
          </h3>
        </div>
        <button
          type="button"
          onClick={() => withAction('businesses:load', () => loadBusinesses())}
          className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100"
        >
          <span className="inline-flex items-center gap-2">
            {actionLoading['businesses:load'] ? <Spinner size="xs" variant="grid" /> : null}
            {t('loadBusinesses')}
          </span>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">{t('businessTileTotal')}</p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">{businesses.length}</p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">{t('businessTileActive')}</p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">
            {businesses.filter((business) => business.status === 'ACTIVE').length}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">{t('businessTileUnderReview')}</p>
          <p className="mt-1 text-2xl font-semibold text-amber-200">
            {businesses.filter((business) => business.underReview).length}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">{t('businessTileArchived')}</p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">
            {businesses.filter((business) => business.status === 'ARCHIVED').length}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">{t('businessTileDeletedReady')}</p>
          <p className="mt-1 text-2xl font-semibold text-red-200">
            {businesses.filter((business) => business.status === 'DELETED').length}
          </p>
        </div>
        <div className="nvi-tile p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-400">{t('businessTileHighRisk')}</p>
          <p className="mt-1 text-2xl font-semibold text-amber-200">
            {businesses.filter((business) => getBusinessRiskScore(business) >= 60).length}
          </p>
        </div>
      </div>

      <div className={`grid gap-4 ${showBusinessDetailPage ? 'grid-cols-1' : 'xl:grid-cols-1'}`}>
        <PlatformBusinessRegistryPanel
          show={!showBusinessDetailPage}
          t={t}
          locale={locale}
          withAction={withAction}
          actionLoading={actionLoading}
          businessSearch={businessSearch}
          setBusinessSearch={setBusinessSearch}
          businessOptions={businessOptions}
          selectedBusinessId={selectedBusinessId}
          setSelectedBusinessId={setSelectedBusinessId}
          businessSelectOptions={businessSelectOptions}
          applySelectedBusiness={applySelectedBusiness}
          businessStatusFilter={businessStatusFilter}
          setBusinessStatusFilter={setBusinessStatusFilter}
          filteredBusinesses={filteredBusinesses}
          businesses={businesses}
          getBusinessRiskScore={getBusinessRiskScore}
          pinnedBusinessIds={pinnedBusinessIds}
          togglePinnedBusiness={togglePinnedBusiness}
          updateReview={updateReview}
          nextBusinessCursor={nextBusinessCursor}
          loadBusinesses={loadBusinesses}
          isLoadingMoreBusinesses={isLoadingMoreBusinesses}
        />

        <PlatformBusinessWorkspacePanel
          show={showBusinessDetailPage}
          t={t}
          locale={locale}
          openedBusiness={openedBusiness}
          openedBusinessWorkspace={openedBusinessWorkspace}
          loadingBusinessWorkspace={loadingBusinessWorkspace}
          businessDrawerTab={businessDrawerTab}
          setBusinessDrawerTab={setBusinessDrawerTab}
          withAction={withAction}
          actionLoading={actionLoading}
          loadBusinessWorkspace={loadBusinessWorkspace}
          loadBusinessHealth={loadBusinessHealth}
          healthMap={healthMap}
          getBusinessRiskScore={getBusinessRiskScore}
          businessTrendRange={businessTrendRange}
          setBusinessTrendRange={setBusinessTrendRange}
          businessTrendSeries={businessTrendSeries}
          formatDateLabel={formatDateLabel}
          getDaysRemaining={getDaysRemaining}
          subscriptionEdits={subscriptionEdits}
          setSubscriptionEdits={setSubscriptionEdits}
          updateSubscription={updateSubscription}
          recordSubscriptionPurchase={recordSubscriptionPurchase}
          resetSubscriptionLimits={resetSubscriptionLimits}
          statusEdits={statusEdits}
          setStatusEdits={setStatusEdits}
          updateStatus={updateStatus}
          reviewEdits={reviewEdits}
          setReviewEdits={setReviewEdits}
          incidentSeverityOptions={incidentSeverityOptions}
          updateReview={updateReview}
          supportNotes={supportNotes}
          setSupportNotes={setSupportNotes}
          readOnlyEdits={readOnlyEdits}
          setReadOnlyEdits={setReadOnlyEdits}
          updateReadOnly={updateReadOnly}
          openBusinessActionModal={openBusinessActionModal}
          exportOnExit={exportOnExit}
          deviceRevokeReason={deviceRevokeReason}
          setDeviceRevokeReason={setDeviceRevokeReason}
          loadDevices={loadDevices}
          devicesMap={devicesMap}
          loadingDevices={loadingDevices}
          revokeDevice={revokeDevice}
        />
      </div>

      <PlatformBusinessActionModal
        modal={businessActionModal}
        t={t}
        setModal={setBusinessActionModal}
        actionNeedsPreflight={actionNeedsPreflight}
        executeBusinessActionModal={executeBusinessActionModal}
      />
    </section>
  );
}
