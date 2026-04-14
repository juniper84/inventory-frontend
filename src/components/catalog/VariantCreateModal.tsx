'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Card, Icon, TextInput } from '@/components/ui';
import { UnitHelpPanel } from '@/components/ui/UnitHelpPanel';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Checkbox } from '@/components/Checkbox';
import { Spinner } from '@/components/Spinner';
import type { Unit } from '@/lib/units';

type Product = { id: string; name: string };
type Branch = { id: string; name: string };

type FormState = {
  productId: string;
  name: string;
  sku: string;
  barcode: string;
  defaultPrice: string;
  minPrice: string;
  defaultCost: string;
  vatMode: string;
  baseUnitId: string;
  sellUnitId: string;
  conversionFactor: string;
  trackStock: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  products: Product[];
  branches: Branch[];
  units: Unit[];
  newVariantBranchIds: string[];
  onNewVariantBranchIdsChange: (ids: string[]) => void;

  loadProductOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;

  onSubmit: () => void;
  isCreating: boolean;
  canWrite: boolean;

  onOpenScanner: () => void;
};

export function VariantCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  products,
  branches,
  units,
  newVariantBranchIds,
  onNewVariantBranchIdsChange,
  loadProductOptions,
  onSubmit,
  isCreating,
  canWrite,
  onOpenScanner,
}: Props) {
  const t = useTranslations('variantsPage');
  const noAccess = useTranslations('noAccess');

  const unitOptions = units.map((u) => ({
    value: u.id,
    label: u.label || u.code,
  }));

  const sellUnit = form.sellUnitId
    ? units.find((u) => u.id === form.sellUnitId)
    : null;
  const perLabel = sellUnit
    ? ` (${t('perUnit', { unit: sellUnit.label || sellUnit.code })})`
    : '';

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="variant-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Plus" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="variant-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createVariant')}
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
        <Card padding="lg" className="space-y-4" glow={false}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
            Basic info
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <AsyncSmartSelect
              instanceId="variant-create-product"
              value={
                form.productId
                  ? {
                      value: form.productId,
                      label:
                        products.find((p) => p.id === form.productId)?.name ??
                        '',
                    }
                  : null
              }
              onChange={(opt) =>
                onFormChange({ ...form, productId: opt?.value ?? '' })
              }
              loadOptions={loadProductOptions}
              defaultOptions={products.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              placeholder={t('selectProduct')}
              className="nvi-select-container"
            />
            <TextInput
              label={t('variantName')}
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              placeholder={t('variantName')}
            />
            <TextInput
              label={t('skuOptional')}
              value={form.sku}
              onChange={(e) => onFormChange({ ...form, sku: e.target.value })}
              placeholder={t('skuOptional')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              label={t('barcodeOptional')}
              value={form.barcode}
              onChange={(e) =>
                onFormChange({ ...form, barcode: e.target.value })
              }
              placeholder={t('barcodeOptional')}
              className="flex-1"
            />
            <button
              type="button"
              onClick={onOpenScanner}
              disabled={!canWrite}
              title={!canWrite ? noAccess('title') : undefined}
              className="nvi-press rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-gold-100 disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="Scan" size={12} />
                {t('scanAssignNew')}
              </span>
            </button>
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
            Pricing
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <CurrencyInput
              value={form.defaultPrice}
              onChange={(v) => onFormChange({ ...form, defaultPrice: v })}
              placeholder={`${t('defaultPrice')}${perLabel}`}
              className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-gold-100"
            />
            <CurrencyInput
              value={form.minPrice}
              onChange={(v) => onFormChange({ ...form, minPrice: v })}
              placeholder={`${t('minPrice')}${perLabel}`}
              className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-gold-100"
            />
            <CurrencyInput
              value={form.defaultCost}
              onChange={(v) => onFormChange({ ...form, defaultCost: v })}
              placeholder={`${t('defaultCost')}${perLabel}`}
              className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-gold-100"
            />
            <SmartSelect
              instanceId="variant-create-vat-mode"
              value={form.vatMode}
              onChange={(v) => onFormChange({ ...form, vatMode: v })}
              options={[
                { value: 'INCLUSIVE', label: t('vatInclusive') },
                { value: 'EXCLUSIVE', label: t('vatExclusive') },
                { value: 'EXEMPT', label: t('vatExempt') },
              ]}
              className="nvi-select-container"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gold-200">
            <Checkbox
              checked={form.trackStock}
              onChange={(checked) =>
                onFormChange({ ...form, trackStock: checked })
              }
            />
            {t('trackStock')}
          </label>

          {branches.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
                Branch availability
              </p>
              <p className="text-xs text-gold-400">{t('availableAtBranches')}</p>
              <div className="flex flex-wrap gap-3 text-xs text-gold-200">
                {branches.map((branch) => (
                  <label key={branch.id} className="flex items-center gap-2">
                    <Checkbox
                      checked={newVariantBranchIds.includes(branch.id)}
                      onChange={(checked) =>
                        onNewVariantBranchIdsChange(
                          checked
                            ? [...newVariantBranchIds, branch.id]
                            : newVariantBranchIds.filter(
                                (id) => id !== branch.id,
                              ),
                        )
                      }
                      disabled={!canWrite}
                    />
                    {branch.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
            Units
          </p>
          <UnitHelpPanel mode="full" />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-xs text-gold-300">
              <span className="text-gold-400">{t('baseUnit')}</span>
              <SmartSelect
                instanceId="variant-create-base-unit"
                value={form.baseUnitId}
                onChange={(value) => {
                  const sellUnitId = form.sellUnitId || value;
                  const conversionFactor =
                    sellUnitId === value ? '1' : form.conversionFactor;
                  onFormChange({
                    ...form,
                    baseUnitId: value,
                    sellUnitId,
                    conversionFactor,
                  });
                }}
                options={unitOptions}
                placeholder={t('baseUnit')}
                className="nvi-select-container"
              />
            </label>
            <label className="space-y-1 text-xs text-gold-300">
              <span className="text-gold-400">{t('sellUnit')}</span>
              <SmartSelect
                instanceId="variant-create-sell-unit"
                value={form.sellUnitId}
                onChange={(value) =>
                  onFormChange({
                    ...form,
                    sellUnitId: value,
                    conversionFactor:
                      value === form.baseUnitId ? '1' : form.conversionFactor,
                  })
                }
                options={unitOptions}
                placeholder={t('sellUnit')}
                className="nvi-select-container"
              />
            </label>
            <label className="space-y-1 text-xs text-gold-300">
              <span className="text-gold-400">{t('sellToBaseFactor')}</span>
              <TextInput
                value={form.conversionFactor}
                onChange={(e) =>
                  onFormChange({ ...form, conversionFactor: e.target.value })
                }
                placeholder={t('sellToBaseFactor')}
                disabled={form.sellUnitId === form.baseUnitId}
              />
              <p className="text-[10px] text-gold-400">{t('conversionHint')}</p>
            </label>
          </div>
        </Card>
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
            disabled={!canWrite || isCreating || !form.productId || !form.name}
            title={!canWrite ? noAccess('title') : undefined}
            className="nvi-cta nvi-press rounded-xl px-4 py-2 font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isCreating ? (
                <Spinner variant="orbit" size="xs" />
              ) : (
                <Icon name="Plus" size={14} />
              )}
              {isCreating ? t('creating') : t('createVariant')}
            </span>
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
