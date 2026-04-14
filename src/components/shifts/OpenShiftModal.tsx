'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';

type Branch = { id: string; name: string };
type FormState = { branchId: string; openingCash: string; notes: string };

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  branches: Branch[];

  onSubmit: () => void;
  isOpening: boolean;
  canOpen: boolean;
};

export function OpenShiftModal({
  open,
  onClose,
  form,
  onFormChange,
  branches,
  onSubmit,
  isOpening,
  canOpen,
}: Props) {
  const t = useTranslations('shiftsPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="shift-open-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
              <Icon name="Play" size={14} className="text-emerald-400" />
            </span>
            <h2
              id="shift-open-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('openTitle')}
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
        <div className="border-l-2 border-l-emerald-400 pl-4 space-y-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10">
              <Icon name="Play" size={12} className="text-emerald-400" />
            </span>
            {t('sectionStartShift')}
          </p>
          <SmartSelect
            instanceId="shift-open-branch"
            value={form.branchId}
            onChange={(value) => onFormChange({ ...form, branchId: value })}
            placeholder={t('selectBranch')}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            className="nvi-select-container"
          />
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
              {t('openingCash')}
            </label>
            <CurrencyInput
              value={form.openingCash}
              onChange={(value) => onFormChange({ ...form, openingCash: value })}
              placeholder={t('openingCash')}
              className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
            />
          </div>
          <TextInput
            label={t('notesOptional')}
            value={form.notes}
            onChange={(event) => onFormChange({ ...form, notes: event.target.value })}
            placeholder={t('notesOptional')}
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
            disabled={isOpening || !canOpen}
            title={!canOpen ? noAccess('title') : undefined}
          >
            {isOpening ? <Spinner size="xs" variant="orbit" /> : <Icon name="Play" size={14} />}
            {isOpening ? t('opening') : t('openAction')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
