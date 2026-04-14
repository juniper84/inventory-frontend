'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';

type Branch = { id: string; name: string };
type FormState = {
  branchId: string;
  category: string;
  title: string;
  amount: string;
  currency: string;
  note: string;
  receiptRef: string;
  expenseDate: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  branches: Branch[];
  categories: { value: string; label: string }[];

  onSubmit: () => void;
  isSubmitting: boolean;
  canWrite: boolean;
};

export function ExpenseCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  branches,
  categories,
  onSubmit,
  isSubmitting,
  canWrite,
}: Props) {
  const t = useTranslations('expensesPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="expense-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Receipt" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="expense-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createExpense')}
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
        {/* Details */}
        <div className="border-l-2 border-l-blue-400 pl-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-400">
            <Icon name="Receipt" size={14} />
            {t('sectionDetails')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SmartSelect
              instanceId="expenses-form-branch"
              value={form.branchId}
              onChange={(value) => onFormChange({ ...form, branchId: value })}
              options={branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
              placeholder={t('branch')}
              isClearable
              className="nvi-select-container"
            />
            <SmartSelect
              instanceId="expenses-form-category"
              value={form.category}
              onChange={(value) =>
                onFormChange({ ...form, category: value || 'GENERAL' })
              }
              options={categories}
              placeholder={t('category')}
              isClearable
              className="nvi-select-container"
            />
            <TextInput
              label={t('titleLabel')}
              value={form.title}
              onChange={(event) => onFormChange({ ...form, title: event.target.value })}
              placeholder={t('titlePlaceholder')}
            />
          </div>
        </div>

        {/* Financial */}
        <div className="border-l-2 border-l-red-400 pl-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-400">
            <Icon name="DollarSign" size={14} />
            {t('sectionFinancial')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                {t('amount')}
              </label>
              <div className="flex items-center gap-2">
                <CurrencyInput
                  value={form.amount}
                  onChange={(value) => onFormChange({ ...form, amount: value })}
                  placeholder={t('amount')}
                  className="flex-1 rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
                />
                <span className="shrink-0 text-xs font-medium text-[var(--nvi-text-muted)]">
                  {form.currency || 'TZS'}
                </span>
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                {t('expenseDateLabel')}
              </label>
              <DatePickerInput
                value={form.expenseDate}
                onChange={(value) => onFormChange({ ...form, expenseDate: value })}
                placeholder={t('expenseDate')}
                className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
              />
            </div>
            <TextInput
              label={t('receiptRefLabel')}
              value={form.receiptRef}
              onChange={(event) => onFormChange({ ...form, receiptRef: event.target.value })}
              placeholder={t('receiptRef')}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="border-l-2 border-l-amber-400 pl-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-400">
            <Icon name="FileText" size={14} />
            {t('sectionNotes')}
          </p>
          <TextInput
            label={t('noteLabel')}
            value={form.note}
            onChange={(event) => onFormChange({ ...form, note: event.target.value })}
            placeholder={t('note')}
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
            disabled={!canWrite || isSubmitting}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isSubmitting ? (
              <Spinner size="xs" variant="orbit" />
            ) : (
              <Icon name="Receipt" size={14} />
            )}
            {isSubmitting ? t('saving') : t('createExpense')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
