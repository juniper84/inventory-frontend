'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';

type Branch = { id: string; name: string };
type Batch = { id: string; code: string; expiryDate?: string | null };
type LineItem = { id: string; variantId: string; quantity: string; batchId: string };
type FormState = {
  sourceBranchId: string;
  destinationBranchId: string;
  feeAmount: string;
  feeCurrency: string;
  feeCarrier: string;
  feeNote: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  items: LineItem[];
  onUpdateItem: (
    index: number,
    patch: Partial<{ variantId: string; quantity: string; batchId: string }>,
  ) => void;
  onAddItem: () => void;

  branches: Branch[];
  effectiveSourceBranchId: string;
  batchTrackingEnabled: boolean;
  batchOptions: Record<string, Batch[]>;
  onLoadBatches: (branchId: string, variantId: string) => Promise<void> | void;

  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  onSubmit: () => void;
  isCreating: boolean;
  canWrite: boolean;
};

export function TransferCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  items,
  onUpdateItem,
  onAddItem,
  branches,
  effectiveSourceBranchId,
  batchTrackingEnabled,
  batchOptions,
  onLoadBatches,
  loadVariantOptions,
  getVariantOption,
  onSubmit,
  isCreating,
  canWrite,
}: Props) {
  const t = useTranslations('transfersPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="transfer-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Truck" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="transfer-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createTransfer')}
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
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            instanceId="form-source-branch"
            value={form.sourceBranchId}
            onChange={(value) => onFormChange({ ...form, sourceBranchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('sourceBranch')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="form-destination-branch"
            value={form.destinationBranchId}
            onChange={(value) => onFormChange({ ...form, destinationBranchId: value })}
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('destinationBranch')}
            isClearable
            className="nvi-select-container"
          />
        </div>

        <div className="space-y-2 nvi-stagger">
          {items.map((item, index) => (
            <div key={item.id} className="grid gap-3 md:grid-cols-3">
              <AsyncSmartSelect
                instanceId={`transfer-item-${item.id}-variant`}
                value={getVariantOption(item.variantId)}
                loadOptions={loadVariantOptions}
                defaultOptions={true}
                onChange={(opt) => {
                  const variantId = opt?.value ?? '';
                  onUpdateItem(index, { variantId, batchId: '' });
                  if (effectiveSourceBranchId && variantId && batchTrackingEnabled) {
                    Promise.resolve(
                      onLoadBatches(effectiveSourceBranchId, variantId),
                    ).catch(() => null);
                  }
                }}
                placeholder={t('variant')}
                isClearable
                className="nvi-select-container"
              />
              <TextInput
                value={item.quantity}
                onChange={(event) => onUpdateItem(index, { quantity: event.target.value })}
                placeholder={t('quantity')}
                type="number"
              />
              <SmartSelect
                instanceId={`transfer-item-${item.id}-batch`}
                value={item.batchId ?? ''}
                onChange={(value) => onUpdateItem(index, { batchId: value })}
                options={(
                  batchOptions[`${effectiveSourceBranchId}-${item.variantId}`] || []
                ).map((batch) => ({
                  value: batch.id,
                  label: batch.code,
                }))}
                placeholder={
                  batchTrackingEnabled ? t('batchOptional') : t('batchDisabled')
                }
                isClearable
                isDisabled={!batchTrackingEnabled}
                className="nvi-select-container"
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex items-center gap-2">
            <CurrencyInput
              value={form.feeAmount}
              onChange={(value) => onFormChange({ ...form, feeAmount: value })}
              placeholder={t('transferFeeAmount')}
              className="flex-1 rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
            />
            <span className="shrink-0 text-xs font-medium text-[var(--nvi-text-muted)]">
              {form.feeCurrency || 'TZS'}
            </span>
          </div>
          <TextInput
            value={form.feeCarrier}
            onChange={(event) => onFormChange({ ...form, feeCarrier: event.target.value })}
            placeholder={t('transferFeeCarrier')}
          />
          <TextInput
            value={form.feeNote}
            onChange={(event) => onFormChange({ ...form, feeNote: event.target.value })}
            placeholder={t('transferFeeNote')}
          />
        </div>
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAddItem}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            <Icon name="Plus" size={14} />
            {t('addItem')}
          </button>
          <div className="flex items-center gap-2">
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
              disabled={!canWrite || isCreating}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isCreating ? (
                <Spinner size="xs" variant="orbit" />
              ) : (
                <Icon name="CircleCheck" size={14} />
              )}
              {isCreating ? t('creating') : t('createTransfer')}
            </button>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}
