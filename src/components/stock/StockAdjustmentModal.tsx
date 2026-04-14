'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { UnitHelpPanel } from '@/components/ui/UnitHelpPanel';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { Spinner } from '@/components/Spinner';
import { buildUnitLabel, type Unit } from '@/lib/units';
import { formatVariantLabel } from '@/lib/display';

type Branch = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  conversionFactor?: number | string | null;
  product?: { name: string } | null;
};
type Batch = {
  id: string;
  code: string;
  expiryDate?: string | null;
};

type FormState = {
  branchId: string;
  variantId: string;
  quantity: string;
  unitId: string;
  type: 'POSITIVE' | 'NEGATIVE';
  reason: string;
  batchId: string;
  lossReason: string;
  gainReason: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  branches: Branch[];
  variants: Variant[];
  units: Unit[];
  batches: Batch[];

  lossReasons: { value: string; label: string }[];
  gainReasons: { value: string; label: string }[];
  reasonFinancialHints: Record<string, string>;

  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  onSubmit: () => void;
  isSubmitting: boolean;
  canWrite: boolean;
};

export function StockAdjustmentModal({
  open,
  onClose,
  form,
  onFormChange,
  branches,
  variants,
  units,
  batches,
  lossReasons,
  gainReasons,
  reasonFinancialHints,
  loadVariantOptions,
  getVariantOption,
  onSubmit,
  isSubmitting,
  canWrite,
}: Props) {
  const t = useTranslations('stockAdjustmentsPage');
  const noAccess = useTranslations('noAccess');

  const activeReason =
    form.type === 'NEGATIVE' ? form.lossReason : form.gainReason;

  const unitOptionsForVariant = (() => {
    const all = units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));
    if (!form.variantId) return all;
    const variant = variants.find((v) => v.id === form.variantId);
    if (!variant) return all;
    const validIds = new Set<string>();
    if (variant.baseUnitId) validIds.add(variant.baseUnitId);
    if (variant.sellUnitId) validIds.add(variant.sellUnitId);
    if (validIds.size === 0) return all;
    return units
      .filter((u) => validIds.has(u.id))
      .map((u) => ({
        value: u.id,
        label: `${buildUnitLabel(u)}${u.id === variant.baseUnitId ? ` (${t('unitBase')})` : u.id === variant.sellUnitId ? ` (${t('unitSell')})` : ''}`,
      }));
  })();

  const selectedVariant = variants.find((v) => v.id === form.variantId);
  const baseUnit = selectedVariant
    ? units.find((u) => u.id === selectedVariant.baseUnitId)
    : undefined;
  const sellUnit = selectedVariant
    ? units.find((u) => u.id === selectedVariant.sellUnitId)
    : undefined;
  const factor = Number(selectedVariant?.conversionFactor) || 1;
  const qty = Number(form.quantity) || 0;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="stock-adjust-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="ArrowUpDown" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="stock-adjust-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('submitAdjustment')}
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
            instanceId="adjustment-form-branch"
            value={form.branchId}
            onChange={(v) => onFormChange({ ...form, branchId: v })}
            placeholder={t('selectBranch')}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <AsyncSmartSelect
            instanceId="adjustment-form-variant"
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

        <div className="grid gap-3 md:grid-cols-4">
          <TextInput
            label={t('quantity')}
            type="number"
            value={form.quantity}
            onChange={(e) => onFormChange({ ...form, quantity: e.target.value })}
            placeholder={t('quantity')}
          />
          <SmartSelect
            instanceId="adjustment-form-unit"
            value={form.unitId}
            onChange={(v) => onFormChange({ ...form, unitId: v })}
            placeholder={t('unit')}
            options={unitOptionsForVariant}
          />
          <div className="nvi-info-hint">
            <Icon name="Info" size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{t('unitHintTitle')}</p>
              <p className="mt-0.5 opacity-80">{t('unitHintAdjustment')}</p>
            </div>
          </div>
          {selectedVariant ? (
            <UnitHelpPanel
              mode="hint"
              baseUnitLabel={baseUnit?.label || baseUnit?.code}
              sellUnitLabel={sellUnit?.label || sellUnit?.code}
              conversionFactor={factor}
              quantity={qty > 0 ? qty : undefined}
            />
          ) : null}
          <SmartSelect
            instanceId="adjustment-form-type"
            value={form.type}
            onChange={(value) => {
              const type = (value || 'POSITIVE') as 'POSITIVE' | 'NEGATIVE';
              onFormChange({
                ...form,
                type,
                lossReason: type === 'NEGATIVE' ? form.lossReason : '',
                gainReason: type === 'POSITIVE' ? form.gainReason : '',
              });
            }}
            options={[
              { value: 'POSITIVE', label: t('positive') },
              { value: 'NEGATIVE', label: t('negative') },
            ]}
          />
          <SmartSelect
            instanceId="adjustment-form-batch"
            value={form.batchId}
            onChange={(v) => onFormChange({ ...form, batchId: v })}
            placeholder={t('noBatch')}
            options={[
              { value: '', label: t('noBatch') },
              ...batches.map((b) => ({
                value: b.id,
                label: `${b.code}${b.expiryDate ? ` (${t('expiresShort', { date: b.expiryDate.slice(0, 10) })})` : ''}`,
              })),
            ]}
          />
        </div>

        {form.type === 'NEGATIVE' ? (
          <SmartSelect
            instanceId="adjustment-form-loss-reason"
            value={form.lossReason}
            onChange={(v) => onFormChange({ ...form, lossReason: v || '' })}
            placeholder={t('lossReason')}
            options={lossReasons}
          />
        ) : null}
        {form.type === 'POSITIVE' ? (
          <SmartSelect
            instanceId="adjustment-form-gain-reason"
            value={form.gainReason}
            onChange={(v) => onFormChange({ ...form, gainReason: v || '' })}
            placeholder={t('gainReason')}
            options={gainReasons}
          />
        ) : null}
        {activeReason && reasonFinancialHints[activeReason] ? (
          <p className="-mt-1 px-1 text-xs text-gold-400">
            <Icon
              name="Info"
              size={12}
              className="mr-1 inline-block align-[-2px] text-gold-500"
            />
            {reasonFinancialHints[activeReason]}
          </p>
        ) : null}
        <TextInput
          label={t('reason')}
          value={form.reason}
          onChange={(e) => onFormChange({ ...form, reason: e.target.value })}
          placeholder={t('reason')}
        />
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
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSubmitting || !canWrite}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isSubmitting ? (
              <Spinner size="xs" variant="orbit" />
            ) : (
              <Icon name="Plus" size={16} />
            )}
            {isSubmitting ? t('submitting') : t('submitAdjustment')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
