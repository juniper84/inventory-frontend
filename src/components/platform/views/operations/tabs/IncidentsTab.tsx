'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Plus,
  Filter as FilterIcon,
  Send,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { useFormatDate } from '@/lib/business-context';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';
import { useIncidents, type IncidentStatus } from '../hooks/useIncidents';
import { IncidentCard } from '../components/IncidentCard';

type BusinessOption = { value: string; label: string };

export function IncidentsTab() {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const inc = useIncidents();
  const { formatDateTime } = useFormatDate();

  const [showCreate, setShowCreate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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

  const severityOptions = useMemo(
    () => [
      { value: 'LOW', label: t('severityLow') },
      { value: 'MEDIUM', label: t('severityMedium') },
      { value: 'HIGH', label: t('severityHigh') },
      { value: 'CRITICAL', label: t('severityCritical') },
    ],
    [t],
  );

  const STATUS_TABS: { key: 'ALL' | IncidentStatus; label: string }[] = [
    { key: 'ALL', label: t('incidentFilterAll') },
    { key: 'OPEN', label: t('incidentStatus.OPEN') },
    { key: 'INVESTIGATING', label: t('incidentStatus.INVESTIGATING') },
    { key: 'MITIGATED', label: t('incidentStatus.MITIGATED') },
    { key: 'RESOLVED', label: t('incidentStatus.RESOLVED') },
    { key: 'CLOSED', label: t('incidentStatus.CLOSED') },
  ];

  const handleSubmit = async () => {
    setShowConfirm(false);
    const ok = await inc.createIncident();
    if (ok) setShowCreate(false);
  };

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card padding="lg" className="max-w-md w-full nvi-slide-in-bottom">
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)] mb-2">
              {t('incidentConfirmTitle')}
            </h3>
            <p className="text-xs text-[var(--pt-text-2)] mb-4">
              {t('incidentConfirmDescription')}
            </p>
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2 text-[10px] text-[var(--pt-text-2)] space-y-1 mb-4">
              <div>
                <span className="text-[var(--pt-text-muted)]">
                  {t('incidentFormBusinessLabel')}:
                </span>{' '}
                {businessOptions.find((b) => b.value === inc.form.businessId)
                  ?.label ?? inc.form.businessId}
              </div>
              {inc.form.title && (
                <div>
                  <span className="text-[var(--pt-text-muted)]">
                    {t('incidentFormTitleLabel')}:
                  </span>{' '}
                  {inc.form.title}
                </div>
              )}
              <div>
                <span className="text-[var(--pt-text-muted)]">
                  {t('incidentFormSeverityLabel')}:
                </span>{' '}
                {inc.form.severity}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                {t('incidentConfirmCancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={inc.isCreating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50 nvi-press"
              >
                {inc.isCreating ? (
                  <Spinner size="xs" variant="dots" />
                ) : (
                  <Send size={12} />
                )}
                {t('incidentConfirmCreate')}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Create incident — collapsible */}
      <Card padding="md">
        <button
          type="button"
          onClick={() => setShowCreate((s) => !s)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <Plus size={14} className="text-red-400" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
                {t('incidentCreateTitle')}
              </h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">
                {t('incidentCreateHint')}
              </p>
            </div>
          </div>
          <span className="text-[var(--pt-text-muted)]">
            {showCreate ? '−' : '+'}
          </span>
        </button>

        {showCreate && (
          <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3 nvi-slide-in-bottom">
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                  {t('incidentFormBusinessLabel')}
                </label>
                <SmartSelect
                  instanceId="incident-create-business"
                  value={inc.form.businessId}
                  onChange={(value) =>
                    inc.setForm((f) => ({ ...f, businessId: value }))
                  }
                  options={businessOptions}
                  placeholder={t('selectBusinessPlaceholder')}
                />
              </div>
              <div>
                <TextInput
                  label={t('incidentFormTitleLabel')}
                  value={inc.form.title}
                  onChange={(e) =>
                    inc.setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder={t('incidentFormTitlePlaceholder')}
                />
              </div>
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('incidentFormReasonLabel')}
              </label>
              <Textarea
                value={inc.form.reason}
                onChange={(e) =>
                  inc.setForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder={t('incidentFormReasonPlaceholder')}
                rows={2}
              />
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('incidentFormSeverityLabel')}
              </label>
              <SmartSelect
                instanceId="incident-create-severity"
                value={inc.form.severity}
                onChange={(value) =>
                  inc.setForm((f) => ({
                    ...f,
                    severity: value as typeof inc.form.severity,
                  }))
                }
                options={severityOptions}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                {t('incidentFormCancel')}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={
                  !inc.form.businessId ||
                  !inc.form.reason.trim() ||
                  inc.isCreating
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50 nvi-press"
              >
                <Send size={12} />
                {t('incidentFormSubmit')}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Filters */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-2">
          <FilterIcon size={12} className="text-[var(--pt-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('incidentFiltersTitle')}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => {
            const isActive = inc.filters.status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  inc.setFilters((f) => ({ ...f, status: tab.key }));
                  inc.applyFilters();
                }}
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
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('incidentFilterBusiness')}
            </label>
            <SmartSelect
              instanceId="incident-filter-business"
              value={inc.filters.businessId}
              onChange={(value) =>
                inc.setFilters((f) => ({ ...f, businessId: value }))
              }
              options={businessOptions}
              placeholder={t('incidentFilterBusinessPlaceholder')}
              isClearable
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('incidentFilterSeverity')}
            </label>
            <SmartSelect
              instanceId="incident-filter-severity"
              value={inc.filters.severity}
              onChange={(value) =>
                inc.setFilters((f) => ({
                  ...f,
                  severity: value as typeof inc.filters.severity,
                }))
              }
              options={severityOptions}
              placeholder={t('incidentFilterSeverityPlaceholder')}
              isClearable
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={inc.applyFilters}
              className="flex-1 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black nvi-press"
            >
              {t('incidentFilterApply')}
            </button>
            <button
              type="button"
              onClick={inc.resetFilters}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
            >
              {t('incidentFilterReset')}
            </button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {inc.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2 text-[10px] text-red-300">
          {inc.error}
        </div>
      )}

      {/* List */}
      {inc.isLoading ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : inc.incidents.length === 0 ? (
        <EmptyState
          icon={
            <AlertTriangle size={28} className="text-[var(--pt-text-muted)]" />
          }
          title={t('incidentsEmptyTitle')}
          description={t('incidentsEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {inc.incidents.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              locale={locale}
              isTransitioning={inc.transitioningId === incident.id}
              isAddingNote={inc.addingNoteId === incident.id}
              isSavingSeverity={inc.savingSeverityId === incident.id}
              onTransition={(toStatus, reason, note) =>
                inc.transitionIncident(incident.id, toStatus, reason, note)
              }
              onAddNote={(note) => inc.addIncidentNote(incident.id, note)}
              onUpdateSeverity={(severity) =>
                inc.updateSeverity(incident.id, severity)
              }
              formatDateTime={formatDateTime}
              t={(key, values) => t(key, values)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(inc.hasNextPage || inc.hasPrevPage) && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={inc.prevPage}
            disabled={!inc.hasPrevPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('prevPage')}
          </button>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {t('pageLabel', { page: inc.page })}
          </span>
          <button
            type="button"
            onClick={inc.nextPage}
            disabled={!inc.hasNextPage}
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
