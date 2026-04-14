'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Card, Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { Spinner } from '@/components/Spinner';
import { formatVariantLabel } from '@/lib/display';

type Branch = { id: string; name: string };
type Customer = { id: string; name: string };
type Variant = { id: string; name: string; product?: { name: string } | null };

type ReturnFormState = {
  branchId: string;
  customerId: string;
  reason: string;
};

type ReturnItem = {
  variantId: string;
  quantity: string;
  unitPrice: string;
};

type VariantOption = { value: string; label: string } | null;

type Props = {
  open: boolean;
  onClose: () => void;

  branches: Branch[];
  customers: Customer[];
  variants: Variant[];

  returnForm: ReturnFormState;
  onReturnFormChange: (next: ReturnFormState) => void;

  returnToStock: boolean;
  onReturnToStockChange: (value: boolean) => void;

  returnItems: ReturnItem[];
  onAddItem: () => void;
  onUpdateItem: (index: number, patch: Partial<ReturnItem>) => void;

  loadCustomerOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => VariantOption;

  isReturning: boolean;
  onSubmit: () => void;
  canReturnWithoutReceipt: boolean;
};

export function NoReceiptReturnModal({
  open,
  onClose,
  branches,
  customers,
  variants,
  returnForm,
  onReturnFormChange,
  returnToStock,
  onReturnToStockChange,
  returnItems,
  onAddItem,
  onUpdateItem,
  loadCustomerOptions,
  loadVariantOptions,
  getVariantOption,
  isReturning,
  onSubmit,
  canReturnWithoutReceipt,
}: Props) {
  const t = useTranslations('receiptsPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="no-receipt-return-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="RotateCcw" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="no-receipt-return-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('returnTitle')}
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
        <div className="grid gap-3 md:grid-cols-3">
          <SmartSelect
            instanceId="receipts-return-branch"
            value={returnForm.branchId}
            onChange={(value) =>
              onReturnFormChange({ ...returnForm, branchId: value })
            }
            options={branches.map((branch) => ({
              value: branch.id,
              label: branch.name,
            }))}
            placeholder={t('selectBranch')}
            isClearable
            className="nvi-select-container"
          />
          <AsyncSmartSelect
            instanceId="receipts-return-customer"
            value={
              returnForm.customerId
                ? {
                    value: returnForm.customerId,
                    label:
                      customers.find((c) => c.id === returnForm.customerId)
                        ?.name ?? common('unknown'),
                  }
                : null
            }
            onChange={(opt) =>
              onReturnFormChange({
                ...returnForm,
                customerId: opt?.value ?? '',
              })
            }
            loadOptions={loadCustomerOptions}
            defaultOptions={customers.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            placeholder={t('customerOptional')}
            isClearable
            className="nvi-select-container"
          />
          <TextInput
            value={returnForm.reason}
            onChange={(event) =>
              onReturnFormChange({ ...returnForm, reason: event.target.value })
            }
            label={t('reasonOptional')}
            placeholder={t('reasonOptional')}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-[color:var(--foreground)]">
          <input
            type="checkbox"
            checked={returnToStock}
            onChange={(event) => onReturnToStockChange(event.target.checked)}
            className="accent-[color:var(--accent)]"
          />
          {t('returnToStock')}
        </label>

        <div className="nvi-stagger space-y-2">
          {returnItems.map((item, index) => (
            <Card key={`return-${index}`} padding="sm">
              <div className="grid gap-3 md:grid-cols-3">
                <AsyncSmartSelect
                  instanceId={`receipts-return-item-${index}-variant`}
                  value={getVariantOption(item.variantId)}
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
                    onUpdateItem(index, { variantId: opt?.value ?? '' })
                  }
                  placeholder={t('selectVariant')}
                  isClearable
                  className="nvi-select-container"
                />
                <TextInput
                  value={item.quantity}
                  onChange={(event) =>
                    onUpdateItem(index, { quantity: event.target.value })
                  }
                  type="number"
                  label={t('quantity')}
                  placeholder={t('quantity')}
                />
                <TextInput
                  value={item.unitPrice}
                  onChange={(event) =>
                    onUpdateItem(index, { unitPrice: event.target.value })
                  }
                  type="number"
                  label={t('unitPrice')}
                  placeholder={t('unitPrice')}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onAddItem}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canReturnWithoutReceipt}
            title={!canReturnWithoutReceipt ? noAccess('title') : undefined}
          >
            <Icon name="Plus" size={14} />
            {t('addItem')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="nvi-press inline-flex items-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canReturnWithoutReceipt || isReturning}
            title={!canReturnWithoutReceipt ? noAccess('title') : undefined}
          >
            {isReturning ? (
              <Spinner size="xs" variant="orbit" />
            ) : (
              <Icon name="RotateCcw" size={14} />
            )}
            {isReturning ? t('submitting') : t('submitReturn')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
