'use client';

import { useTranslations } from 'next-intl';
import { Card, Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { buildUnitLabel, type Unit } from '@/lib/units';
import { formatVariantLabel } from '@/lib/display';

export type POLineEntry = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId: string;
};

type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null } | null;
};

type Props = {
  line: POLineEntry;
  variants: Variant[];
  units: Unit[];
  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;
  onUpdate: (id: string, patch: Partial<POLineEntry>) => void;
  onRemove: (id: string) => void;
};

export function PurchaseOrderLineRow({
  line,
  variants,
  units,
  loadVariantOptions,
  getVariantOption,
  onUpdate,
  onRemove,
}: Props) {
  const t = useTranslations('purchaseOrdersPage');
  const actions = useTranslations('actions');

  const unitOptions = (() => {
    const all = units.map((u) => ({ value: u.id, label: buildUnitLabel(u) }));
    if (!line.variantId) return all;
    const variant = variants.find((v) => v.id === line.variantId);
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

  return (
    <Card padding="sm" className="nvi-slide-in-bottom">
      <div className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2 grid gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
            {t('variant')}
          </label>
          <AsyncSmartSelect
            instanceId={`po-line-${line.id}-variant`}
            value={getVariantOption(line.variantId)}
            loadOptions={loadVariantOptions}
            defaultOptions={variants.map((v) => ({
              value: v.id,
              label: formatVariantLabel({
                id: v.id,
                name: v.name,
                productName: v.product?.name ?? null,
              }),
            }))}
            onChange={(opt) => {
              const value = opt?.value ?? '';
              const variant = variants.find((v) => v.id === value);
              onUpdate(line.id, {
                variantId: value,
                unitId: variant?.sellUnitId ?? variant?.baseUnitId ?? line.unitId,
              });
            }}
            placeholder={t('variant')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        <TextInput
          label={t('quantity')}
          value={line.quantity}
          onChange={(e) => onUpdate(line.id, { quantity: e.target.value })}
          type="number"
        />
        <TextInput
          label={t('unitCost')}
          value={line.unitCost}
          onChange={(e) => onUpdate(line.id, { unitCost: e.target.value })}
          type="number"
        />
        <div className="grid gap-1.5">
          <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
            {t('unit')}
          </label>
          <SmartSelect
            instanceId={`po-line-${line.id}-unit`}
            value={line.unitId}
            onChange={(v) => onUpdate(line.id, { unitId: v })}
            options={unitOptions}
            placeholder={t('unit')}
            isClearable
            className="nvi-select-container"
          />
        </div>
        <div className="flex items-end justify-end">
          <button
            type="button"
            onClick={() => onRemove(line.id)}
            className="nvi-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10"
            aria-label={actions('remove')}
          >
            <Icon name="Trash2" size={14} />
          </button>
        </div>
      </div>
    </Card>
  );
}
