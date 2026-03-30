import type { Dispatch, SetStateAction } from 'react';
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
  systemOwner?: { name: string; email: string; phone: string | null } | null;
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

type BusinessStatusFilter = 'ACTIVE' | 'UNDER_REVIEW' | 'SUSPENDED' | 'ARCHIVED' | 'DELETED';

type WorkspaceTab =
  | 'OVERVIEW'
  | 'MANAGE'
  | 'NOTES'
  | 'DEVICES'
  | 'ACTIONS';

type BusinessNote = {
  id: string;
  body: string;
  createdAt: string;
  platformAdmin: { id: string; email: string };
};

type ScheduledAction = {
  id: string;
  actionType: string;
  payload: Record<string, unknown>;
  scheduledFor: string;
  createdAt: string;
  platformAdmin: { id: string; email: string };
};

type SubscriptionEdit = {
  tier: string;
  status: string;
  reason: string;
  startsAt?: string;
  trialEndsAt: string;
  graceEndsAt: string;
  expiresAt: string;
  months?: string;
  isPaid?: boolean;
  amountDue?: string;
};

type PurchaseHistoryItem = {
  id: string;
  tier: string;
  months: number;
  durationDays: number;
  startsAt: string;
  expiresAt: string;
  isPaid: boolean;
  amountDue: number;
  reason: string;
  createdAt: string;
  platformAdmin: { id: string; email: string };
};

type ReadOnlyEdit = { enabled: boolean; reason: string };
type StatusEdit = { status: string; reason: string };
type ReviewEdit = { underReview: boolean; reason: string; severity: string };

type TrendPoint = { label: string; offlineFailed: number; exportsPending: number };
type Device = { id: string; deviceName?: string | null; status: string };

