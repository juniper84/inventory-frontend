import { useMemo } from 'react';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type AuditInvestigation = {
  actions: { action: string }[];
};

type AnnouncementForm = {
  targetBusinessIds: string[];
  targetTiers: string[];
  targetStatuses: string[];
};

export function usePlatformConsoleOptionSets<TExportJob extends { status: string }>({
  t,
  auditInvestigations,
  exportJobs,
  announcementForm,
}: {
  t: Translate;
  auditInvestigations: AuditInvestigation[];
  exportJobs: TExportJob[];
  announcementForm: AnnouncementForm;
}) {
  const supportScopeOptions = useMemo(
    () => [
      { value: 'business', label: t('supportScopeBusiness') },
      { value: 'users', label: t('supportScopeUsers') },
      { value: 'roles', label: t('supportScopeRoles') },
      { value: 'catalog', label: t('supportScopeCatalog') },
      { value: 'stock', label: t('supportScopeStock') },
      { value: 'transfers', label: t('supportScopeTransfers') },
      { value: 'sales', label: t('supportScopeSales') },
      { value: 'purchases', label: t('supportScopePurchases') },
      { value: 'suppliers', label: t('supportScopeSuppliers') },
      { value: 'reports', label: t('supportScopeReports') },
      { value: 'offline', label: t('supportScopeOffline') },
      { value: 'settings', label: t('supportScopeSettings') },
      { value: 'notifications', label: t('supportScopeNotifications') },
    ],
    [t],
  );

  const supportStatusOptions = useMemo(
    () => [
      { value: '', label: t('allStatuses') },
      { value: 'PENDING', label: t('statusPending') },
      { value: 'APPROVED', label: t('statusApproved') },
      { value: 'REJECTED', label: t('statusRejected') },
      { value: 'EXPIRED', label: t('statusExpired') },
    ],
    [t],
  );

  const supportSeverityOptions = useMemo(
    () => [
      { value: '', label: t('allSeverities') },
      { value: 'LOW', label: t('severityLow') },
      { value: 'MEDIUM', label: t('severityMedium') },
      { value: 'HIGH', label: t('severityHigh') },
      { value: 'CRITICAL', label: t('severityCritical') },
    ],
    [t],
  );

  const supportPriorityOptions = useMemo(
    () => [
      { value: '', label: t('allPriorities') },
      { value: 'LOW', label: t('priorityLow') },
      { value: 'MEDIUM', label: t('priorityMedium') },
      { value: 'HIGH', label: t('priorityHigh') },
      { value: 'URGENT', label: t('priorityUrgent') },
    ],
    [t],
  );

  const incidentSeverityOptions = useMemo(
    () => [
      { value: 'LOW', label: t('severityLow') },
      { value: 'MEDIUM', label: t('severityMedium') },
      { value: 'HIGH', label: t('severityHigh') },
      { value: 'CRITICAL', label: t('severityCritical') },
    ],
    [t],
  );

  const incidentStatusOptions = useMemo(
    () => [
      { value: '', label: t('allStatuses') },
      { value: 'OPEN', label: t('incidentStatusOpen') },
      { value: 'INVESTIGATING', label: t('incidentStatusInvestigating') },
      { value: 'MITIGATED', label: t('incidentStatusMitigated') },
      { value: 'RESOLVED', label: t('incidentStatusResolved') },
      { value: 'CLOSED', label: t('incidentStatusClosed') },
    ],
    [t],
  );

  const exportLaneDefs = useMemo(
    () => [
      { key: 'PENDING', label: t('statusPending') },
      { key: 'RUNNING', label: t('statusRunning') },
      { key: 'FAILED', label: t('statusFailed') },
      { key: 'COMPLETED', label: t('statusCompleted') },
      { key: 'CANCELED', label: t('statusCanceled') },
    ],
    [t],
  );

  const exportLaneJobs = useMemo(() => {
    const lanes: Record<string, TExportJob[]> = {
      PENDING: [],
      RUNNING: [],
      FAILED: [],
      COMPLETED: [],
      CANCELED: [],
    };
    exportJobs.forEach((job) => {
      const key = lanes[job.status] ? job.status : 'PENDING';
      lanes[key].push(job);
    });
    return lanes;
  }, [exportJobs]);

  const announcementTierOptions = useMemo(
    () => [
      { value: 'STARTER', label: t('tierStarter') },
      { value: 'BUSINESS', label: t('tierBusiness') },
      { value: 'ENTERPRISE', label: t('tierEnterprise') },
    ],
    [t],
  );

  const announcementStatusOptions = useMemo(
    () => [
      { value: 'TRIAL', label: t('statusTrial') },
      { value: 'ACTIVE', label: t('statusActive') },
      { value: 'GRACE', label: t('statusGrace') },
      { value: 'EXPIRED', label: t('statusExpired') },
      { value: 'SUSPENDED', label: t('statusSuspended') },
    ],
    [t],
  );

  const announcementTargetSignature = useMemo(
    () =>
      JSON.stringify({
        targetBusinessIds: [...announcementForm.targetBusinessIds].sort(),
        targetTiers: [...announcementForm.targetTiers].sort(),
        targetStatuses: [...announcementForm.targetStatuses].sort(),
      }),
    [
      announcementForm.targetBusinessIds,
      announcementForm.targetTiers,
      announcementForm.targetStatuses,
    ],
  );

  const auditActionOptions = useMemo(() => {
    const unique = new Map<string, string>();
    auditInvestigations.forEach((group) => {
      group.actions.forEach((entry) => {
        if (entry.action) {
          unique.set(entry.action, entry.action);
        }
      });
    });
    return Array.from(unique.values()).map((action) => ({
      id: action,
      label: action,
    }));
  }, [auditInvestigations]);

  return {
    supportScopeOptions,
    supportStatusOptions,
    supportSeverityOptions,
    supportPriorityOptions,
    incidentSeverityOptions,
    incidentStatusOptions,
    exportLaneDefs,
    exportLaneJobs,
    announcementTierOptions,
    announcementStatusOptions,
    announcementTargetSignature,
    auditActionOptions,
  };
}
