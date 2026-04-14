'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';
import { useFormatDate } from '@/lib/business-context';

type Branch = { id: string; name: string };
type Shift = { id: string; branchId: string; openedAt: string };
type FormState = { shiftId: string; closingCash: string; varianceReason: string };

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  openShifts: Shift[];
  branches: Branch[];

  onSubmit: () => void;
  isClosing: boolean;
  canClose: boolean;
};

export function CloseShiftModal({
  open,
  onClose,
  form,
  onFormChange,
  openShifts,
  branches,
  onSubmit,
  isClosing,
  canClose,
}: Props) {
  const t = useTranslations('shiftsPage');
  const noAccess = useTranslations('noAccess');
  const { formatDateTime } = useFormatDate();

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="shift-close-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
              <Icon name="Square" size={14} className="text-red-400" />
            </span>
            <h2
              id="shift-close-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('closeTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="nvi-press rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[color:var(--muted)]"
            aria-label="Close"
          >
            <Icon name="X" size={14} />
          </button>
        </div>
      </div>

      <div className="nvi-modal-panel__body space-y-4">
        <div className="border-l-2 border-l-red-400 pl-4 space-y-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/10">
              <Icon name="Square" size={12} className="text-red-400" />
            </span>
            {t('sectionEndShift')}
          </p>
          <SmartSelect
            instanceId="shift-close-select"
            value={form.shiftId}
            onChange={(value) => onFormChange({ ...form, shiftId: value })}
            placeholder={t('selectOpenShift')}
            options={openShifts.map((shift) => ({
              value: shift.id,
              label: `${
                branches.find((branch) => branch.id === shift.branchId)?.name ??
                t('branchFallback')
              } · ${formatDateTime(shift.openedAt)}`,
            }))}
            className="nvi-select-container"
          />
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
              {t('closingCash')}
            </label>
            <CurrencyInput
              value={form.closingCash}
              onChange={(value) => onFormChange({ ...form, closingCash: value })}
              placeholder={t('closingCash')}
              className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
            />
          </div>
          <TextInput
            label={t('varianceReasonOptional')}
            value={form.varianceReason}
            onChange={(event) => onFormChange({ ...form, varianceReason: event.target.value })}
            placeholder={t('varianceReasonOptional')}
          />
        </div>
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-xs text-[color:var(--muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="nvi-press inline-flex items-center gap-2 rounded-xl bg-[var(--nvi-accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isClosing || !canClose}
            title={!canClose ? noAccess('title') : undefined}
          >
            {isClosing ? <Spinner size="xs" variant="pulse" /> : <Icon name="Square" size={14} />}
            {isClosing ? t('closing') : t('closeAction')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
