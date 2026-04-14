'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { Spinner } from '@/components/Spinner';
import { formatVariantLabel } from '@/lib/display';

type Branch = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  product?: { name: string } | null;
};

type BatchForm = {
  branchId: string;
  variantId: string;
  code: string;
  expiryDate: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: BatchForm;
  onFormChange: (next: BatchForm) => void;

  branches: Branch[];
  variants: Variant[];

  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  onSubmit: () => void;
  onGenerateCode: () => void;
  isSubmitting: boolean;
  isGeneratingCode: boolean;
  canWrite: boolean;
  canGenerateCode: boolean;
};

export function StockBatchModal({
  open,
  onClose,
  form,
  onFormChange,
  branches,
  variants,
  loadVariantOptions,
  getVariantOption,
  onSubmit,
  onGenerateCode,
  isSubmitting,
  isGeneratingCode,
  canWrite,
  canGenerateCode,
}: Props) {
  const t = useTranslations('stockAdjustmentsPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="stock-batch-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Layers" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="stock-batch-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createBatch')}
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

      <div className="nvi-modal-panel__body space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            instanceId="adjustment-batch-branch"
            value={form.branchId}
            onChange={(v) => onFormChange({ ...form, branchId: v })}
            placeholder={t('selectBranch')}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <AsyncSmartSelect
            instanceId="adjustment-batch-variant"
            value={getVariantOption(form.variantId)}
            loadOptions={loadVariantOptions}
            defaultOptions={variants.map((v) => ({
              value: v.id,
              label: formatVariantLabel({
                id: v.id,
                name: v.name,
                productName: v.product?.name ?? null,
              }),
            }))}
            onChange={(opt) =>
              onFormChange({ ...form, variantId: opt?.value ?? '' })
            }
            placeholder={t('selectVariant')}
            isClearable
            className="nvi-select-container"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="flex items-end gap-1.5">
              <div className="flex-1">
                <TextInput
                  label={t('batchCode')}
                  value={form.code}
                  onChange={(e) =>
                    onFormChange({ ...form, code: e.target.value })
                  }
                  placeholder={t('batchCode')}
                />
              </div>
              <button
                type="button"
                onClick={onGenerateCode}
                disabled={isGeneratingCode || !canGenerateCode}
                className="nvi-press shrink-0 rounded-xl border border-gold-700/50 p-2 text-gold-400 transition-colors hover:border-gold-500/50 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                title="Generate batch code"
              >
                {isGeneratingCode ? (
                  <Spinner size="xs" variant="orbit" />
                ) : (
                  <Icon name="Wand" size={16} />
                )}
              </button>
            </div>
          </div>
          <DatePickerInput
            value={form.expiryDate}
            onChange={(v) => onFormChange({ ...form, expiryDate: v })}
            placeholder={t('expiryDate')}
            className="rounded-xl border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
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
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting || !canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isSubmitting ? (
              <Spinner size="xs" variant="grid" />
            ) : (
              <Icon name="Plus" size={16} />
            )}
            {isSubmitting ? t('creating') : t('createBatchAction')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