type OnboardingResult = {
  businessId: string;
  milestones: { branches: boolean; products: boolean; sales: boolean; users: boolean; settings: boolean };
  completedCount: number;
  totalCount: number;
  percentComplete: number;
  generatedAt: string;
};

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
  totalBusinesses,
  businessPage,
  hasNextBusinessPage,
  onBusinessNextPage,
  onBusinessPrevPage,
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
  purchaseHistory,
  loadingPurchaseHistory,
  loadPurchaseHistory,
  statusEdits,
  setStatusEdits,
  updateStatus,
  saveStatusAndAccess,
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
  businessOnboarding,
  loadingOnboarding,
  loadBusinessOnboarding,
  businessNotes,
  loadingNotes,
  noteInput,
  setNoteInput,
  loadBusinessNotes,
  createBusinessNote,
  deleteBusinessNote,
  scheduledActions,
  loadingScheduledActions,
  scheduledActionForm,
  setScheduledActionForm,
  createScheduledAction,
  cancelScheduledAction,
  platformAdminId,
}: {
  show: boolean;
  showBusinessDetailPage: boolean;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  locale: string;
  withAction: (key: string, task: () => void | Promise<void>) => Promise<void>;
  actionLoading: Record<string, boolean>;
  loadBusinesses: (cursor?: string) => Promise<void>;
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
  totalBusinesses: number | null;
  businessPage: number;
  hasNextBusinessPage: boolean;
  onBusinessNextPage: () => Promise<void>;
  onBusinessPrevPage: () => Promise<void>;
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
  purchaseHistory: Record<string, PurchaseHistoryItem[]>;
  loadingPurchaseHistory: Record<string, boolean>;
  loadPurchaseHistory: (businessId: string) => Promise<void>;
  statusEdits: Record<string, StatusEdit>;
  setStatusEdits: Dispatch<SetStateAction<Record<string, StatusEdit>>>;
  updateStatus: (businessId: string) => Promise<void>;
  saveStatusAndAccess: (businessId: string) => Promise<void>;
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
  businessOnboarding: Record<string, OnboardingResult>;
  loadingOnboarding: Record<string, boolean>;
  loadBusinessOnboarding: (businessId: string) => Promise<void>;
  businessNotes: Record<string, BusinessNote[]>;
  loadingNotes: Record<string, boolean>;
  noteInput: Record<string, string>;
  setNoteInput: Dispatch<SetStateAction<Record<string, string>>>;
  loadBusinessNotes: (businessId: string) => Promise<void>;
  createBusinessNote: (businessId: string) => Promise<void>;
  deleteBusinessNote: (noteId: string, businessId: string) => Promise<void>;
  scheduledActions: Record<string, ScheduledAction[]>;
  loadingScheduledActions: Record<string, boolean>;
  scheduledActionForm: Record<string, { actionType: string; payload: Record<string, unknown>; scheduledFor: string }>;
  setScheduledActionForm: Dispatch<SetStateAction<Record<string, { actionType: string; payload: Record<string, unknown>; scheduledFor: string }>>>;
  createScheduledAction: (businessId: string) => Promise<void>;
  cancelScheduledAction: (actionId: string, businessId: string) => Promise<void>;
  platformAdminId: string;
}) {
  if (!show) {
    return null;
  }

  return (
    <section className="command-card p-6 space-y-5 nvi-reveal">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--pt-text-2)]">
          {showBusinessDetailPage ? t('businessWorkspaceTag') : t('businessCommandCenterTag')}
        </p>
        <h3 className="text-xl font-semibold text-[color:var(--pt-text-1)]">
          {showBusinessDetailPage
            ? openedBusiness?.name ?? t('businessRegistryTitle')
            : t('businessRegistryTitle')}
        </h3>
      </div>

      <div className={`grid gap-4 ${showBusinessDetailPage ? 'grid-cols-1' : 'xl:grid-cols-1'}`}>
        <PlatformBusinessRegistryPanel
          show={!showBusinessDetailPage}
          t={t}
          locale={locale}
          withAction={withAction}
          actionLoading={actionLoading}
          loadBusinesses={loadBusinesses}
          businessSearch={businessSearch}
          setBusinessSearch={setBusinessSearch}
          businessStatusFilter={businessStatusFilter}
          setBusinessStatusFilter={setBusinessStatusFilter}
          filteredBusinesses={filteredBusinesses}
          businesses={businesses}
          getBusinessRiskScore={getBusinessRiskScore}
          pinnedBusinessIds={pinnedBusinessIds}
          togglePinnedBusiness={togglePinnedBusiness}
          updateReview={updateReview}
          totalBusinesses={totalBusinesses}
          businessPage={businessPage}
          hasNextBusinessPage={hasNextBusinessPage}
          onBusinessNextPage={onBusinessNextPage}
          onBusinessPrevPage={onBusinessPrevPage}
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
          purchaseHistory={purchaseHistory}
          loadingPurchaseHistory={loadingPurchaseHistory}
          loadPurchaseHistory={loadPurchaseHistory}
          statusEdits={statusEdits}
          setStatusEdits={setStatusEdits}
          updateStatus={updateStatus}
          saveStatusAndAccess={saveStatusAndAccess}
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
          businessOnboarding={businessOnboarding}
          loadingOnboarding={loadingOnboarding}
          loadBusinessOnboarding={loadBusinessOnboarding}
          businessNotes={businessNotes}
          loadingNotes={loadingNotes}
          noteInput={noteInput}
          setNoteInput={setNoteInput}
          loadBusinessNotes={loadBusinessNotes}
          createBusinessNote={createBusinessNote}
          deleteBusinessNote={deleteBusinessNote}
          scheduledActions={scheduledActions}
          loadingScheduledActions={loadingScheduledActions}
          scheduledActionForm={scheduledActionForm}
          setScheduledActionForm={setScheduledActionForm}
          createScheduledAction={createScheduledAction}
          cancelScheduledAction={cancelScheduledAction}
          platformAdminId={platformAdminId}
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
