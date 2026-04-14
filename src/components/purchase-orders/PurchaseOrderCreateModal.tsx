'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Card, Icon } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { Spinner } from '@/components/Spinner';
import { useFormatDate } from '@/lib/business-context';
import { formatVariantLabel } from '@/lib/display';
import type { Unit } from '@/lib/units';
import {
  PurchaseOrderLineRow,
  type POLineEntry,
} from './PurchaseOrderLineRow';

type Branch = { id: string; name: string };
type Supplier = {
  id: string;
  name: string;
  status: string;
  leadTimeDays?: number | null;
};
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
  defaultCost?: number | string | null;
};
type ReorderSuggestion = {
  id: string;
  branchId: string;
  variantId: string;
  suggestedQuantity: number;
  variant?: { name?: string | null };
};

type FormState = { branchId: string; supplierId: string; expectedAt: string };

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  lines: POLineEntry[];
  onAddLine: () => void;
  onUpdateLine: (id: string, patch: Partial<POLineEntry>) => void;
  onRemoveLine: (id: string) => void;

  branches: Branch[];
  suppliers: Supplier[];
  variants: Variant[];
  units: Unit[];

  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  supplierEta: string | null;
  selectedSupplier: Supplier | null;

  reorderSuggestions: ReorderSuggestion[];
  isLoadingSuggestions: boolean;
  onLoadSuggestions: () => void;

  onSubmit: () => void;
  isCreating: boolean;
  canWrite: boolean;
};

export function PurchaseOrderCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  lines,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  branches,
  suppliers,
  variants,
  units,
  loadVariantOptions,
  getVariantOption,
  supplierEta,
  selectedSupplier,
  reorderSuggestions,
  isLoadingSuggestions,
  onLoadSuggestions,
  onSubmit,
  isCreating,
  canWrite,
}: Props) {
  const t = useTranslations('purchaseOrdersPage');
  const noAccess = useTranslations('noAccess');
  const { formatDate } = useFormatDate();

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="po-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="ClipboardList" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="po-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createTitle')}
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
            instanceId="po-create-branch"
            value={form.branchId}
            onChange={(v) => onFormChange({ ...form, branchId: v })}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            placeholder={t('selectBranch')}
            isClearable
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="po-create-supplier"
            value={form.supplierId}
            onChange={(v) => onFormChange({ ...form, supplierId: v })}
            options={suppliers.map((s) => ({
              value: s.id,
              label: `${s.name} (${s.status})`,
            }))}
            placeholder={t('selectSupplier')}
            isClearable
            className="nvi-select-container"
          />
          <DatePickerInput
            value={form.expectedAt}
            onChange={(v) => onFormChange({ ...form, expectedAt: v })}
            placeholder={t('expectedAt')}
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
          />
          {supplierEta ? (
            <Card padding="sm" glow={false}>
              <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                <Icon name="Truck" size={14} className="text-[var(--nvi-accent)]" />
                <div>
                  <p>
                    {t('leadTimeHint', {
                      days: selectedSupplier?.leadTimeDays ?? 0,
                    })}
                  </p>
                  <p className="text-[var(--nvi-text)]">
                    {t('etaHint', { date: formatDate(supplierEta) })}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card padding="sm" glow={false}>
              <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                <Icon name="Clock" size={14} />
                <span>{t('leadTimeMissing')}</span>
              </div>
            </Card>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]">
          <Icon name="Package" size={14} />
          <span>Line Items</span>
        </div>
        <div className="space-y-2">
          {lines.map((line) => (
            <PurchaseOrderLineRow
              key={line.id}
              line={line}
              variants={variants}
              units={units}
              loadVariantOptions={loadVariantOptions}
              getVariantOption={getVariantOption}
              onUpdate={onUpdateLine}
              onRemove={onRemoveLine}
            />
          ))}
        </div>
        <div className="nvi-info-hint">
          <Icon name="Info" size={14} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">{t('unitHintTitle')}</p>
            <p className="mt-0.5 opacity-80">{t('unitHintPurchase')}</p>
          </div>
        </div>

        {reorderSuggestions.length > 0 ? (
          <div className="space-y-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
              <div className="nvi-kpi-icon nvi-kpi-icon--amber" style={{ width: 28, height: 28 }}>
                <Icon name="Lightbulb" size={14} />
              </div>
              <span>
                {isLoadingSuggestions
                  ? t('loadingSuggestions')
                  : `${reorderSuggestions.length} ${t('suggestionsReady', { count: reorderSuggestions.length })}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-amber-200/80">
              {reorderSuggestions.slice(0, 6).map((s) => {
                const v = variants.find((vi) => vi.id === s.variantId);
                const label = v
                  ? formatVariantLabel({
                      id: v.id,
                      name: v.name,
                      productName: v.product?.name ?? null,
                    })
                  : s.variant?.name ?? s.variantId;
                return (
                  <span
                    key={s.id}
                    className="rounded-full border border-amber-500/30 bg-amber-500/5 px-2 py-0.5"
                  >
                    {label} · {s.suggestedQuantity}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={onLoadSuggestions}
              disabled={!canWrite}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-[var(--nvi-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="ClipboardList" size={14} />
              {t('useReorderSuggestions')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onAddLine}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)] disabled:cursor-not-allowed disabled:opacity-70"
            disabled={!canWrite}
            title={!canWrite ? noAccess('title') : undefined}
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
              disabled={!canWrite || isCreating}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isCreating ? (
                <Spinner size="xs" variant="orbit" />
              ) : (
                <Icon name="CircleCheck" size={14} />
              )}
              {isCreating ? t('creating') : t('createAction')}
            </button>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}
