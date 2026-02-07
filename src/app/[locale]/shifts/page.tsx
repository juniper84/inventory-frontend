'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type Branch = { id: string; name: string };
type Shift = {
  id: string;
  branchId: string;
  openedAt: string;
  openingCash: number | string;
  status: 'OPEN' | 'CLOSED';
  closedAt?: string | null;
  closingCash?: number | string | null;
  variance?: number | string | null;
};

type ShiftCloseResponse = {
  approvalRequired?: boolean;
};

export default function ShiftsPage() {
  const t = useTranslations('shiftsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canOpen = permissions.has('shifts.open');
  const canClose = permissions.has('shifts.close');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [message, setMessage] = useToastState();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState({
    branchId: '',
    openingCash: '',
    notes: '',
  });
  const { activeBranch, resolveBranchId } = useBranchScope();
  const effectiveOpenBranchId = resolveBranchId(openForm.branchId) || '';
  const [closeForm, setCloseForm] = useState({
    shiftId: '',
    closingCash: '',
    varianceReason: '',
  });
  const openCount = shifts.filter((shift) => shift.status === 'OPEN').length;
  const closedCount = shifts.filter((shift) => shift.status === 'CLOSED').length;

  const load = async (cursor?: string, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    const token = getAccessToken();
    if (!token) {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
      return;
    }
    try {
      const query = buildCursorQuery({ limit: 20, cursor });
      const [branchData, shiftData] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
          token,
        }),
        apiFetch<PaginatedResponse<Shift> | Shift[]>(`/shifts${query}`, {
          token,
        }),
      ]);
      setBranches(normalizePaginated(branchData).items);
      const shiftResult = normalizePaginated(shiftData);
      setShifts((prev) =>
        append ? [...prev, ...shiftResult.items] : shiftResult.items,
      );
      setNextCursor(shiftResult.nextCursor);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (activeBranch?.id && !openForm.branchId) {
      setOpenForm((prev) => ({ ...prev, branchId: activeBranch.id }));
    }
  }, [activeBranch?.id, openForm.branchId]);

  const openShift = async () => {
    const token = getAccessToken();
    if (!token || !effectiveOpenBranchId || !openForm.openingCash) {
      return;
    }
    setMessage(null);
    setIsOpening(true);
    try {
      await apiFetch('/shifts/open', {
        token,
        method: 'POST',
        body: JSON.stringify({
          branchId: effectiveOpenBranchId,
          openingCash: Number(openForm.openingCash),
          notes: openForm.notes || undefined,
        }),
      });
      setOpenForm({ branchId: '', openingCash: '', notes: '' });
      setMessage({ action: 'create', outcome: 'success', message: t('opened') });
      await load();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('openFailed')),
      });
    } finally {
      setIsOpening(false);
    }
  };

  const closeShift = async () => {
    const token = getAccessToken();
    if (!token || !closeForm.shiftId || !closeForm.closingCash) {
      return;
    }
    setMessage(null);
    setIsClosing(true);
    try {
      const response = await apiFetch<ShiftCloseResponse>(
        `/shifts/${closeForm.shiftId}/close`,
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            closingCash: Number(closeForm.closingCash),
            varianceReason: closeForm.varianceReason || undefined,
          }),
        },
      );
      if (response?.approvalRequired) {
        setMessage({ action: 'save', outcome: 'info', message: t('varianceApproval') });
        setIsClosing(false);
        return;
      }
      setCloseForm({ shiftId: '', closingCash: '', varianceReason: '' });
      setMessage({ action: 'update', outcome: 'success', message: t('closed') });
      await load();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('closeFailed')),
      });
    } finally {
      setIsClosing(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow="Shift control"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">Cash desk</span>
            <span className="status-chip">Live</span>
          </>
        }
      />
      {message ? <StatusBanner message={message} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Shift records</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{shifts.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Open</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{openCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Closed</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{closedCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Branches</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{branches.length}</p>
        </article>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('openTitle')}</h3>
          <SmartSelect
            value={openForm.branchId}
            onChange={(value) =>
              setOpenForm({ ...openForm, branchId: value })
            }
            placeholder={t('selectBranch')}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
          />
          <input
            value={openForm.openingCash}
            onChange={(event) =>
              setOpenForm({ ...openForm, openingCash: event.target.value })
            }
            type="number"
            placeholder={t('openingCash')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={openForm.notes}
            onChange={(event) =>
              setOpenForm({ ...openForm, notes: event.target.value })
            }
            placeholder={t('notesOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="button"
            onClick={openShift}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isOpening || !canOpen}
            title={!canOpen ? noAccess('title') : undefined}
          >
            {isOpening ? <Spinner size="xs" variant="orbit" /> : null}
            {isOpening ? t('opening') : t('openAction')}
          </button>
        </div>

        <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('closeTitle')}</h3>
          <SmartSelect
            value={closeForm.shiftId}
            onChange={(value) =>
              setCloseForm({ ...closeForm, shiftId: value })
            }
            placeholder={t('selectOpenShift')}
            options={shifts
              .filter((shift) => shift.status === 'OPEN')
              .map((shift) => ({
                value: shift.id,
                label: `${
                  branches.find((branch) => branch.id === shift.branchId)?.name ??
                  t('branchFallback')
                } · ${new Date(shift.openedAt).toLocaleString()}`,
              }))}
          />
          <input
            value={closeForm.closingCash}
            onChange={(event) =>
              setCloseForm({ ...closeForm, closingCash: event.target.value })
            }
            type="number"
            placeholder={t('closingCash')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={closeForm.varianceReason}
            onChange={(event) =>
              setCloseForm({ ...closeForm, varianceReason: event.target.value })
            }
            placeholder={t('varianceReasonOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="button"
            onClick={closeShift}
            className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isClosing || !canClose}
            title={!canClose ? noAccess('title') : undefined}
          >
            {isClosing ? <Spinner size="xs" variant="pulse" /> : null}
            {isClosing ? t('closing') : t('closeAction')}
          </button>
        </div>
      </div>

      <div className="command-card nvi-panel p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('historyTitle')}</h3>
        {shifts.length === 0 ? (
          <StatusBanner message={t('noShifts')} />
        ) : (
          shifts.map((shift) => (
            <div
              key={shift.id}
              className="rounded border border-gold-700/30 bg-black/40 p-3 text-sm text-gold-200"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-gold-100">
                    {branches.find((branch) => branch.id === shift.branchId)?.name ??
                      shift.branchId}
                  </p>
                  <p className="text-xs text-gold-400">
                    {t('openedAt', {
                      value: new Date(shift.openedAt).toLocaleString(),
                    })}
                  </p>
                </div>
                <span
                  className={
                    shift.status === 'OPEN' ? 'text-green-400' : 'text-gold-400'
                  }
                >
                  {shift.status}
                </span>
              </div>
              <p className="text-xs text-gold-400">
                {t('openingCashLabel', { value: shift.openingCash })}
              </p>
              {shift.status === 'CLOSED' ? (
                <p className="text-xs text-gold-400">
                  {t('closingCashLabel', {
                    value: shift.closingCash ?? '',
                    variance: shift.variance ?? 0,
                  })}
                </p>
              ) : null}
            </div>
          ))
        )}
        {nextCursor ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => load(nextCursor, true)}
              className="inline-flex items-center gap-2 rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isLoadingMore}
            >
              {isLoadingMore ? <Spinner size="xs" variant="grid" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
