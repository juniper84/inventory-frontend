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
  Sparkles,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { useSupportRequests } from '../hooks/useSupportRequests';
import { RequestCard } from '../components/RequestCard';
import { apiFetch } from '@/lib/api';
import { getPlatformAccessToken } from '@/lib/auth';

type BusinessOption = { value: string; label: string };

export function SupportRequestsTab() {
  const t = useTranslations('platformConsole');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const reqs = useSupportRequests();

  const [showCreate, setShowCreate] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [businessOptions, setBusinessOptions] = useState<BusinessOption[]>([]);
  const [tokenCopied, setTokenCopied] = useState(false);

  // Load businesses for SmartSelect
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

  const priorityOptions = useMemo(
    () => [
      { value: 'LOW', label: t('priorityLow') },
      { value: 'MEDIUM', label: t('priorityMedium') },
      { value: 'HIGH', label: t('priorityHigh') },
      { value: 'URGENT', label: t('priorityUrgent') },
    ],
    [t],
  );

  const STATUS_TABS: {
    key: 'ALL' | 'PENDING' | 'APPROVED' | 'EXPIRED' | 'REJECTED';
    label: string;
  }[] = [
    { key: 'ALL', label: t('requestStatusAll') },
    { key: 'PENDING', label: t('requestStatusPending') },
    { key: 'APPROVED', label: t('requestStatusApproved') },
    { key: 'EXPIRED', label: t('requestStatusExpired') },
    { key: 'REJECTED', label: t('requestStatusRejected') },
  ];

  const handleSubmit = async () => {
    setShowConfirm(false);
    const ok = await reqs.createRequest();
    if (ok) setShowCreate(false);
  };

  const copyToken = async () => {
    if (!reqs.pendingLogin) return;
    try {
      await navigator.clipboard.writeText(reqs.pendingLogin.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Pending login modal */}
      {reqs.pendingLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card padding="lg" className="max-w-lg w-full nvi-slide-in-bottom">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15">
                  <Sparkles size={14} className="text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
                  {t('pendingLoginTitle')}
                </h3>
              </div>
              <button
                type="button"
                onClick={reqs.clearPendingLogin}
                className="text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-[var(--pt-text-2)] mb-3">
              {t('pendingLoginDescription')}
            </p>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2 mb-3">
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('pendingLoginToken')}
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono text-[var(--pt-text-1)] truncate">
                  {reqs.pendingLogin.token.slice(0, 20)}…
                </span>
                <button
                  type="button"
                  onClick={copyToken}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)] nvi-press"
                >
                  {tokenCopied ? <Check size={11} /> : <Copy size={11} />}
                  {tokenCopied ? t('pendingLoginCopied') : t('pendingLoginCopy')}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={reqs.clearPendingLogin}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                {t('pendingLoginClose')}
              </button>
              <button
                type="button"
                onClick={() => reqs.loginAsSupport(locale)}
                disabled={reqs.isLoggingIn}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50 nvi-press"
              >
                {reqs.isLoggingIn ? (
                  <Spinner size="xs" variant="dots" />
                ) : (
                  <Sparkles size={12} />
                )}
                {t('pendingLoginOpen')}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Create request — collapsible */}
      <Card padding="md">
        <button
          type="button"
          onClick={() => setShowCreate((s) => !s)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pt-accent)]/10">
              <Plus size={14} className="text-[var(--pt-accent)]" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">
                {t('newSupportRequestTitle')}
              </h3>
              <p className="text-[10px] text-[var(--pt-text-muted)]">
                {t('newSupportRequestHint')}
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
                  {t('newRequestBusinessLabel')}
                </label>
                <SmartSelect
                  instanceId="support-create-business"
                  value={reqs.form.businessId}
                  onChange={(value) =>
                    reqs.setForm((f) => ({ ...f, businessId: value }))
                  }
                  options={businessOptions}
                  placeholder={t('selectBusinessPlaceholder')}
                />
              </div>
              <div>
                <TextInput
                  label={t('newRequestDurationLabel')}
                  type="number"
                  min={1}
                  max={24}
                  value={reqs.form.durationHours}
                  onChange={(e) =>
                    reqs.setForm((f) => ({
                      ...f,
                      durationHours: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                {t('newRequestReasonLabel')}
              </label>
              <Textarea
                value={reqs.form.reason}
                onChange={(e) =>
                  reqs.setForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder={t('newRequestReasonPlaceholder')}
                rows={2}
              />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                  {t('newRequestSeverityLabel')}
                </label>
                <SmartSelect
                  instanceId="support-create-severity"
                  value={reqs.form.severity}
                  onChange={(value) =>
                    reqs.setForm((f) => ({
                      ...f,
                      severity: value as typeof reqs.form.severity,
                    }))
                  }
                  options={severityOptions}
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)]">
                  {t('newRequestPriorityLabel')}
                </label>
                <SmartSelect
                  instanceId="support-create-priority"
                  value={reqs.form.priority}
                  onChange={(value) =>
                    reqs.setForm((f) => ({
                      ...f,
                      priority: value as typeof reqs.form.priority,
                    }))
                  }
                  options={priorityOptions}
                />
              </div>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-[var(--pt-text-muted)] mb-1">
                {t('newRequestScopeLabel')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {reqs.scopeOptions.map((scope) => {
                  const checked = reqs.form.scope.includes(scope);
                  return (
                    <button
                      key={scope}
                      type="button"
                      onClick={() =>
                        reqs.setForm((f) => ({
                          ...f,
                          scope: checked
                            ? f.scope.filter((s) => s !== scope)
                            : [...f.scope, scope],
                        }))
                      }
                      className={`rounded-md border px-2 py-1 text-[10px] font-medium transition nvi-press ${
                        checked
                          ? 'border-[var(--pt-accent)] bg-[var(--pt-accent)]/15 text-[var(--pt-accent)]'
                          : 'border-white/[0.06] bg-white/[0.02] text-[var(--pt-text-2)] hover:border-white/[0.12]'
                      }`}
                    >
                      {scope}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                {t('newRequestCancel')}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirm(true)}
                disabled={
                  !reqs.form.businessId ||
                  !reqs.form.reason.trim() ||
                  reqs.isCreating
                }
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50 nvi-press"
              >
                <Send size={12} />
                {t('newRequestSubmit')}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Confirm submission modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card padding="lg" className="max-w-md w-full nvi-slide-in-bottom">
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)] mb-2">
              {t('confirmRequestTitle')}
            </h3>
            <p className="text-xs text-[var(--pt-text-2)] mb-4">
              {t('confirmRequestDescription')}
            </p>
            <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2 text-[10px] text-[var(--pt-text-2)] space-y-1 mb-4">
              <div>
                <span className="text-[var(--pt-text-muted)]">
                  {t('confirmRequestBusiness')}:
                </span>{' '}
                {businessOptions.find((b) => b.value === reqs.form.businessId)
                  ?.label ?? reqs.form.businessId}
              </div>
              <div>
                <span className="text-[var(--pt-text-muted)]">
                  {t('confirmRequestDuration')}:
                </span>{' '}
                {reqs.form.durationHours}h
              </div>
              <div>
                <span className="text-[var(--pt-text-muted)]">
                  {t('confirmRequestSeverity')}:
                </span>{' '}
                {reqs.form.severity}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-[var(--pt-text-muted)] hover:text-[var(--pt-text-1)]"
              >
                {t('confirmRequestCancel')}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={reqs.isCreating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50 nvi-press"
              >
                {reqs.isCreating ? (
                  <Spinner size="xs" variant="dots" />
                ) : (
                  <Send size={12} />
                )}
                {t('confirmRequestConfirm')}
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-2">
          <FilterIcon size={12} className="text-[var(--pt-text-muted)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--pt-text-2)]">
            {t('requestFiltersTitle')}
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => {
            const isActive = reqs.filters.status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  reqs.setFilters((f) => ({ ...f, status: tab.key }));
                  reqs.applyFilters();
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
              {t('requestFilterBusiness')}
            </label>
            <SmartSelect
              instanceId="support-filter-business"
              value={reqs.filters.businessId}
              onChange={(value) =>
                reqs.setFilters((f) => ({ ...f, businessId: value }))
              }
              options={businessOptions}
              placeholder={t('requestFilterBusinessPlaceholder')}
              isClearable
            />
          </div>
          <div>
            <label className="text-[9px] text-[var(--pt-text-muted)]">
              {t('requestFilterSeverity')}
            </label>
            <SmartSelect
              instanceId="support-filter-severity"
              value={reqs.filters.severity}
              onChange={(value) =>
                reqs.setFilters((f) => ({ ...f, severity: value }))
              }
              options={severityOptions}
              placeholder={t('requestFilterSeverityPlaceholder')}
              isClearable
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              onClick={reqs.applyFilters}
              className="flex-1 rounded-lg bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black nvi-press"
            >
              {t('requestFilterApply')}
            </button>
            <button
              type="button"
              onClick={reqs.resetFilters}
              className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[10px] text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)] nvi-press"
            >
              {t('requestFilterReset')}
            </button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {reqs.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2 text-[10px] text-red-300">
          {reqs.error}
        </div>
      )}

      {/* List */}
      {reqs.isLoading ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]"
            />
          ))}
        </div>
      ) : reqs.requests.length === 0 ? (
        <EmptyState
          icon={<FilterIcon size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('requestsEmptyTitle')}
          description={t('requestsEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {reqs.requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              locale={locale}
              isActivating={reqs.activatingId === request.id}
              onActivate={() => reqs.activateRequest(request.id)}
              t={(key, values) => t(key, values)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {(reqs.hasNextPage || reqs.hasPrevPage) && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={reqs.prevPage}
            disabled={!reqs.hasPrevPage}
            className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1 text-[10px] text-[var(--pt-text-2)] disabled:opacity-30 nvi-press"
          >
            <ChevronLeft size={11} />
            {t('prevPage')}
          </button>
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {t('pageLabel', { page: reqs.page })}
          </span>
          <button
            type="button"
            onClick={reqs.nextPage}
            disabled={!reqs.hasNextPage}
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
