'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Banner } from '@/components/notifications/Banner';
import { Icon } from '@/components/ui';
import { DatePickerInput } from '@/components/DatePickerInput';
import { Spinner } from '@/components/Spinner';
import type { Unit } from '@/lib/units';
import {
  PurchaseOrderLineRow,
  type POLineEntry,
} from './PurchaseOrderLineRow';

type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null };
};

type UpdateForm = { purchaseOrderId: string; expectedAt: string };

type Props = {
  open: boolean;
  onClose: () => void;

  orderLabel: string;
  form: UpdateForm;
  onFormChange: (next: UpdateForm) => void;

  lines: POLineEntry[];
  onAddLine: () => void;
  onUpdateLine: (id: string, patch: Partial<POLineEntry>) => void;
  onRemoveLine: (id: string) => void;

  variants: Variant[];
  units: Unit[];

  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  onSubmit: () => void;
  isUpdating: boolean;
  canWrite: boolean;
};

export function PurchaseOrderEditModal({
  open,
  onClose,
  orderLabel,
  form,
  onFormChange,
  lines,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  variants,
  units,
  loadVariantOptions,
  getVariantOption,
  onSubmit,
  isUpdating,
  canWrite,
}: Props) {
  const t = useTranslations('purchaseOrdersPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="po-edit-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="po-edit-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('updateTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {orderLabel}
            </p>
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
        <Banner message={t('editApprovalHint')} severity="info" />

        <div className="grid gap-3 md:grid-cols-2">
          <DatePickerInput
            value={form.expectedAt}
            onChange={(v) => onFormChange({ ...form, expectedAt: v })}
            placeholder={t('expectedAt')}
            className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
          />
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
              disabled={!canWrite || isUpdating}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isUpdating ? (
                <Spinner size="xs" variant="pulse" />
              ) : (
                <Icon name="CircleCheck" size={14} />
              )}
              {isUpdating ? t('updating') : t('updateAction')}
            </button>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}
