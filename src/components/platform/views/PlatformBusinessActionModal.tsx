import type { Dispatch, SetStateAction } from 'react';

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

export function PlatformBusinessActionModal({
  modal,
  t,
  setModal,
  actionNeedsPreflight,
  executeBusinessActionModal,
}: {
  modal: BusinessActionModalState | null;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  setModal: Dispatch<SetStateAction<BusinessActionModalState | null>>;
  actionNeedsPreflight: (action: BusinessActionModalState['action']) => boolean;
  executeBusinessActionModal: () => Promise<void>;
}) {
  if (!modal) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 p-4">
      <div className="w-full max-w-lg rounded border border-gold-700/60 bg-[#080b10] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-lg font-semibold text-gold-100">
            {t('actionGuardTitle', { action: modal.action })}
          </h4>
          <button
            type="button"
            onClick={() => setModal(null)}
            className="rounded border border-gold-700/60 px-2 py-1 text-xs text-gold-100"
          >
            {t('closeDetails')}
          </button>
        </div>

        {modal.step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-gold-300">{t('actionGuardReviewImpact')}</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-gold-400">
              <li>{t('actionGuardBusinessLine', { value: modal.businessId })}</li>
              <li>{t('actionGuardActionLine', { value: modal.action })}</li>
              <li>{t('actionGuardImmediateEffect')}</li>
            </ul>
            {modal.preflightLoading ? (
              <p className="inline-flex items-center gap-2 text-xs text-gold-300">
                {t('loadingBusinessPreflight')}
              </p>
            ) : null}
            {modal.preflightError ? <p className="text-xs text-red-300">{modal.preflightError}</p> : null}
            {modal.preflight ? (
              <div className="rounded border border-gold-700/40 bg-black/30 p-3 text-xs text-gold-300">
                <p className="text-gold-100">{t('actionGuardPreflightImpact')}</p>
                <p>{t('actionGuardImpactUsers', { value: modal.preflight.impact.users })}</p>
                <p>
                  {t('actionGuardImpactExports', {
                    value: modal.preflight.impact.pendingExports,
                  })}
                </p>
                <p>
                  {t('actionGuardImpactDevices', {
                    value: modal.preflight.impact.activeDevices,
                  })}
                </p>
                <p>
                  {t('actionGuardImpactOffline', {
                    value: modal.preflight.impact.failedOfflineActions,
                  })}
                </p>
                <div className="mt-2 space-y-1">
                  {modal.preflight.preconditions.map((check) => (
                    <p
                      key={check.code}
                      className={check.ok ? 'text-emerald-300' : 'text-amber-200'}
                    >
                      {check.ok ? 'OK' : 'BLOCK'} • {check.message}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {modal.step >= 2 ? (
          <div className="space-y-3">
            <label className="block text-xs uppercase tracking-[0.2em] text-gold-400">
              {t('reasonRequiredLabel')}
            </label>
            <textarea
              value={modal.reason}
              onChange={(event) =>
                setModal((prev) => (prev ? { ...prev, reason: event.target.value } : prev))
              }
              className="min-h-[90px] w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
              placeholder={t('actionReasonPlaceholder')}
            />
          </div>
        ) : null}

        {modal.step === 3 && modal.action === 'PURGE' ? (
          <div className="mt-3 grid gap-2">
            <input
              value={modal.confirmBusinessId}
              onChange={(event) =>
                setModal((prev) =>
                  prev ? { ...prev, confirmBusinessId: event.target.value } : prev,
                )
              }
              placeholder={t('purgeBusinessIdPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <input
              value={modal.confirmText}
              onChange={(event) =>
                setModal((prev) =>
                  prev ? { ...prev, confirmText: event.target.value } : prev,
                )
              }
              placeholder={t('purgeConfirmPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setModal((prev) =>
                prev ? { ...prev, step: (Math.max(1, prev.step - 1) as 1 | 2 | 3) } : prev,
              )
            }
            disabled={modal.step === 1}
            className="rounded border border-gold-700/60 px-3 py-1 text-xs text-gold-100 disabled:opacity-50"
          >
            {t('backToRegistryAction')}
          </button>
          {modal.step < 3 ? (
            <button
              type="button"
              disabled={
                modal.step === 1 &&
                actionNeedsPreflight(modal.action) &&
                (modal.preflightLoading || !modal.preflight?.ready)
              }
              onClick={() =>
                setModal((prev) =>
                  prev ? { ...prev, step: (Math.min(3, prev.step + 1) as 1 | 2 | 3) } : prev,
                )
              }
              className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('nextAction')}
            </button>
          ) : (
            <button
              type="button"
              onClick={executeBusinessActionModal}
              className="rounded border border-red-500/60 px-3 py-1 text-xs text-red-200"
            >
              {t('confirmAction', { action: modal.action })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
