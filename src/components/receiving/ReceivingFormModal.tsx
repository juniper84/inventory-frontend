'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { DatePickerInput } from '@/components/DatePickerInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';
import { buildUnitLabel, type Unit } from '@/lib/units';
import { formatVariantLabel } from '@/lib/display';

type Supplier = { id: string; name: string };
type Purchase = { id: string; status: string; createdAt?: string; supplier?: Supplier | null };
type PurchaseOrder = { id: string; status: string; createdAt?: string; supplier?: Supplier | null };
type Variant = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  product?: { name?: string | null } | null;
};

export type ReceiveLine = {
  id: string;
  variantId: string;
  quantity: string;
  unitCost: string;
  unitId: string;
  batchCode: string;
  expiryDate: string;
  qualityNote: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  targetType: 'purchase' | 'purchaseOrder';
  onTargetTypeChange: (t: 'purchase' | 'purchaseOrder') => void;

  targetId: string;
  onTargetIdChange: (id: string) => void;

  overrideReason: string;
  onOverrideReasonChange: (v: string) => void;

  purchases: Purchase[];
  purchaseOrders: PurchaseOrder[];
  variants: Variant[];
  units: Unit[];

  loadVariantOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;
  getVariantData: (id: string) => Variant | null;
  formatDocLabel: (doc: Purchase | PurchaseOrder) => string;

  batchTrackingEnabled: boolean;

  lines: ReceiveLine[];
  onUpdateLine: (id: string, patch: Partial<ReceiveLine>) => void;
  onAddLine: () => void;
  onRemoveLine: (id: string) => void;

  generatingCodeForLine: string | null;
  onGenerateCode: (lineId: string) => void;
  canGenerateCode: boolean;

  scanTarget: string | null;
  onScanTargetToggle: (lineId: string) => void;

  onSubmit: () => void;
  isReceiving: boolean;
  canWrite: boolean;
};

