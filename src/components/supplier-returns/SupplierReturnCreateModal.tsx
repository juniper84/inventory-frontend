'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Card, Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';
import { buildUnitLabel, Unit } from '@/lib/units';
import { formatVariantLabel } from '@/lib/display';
import { useFormatDate } from '@/lib/business-context';

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; status: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null } | null;
};
type Purchase = { id: string; status?: string; createdAt?: string; supplier?: Supplier | null };
type PurchaseOrder = { id: string; status?: string; createdAt?: string; supplier?: Supplier | null };
type ReceivingLine = {
  id: string;
  variant?: Variant;
  quantity: string;
  unitCost: string;
  receivedAt: string;
  unitId?: string | null;
};
type SupplierReturnLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  receivingLineId: string;
  unitId: string;
};
type FormState = {
  branchId: string;
  supplierId: string;
  purchaseId: string;
  purchaseOrderId: string;
  reason: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  lines: SupplierReturnLine[];
  onUpdateLine: (id: string, patch: Partial<SupplierReturnLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;

  branches: Branch[];
  suppliers: Supplier[];
  variants: Variant[];
  units: Unit[];
  purchases: Purchase[];
  purchaseOrders: PurchaseOrder[];
  receivings: ReceivingLine[];

  formatDocLabel: (entry: { id: string; status?: string; createdAt?: string; supplier?: Supplier | null }) => string;

  loadVariantOptions: (input: string) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  onSubmit: () => void;
  isCreating: boolean;
  canWrite: boolean;
};

export function SupplierReturnCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  lines,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  branches,
  suppliers,
  variants,
  units,
  purchases,
  purchaseOrders,
  receivings,
  formatDocLabel,
  loadVariantOptions,
  getVariantOption,
  onSubmit,
  isCreating,
  canWrite,
}: Props) {
  const t = useTranslations('supplierReturnsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const { formatDate } = useFormatDate();

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="supplier-return-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10">
              <Icon name="RotateCcw" size={14} className="text-amber-400" />
            </span>
            <h2
              id="supplier-return-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createReturn')}
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
        <div className="border-l-2 border-l-amber-400 pl-4 space-y-4">
          {/* Selectors */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                {t('selectBranch')}
              </label>
              <SmartSelect
                instanceId="form-branch"
                value={form.branchId}
                onChange={(value) => onFormChange({ ...form, branchId: value })}
                placeholder={t('selectBranch')}
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                <Icon name="Building2" size={12} className="text-[var(--nvi-text-muted)]" />
                {t('selectSupplier')}
              </label>
              <SmartSelect
                instanceId="form-supplier"
                value={form.supplierId}
                onChange={(value) => onFormChange({ ...form, supplierId: value })}
                placeholder={t('selectSupplier')}
                options={suppliers.map((supplier) => ({
                  value: supplier.id,
                  label: `${supplier.name} (${supplier.status})`,
                }))}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                <Icon name="ShoppingCart" size={12} className="text-[var(--nvi-text-muted)]" />
                {t('linkPurchaseOptional')}
              </label>
              <SmartSelect
                instanceId="form-purchase"
                value={form.purchaseId}
                onChange={(value) => onFormChange({ ...form, purchaseId: value })}
                placeholder={t('linkPurchaseOptional')}
                options={purchases.map((purchase) => ({
                  value: purchase.id,
                  label: formatDocLabel(purchase),
                }))}
                isClearable
              />
            </div>
            <div className="grid gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                <Icon name="ClipboardList" size={12} className="text-[var(--nvi-text-muted)]" />
                {t('linkPurchaseOrderOptional')}
              </label>
              <SmartSelect
                instanceId="form-purchase-order"
                value={form.purchaseOrderId}
                onChange={(value) => onFormChange({ ...form, purchaseOrderId: value })}
                placeholder={t('linkPurchaseOrderOptional')}
                options={purchaseOrders.map((order) => ({
                  value: order.id,
                  label: formatDocLabel(order),
                }))}
                isClearable
              />
            </div>
            <div className="md:col-span-2">
              <TextInput
                label={t('reasonOptional')}
                value={form.reason}
                onChange={(event) => onFormChange({ ...form, reason: event.target.value })}
                placeholder={t('reasonOptional')}
              />
            </div>
          </div>

          <div className="nvi-info-hint">
            <Icon name="Info" size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="opacity-80">{t('receivingHint')}</p>
            </div>
          </div>

          {/* Return lines */}
          <div className="space-y-2">
            {lines.map((line) => (
              <Card key={line.id} padding="sm" glow={false} className="nvi-card-hover">
                <div className="grid gap-2 md:grid-cols-6">
                  <AsyncSmartSelect
                    instanceId={`line-${line.id}-variant`}
                    value={getVariantOption(line.variantId)}
                    loadOptions={loadVariantOptions}
                    defaultOptions={variants.map((variant) => ({
                      value: variant.id,
                      label: formatVariantLabel({
                        id: variant.id,
                        name: variant.name,
                        productName: variant.product?.name ?? null,
                      }),
                    }))}
                    onChange={(opt) => {
                      const value = opt?.value ?? '';
                      const variant = variants.find((item) => item.id === value);
                      onUpdateLine(line.id, {
                        variantId: value,
                        unitId:
                          variant?.sellUnitId ??
                          variant?.baseUnitId ??
                          line.unitId,
                      });
                    }}
                    placeholder={t('variant')}
                    isClearable
                    className="nvi-select-container"
                  />
                  <TextInput
                    label={t('quantity')}
                    value={line.quantity}
                    onChange={(event) => onUpdateLine(line.id, { quantity: event.target.value })}
                    placeholder={t('quantity')}
                    type="number"
                  />
                  <SmartSelect
                    instanceId={`line-${line.id}-unit`}
                    value={line.unitId}
                    onChange={(value) => onUpdateLine(line.id, { unitId: value })}
                    placeholder={t('unit')}
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: buildUnitLabel(unit),
                    }))}
                    isClearable
                    className="nvi-select-container"
                  />
                  <CurrencyInput
                    value={line.unitCost}
                    onChange={(value) => onUpdateLine(line.id, { unitCost: value })}
                    placeholder={t('unitCost')}
                    className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-[var(--nvi-text)]"
                  />
                  <SmartSelect
                    instanceId={`line-${line.id}-receiving`}
                    value={line.receivingLineId}
                    onChange={(value) =>
                      onUpdateLine(line.id, {
                        receivingLineId: value,
                        unitId:
                          receivings.find((entry) => entry.id === value)?.unitId ??
                          line.unitId,
                      })
                    }
                    placeholder={t('receivingLineOptional')}
                    options={receivings
                      .filter((receiving) =>
                        line.variantId ? receiving.variant?.id === line.variantId : true,
                      )
                      .map((receiving) => {
                        const unit = receiving.unitId
                          ? units.find((item) => item.id === receiving.unitId) ?? null
                          : null;
                        const unitLabel = unit
                          ? buildUnitLabel(unit)
                          : receiving.unitId ?? '';
                        return {
                          value: receiving.id,
                          label: t('receivingOption', {
                            name: formatVariantLabel(
                              {
                                id: receiving.variant?.id ?? null,
                                name: receiving.variant?.name ?? null,
                                productName: receiving.variant?.product?.name ?? null,
                              },
                              t('variantFallback'),
                            ),
                            qty: receiving.quantity,
                            unit: unitLabel,
                            date: formatDate(receiving.receivedAt),
                          }),
                        };
                      })}
                    isClearable
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveLine(line.id)}
                    disabled={!canWrite}
                    title={!canWrite ? noAccess('title') : undefined}
                    className="rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)] disabled:opacity-40 hover:border-red-500/50 hover:text-red-400 transition-colors"
                  >
                    {actions('remove')}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAddLine}
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs font-medium text-[var(--nvi-text)] disabled:cursor-not-allowed disabled:opacity-40 hover:border-[var(--nvi-gold)]/50 transition-colors"
          >
            <Icon name="Plus" size={14} />
            {t('addLine')}
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
              disabled={isCreating || !canWrite}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isCreating ? <Spinner size="xs" variant="orbit" /> : <Icon name="RotateCcw" size={14} />}
              {isCreating ? t('creating') : t('createReturn')}
            </button>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}
