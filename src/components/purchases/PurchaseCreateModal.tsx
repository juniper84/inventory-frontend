'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Card, Icon } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import {
  PurchaseOrderLineRow,
  type POLineEntry,
} from '@/components/purchase-orders/PurchaseOrderLineRow';
import type { Unit } from '@/lib/units';

type Branch = { id: string; name: string };
type Supplier = { id: string; name: string; status: string };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null } | null;
};

type FormState = { branchId: string; supplierId: string };

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  branches: Branch[];
  suppliers: Supplier[];
  variants: Variant[];
  units: Unit[];

  lines: POLineEntry[];
  onUpdateLine: (id: string, patch: Partial<POLineEntry>) => void;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;

  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  onSubmit: () => void;
  isCreating: boolean;
  canWrite: boolean;
};

export function PurchaseCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  branches,
  suppliers,
  variants,
  units,
  lines,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  loadVariantOptions,
  getVariantOption,
  onSubmit,
  isCreating,
  canWrite,
}: Props) {
  const t = useTranslations('purchasesPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="purchase-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="ShoppingCart" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="purchase-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createPurchase')}
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
        <Card padding="md" glow={false}>
          <div className="mb-3 flex items-center gap-2 border-l-2 border-blue-400 pl-2.5">
            <Icon name="Building2" size={13} className="text-blue-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-blue-400/80">
              {t('sectionBasicInfo') || 'Basic Info'}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SmartSelect
              instanceId="purchases-create-branch"
              value={form.branchId}
              onChange={(value) => onFormChange({ ...form, branchId: value })}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={t('selectBranch')}
              isClearable
              className="nvi-select-container"
            />
            <SmartSelect
              instanceId="purchases-create-supplier"
              value={form.supplierId}
              onChange={(value) => onFormChange({ ...form, supplierId: value })}
              options={suppliers.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.status})`,
              }))}
              placeholder={t('selectSupplier')}
              isClearable
              className="nvi-select-container"
            />
          </div>
        </Card>

        <Card padding="md" glow={false}>
          <div className="mb-3 flex items-center gap-2 border-l-2 border-amber-400 pl-2.5">
            <Icon name="Package" size={13} className="text-amber-400" />
            <p className="text-xs font-bold uppercase tracking-widest text-amber-400/80">
              {t('sectionLineItems') || 'Line Items'}
            </p>
          </div>
          <div className="space-y-2 nvi-stagger">
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
        </Card>

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
            className="nvi-press flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs font-medium text-[var(--nvi-text)] transition-colors hover:bg-[var(--nvi-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40"
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
              disabled={!canWrite || isCreating}
              title={!canWrite ? noAccess('title') : undefined}
              className="nvi-cta nvi-press rounded-xl px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-2">
                {isCreating ? (
                  <Spinner size="xs" variant="orbit" />
                ) : (
                  <Icon name="ShoppingCart" size={14} />
                )}
                {isCreating ? t('creating') : t('createPurchase')}
              </span>
            </button>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}