export function ReceivingFormModal({
  open,
  onClose,
  targetType,
  onTargetTypeChange,
  targetId,
  onTargetIdChange,
  overrideReason,
  onOverrideReasonChange,
  purchases,
  purchaseOrders,
  variants,
  units,
  loadVariantOptions,
  getVariantOption,
  getVariantData,
  formatDocLabel,
  batchTrackingEnabled,
  lines,
  onUpdateLine,
  onAddLine,
  onRemoveLine,
  generatingCodeForLine,
  onGenerateCode,
  canGenerateCode,
  scanTarget,
  onScanTargetToggle,
  onSubmit,
  isReceiving,
  canWrite,
}: Props) {
  const t = useTranslations('receivingPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="receive-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="PackageCheck" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="receive-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('receiveTitle')}
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

      <div className="nvi-modal-panel__body space-y-5">
        {/* Source type */}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--nvi-text-muted)]/70">
            {t('targetTypeLabel') || 'Source type'}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
            <button
              type="button"
              onClick={() => onTargetTypeChange('purchase')}
              className={[
                'nvi-press group flex flex-col items-center gap-2.5 rounded-2xl border-2 px-4 py-4 transition-all',
                targetType === 'purchase'
                  ? 'border-emerald-500/60 bg-emerald-500/[0.06] shadow-[0_0_20px_-6px] shadow-emerald-500/20'
                  : 'border-[var(--nvi-border)] hover:border-[var(--nvi-text-muted)]/40',
              ].join(' ')}
            >
              <div
                className={`nvi-kpi-icon ${targetType === 'purchase' ? 'nvi-kpi-icon--emerald' : ''}`}
              >
                <Icon
                  name="ShoppingCart"
                  size={18}
                  className={
                    targetType === 'purchase' ? '' : 'text-[var(--nvi-text-muted)]'
                  }
                />
              </div>
              <span
                className={`text-sm font-semibold transition-colors ${
                  targetType === 'purchase'
                    ? 'text-emerald-300'
                    : 'text-[var(--nvi-text-muted)]'
                }`}
              >
                {t('purchase')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onTargetTypeChange('purchaseOrder')}
              className={[
                'nvi-press group flex flex-col items-center gap-2.5 rounded-2xl border-2 px-4 py-4 transition-all',
                targetType === 'purchaseOrder'
                  ? 'border-blue-500/60 bg-blue-500/[0.06] shadow-[0_0_20px_-6px] shadow-blue-500/20'
                  : 'border-[var(--nvi-border)] hover:border-[var(--nvi-text-muted)]/40',
              ].join(' ')}
            >
              <div
                className={`nvi-kpi-icon ${targetType === 'purchaseOrder' ? 'nvi-kpi-icon--blue' : ''}`}
              >
                <Icon
                  name="ClipboardList"
                  size={18}
                  className={
                    targetType === 'purchaseOrder'
                      ? ''
                      : 'text-[var(--nvi-text-muted)]'
                  }
                />
              </div>
              <span
                className={`text-sm font-semibold transition-colors ${
                  targetType === 'purchaseOrder'
                    ? 'text-blue-300'
                    : 'text-[var(--nvi-text-muted)]'
                }`}
              >
                {t('purchaseOrder')}
              </span>
            </button>
          </div>
        </div>

        {/* Document + override */}
        <div className="rounded-2xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)]/50 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--nvi-text-muted)]/70">
            {t('selectDocument')}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <SmartSelect
              instanceId="receive-target-document"
              value={targetId}
              onChange={onTargetIdChange}
              placeholder={t('selectDocument')}
              options={(targetType === 'purchase' ? purchases : purchaseOrders).map(
                (item) => ({ value: item.id, label: formatDocLabel(item) }),
              )}
              isClearable
              className="nvi-select-container"
            />
            <TextInput
              label={t('overrideReason')}
              value={overrideReason}
              onChange={(e) => onOverrideReasonChange(e.target.value)}
              placeholder={t('overrideReason')}
            />
          </div>
        </div>

        {/* Receiving lines */}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--nvi-text-muted)]/70">
            Items to receive
          </p>
          <div className="space-y-3 nvi-stagger">
            {lines.map((line, lineIndex) => (
              <div
                key={line.id}
                className="rounded-2xl border border-[var(--nvi-border)] bg-[var(--nvi-surface)]/30 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 text-[11px] font-bold text-emerald-400">
                    {lineIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveLine(line.id)}
                    className="nvi-press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canWrite || lines.length <= 1}
                    title={!canWrite ? noAccess('title') : undefined}
                  >
                    <Icon name="Trash2" size={12} />
                  </button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <div className="md:col-span-2 lg:col-span-1">
                    <AsyncSmartSelect
                      instanceId={`line-${line.id}-variant`}
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
                        const variantId = opt?.value ?? '';
                        const vd =
                          getVariantData(variantId) ??
                          variants.find((v) => v.id === variantId);
                        onUpdateLine(line.id, {
                          variantId,
                          unitId: vd?.baseUnitId ?? vd?.sellUnitId ?? line.unitId,
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
                    onChange={(e) =>
                      onUpdateLine(line.id, { quantity: e.target.value })
                    }
                    placeholder="0"
                    type="number"
                  />

                  <SmartSelect
                    instanceId={`line-${line.id}-unit`}
                    value={line.unitId}
                    onChange={(value) => onUpdateLine(line.id, { unitId: value })}
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: buildUnitLabel(unit),
                    }))}
                    placeholder={t('unit')}
                    isClearable
                    className="nvi-select-container"
                  />

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]/80">
                      {t('unitCost')}
                    </label>
                    <CurrencyInput
                      value={line.unitCost}
                      onChange={(value) =>
                        onUpdateLine(line.id, { unitCost: value })
                      }
                      placeholder="0.00"
                      className="w-full rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
                    />
                  </div>

                  {batchTrackingEnabled ? (
                    <>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]/80">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="Hash" size={11} className="text-blue-400" />
                            {t('batchCode')}
                          </span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            value={line.batchCode}
                            onChange={(e) =>
                              onUpdateLine(line.id, { batchCode: e.target.value })
                            }
                            placeholder={t('batchCode')}
                            className="flex-1 rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)] outline-none transition-colors placeholder:text-[var(--nvi-text-muted)]/60 focus:border-blue-500/50"
                          />
                          <button
                            type="button"
                            onClick={() => onGenerateCode(line.id)}
                            disabled={
                              generatingCodeForLine === line.id ||
                              !canGenerateCode
                            }
                            className="nvi-press shrink-0 rounded-xl border border-[var(--nvi-border)] p-2 text-[var(--nvi-text-muted)] transition-colors hover:border-gold-500/50 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Generate batch code"
                          >
                            {generatingCodeForLine === line.id ? (
                              <Spinner size="xs" variant="orbit" />
                            ) : (
                              <Icon name="Wand" size={16} />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onScanTargetToggle(line.id)}
                            className={[
                              'nvi-press shrink-0 rounded-xl border p-2 transition-all',
                              scanTarget === line.id
                                ? 'border-blue-500/50 bg-blue-500/15 text-blue-400 shadow-[0_0_12px_-4px] shadow-blue-500/30'
                                : 'border-[var(--nvi-border)] text-[var(--nvi-text-muted)] hover:text-blue-400 hover:border-blue-500/30',
                            ].join(' ')}
                            title={
                              scanTarget === line.id
                                ? t('scanning')
                                : t('scanBatch')
                            }
                          >
                            <Icon name="ScanBarcode" size={16} />
                          </button>
                        </div>
                        {scanTarget === line.id && (
                          <div className="mt-2 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] px-3 py-2 nvi-bounce-in">
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                                <Icon
                                  name="ScanBarcode"
                                  size={14}
                                  className="text-blue-400 animate-pulse"
                                />
                              </div>
                              <p className="text-[11px] font-medium text-blue-300">
                                {t('scanning')}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]/80">
                          <span className="inline-flex items-center gap-1">
                            <Icon name="Calendar" size={11} className="text-amber-400" />
                            {t('expiryDate')}
                          </span>
                        </label>
                        <DatePickerInput
                          value={line.expiryDate}
                          onChange={(v) => onUpdateLine(line.id, { expiryDate: v })}
                          placeholder={t('expiryDate')}
                          className="rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)]"
                        />
                      </div>
                    </>
                  ) : null}

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nvi-text-muted)]/80">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="MessageSquare" size={11} className="text-amber-400" />
                        {t('qualityNote')}
                      </span>
                    </label>
                    <input
                      value={line.qualityNote}
                      onChange={(e) =>
                        onUpdateLine(line.id, { qualityNote: e.target.value })
                      }
                      placeholder={t('qualityNote')}
                      className="w-full rounded-xl border border-[var(--nvi-border)] bg-black px-3 py-2 text-sm text-[var(--nvi-text)] outline-none transition-colors placeholder:text-[var(--nvi-text-muted)]/60 focus:border-amber-500/40"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onAddLine}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--nvi-border)] px-4 py-2.5 text-sm text-[var(--nvi-text-muted)] transition-colors hover:border-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)] disabled:cursor-not-allowed disabled:opacity-40"
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
              className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2.5 text-sm text-[color:var(--muted)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-black shadow-lg shadow-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canWrite || isReceiving}
              title={!canWrite ? noAccess('title') : undefined}
            >
              {isReceiving ? (
                <Spinner size="xs" variant="orbit" />
              ) : (
                <Icon name="PackageCheck" size={16} />
              )}
              {isReceiving ? t('receiving') : t('recordReceiving')}
            </button>
          </div>
        </div>
      </div>
    </ModalSurface>
  );
}
