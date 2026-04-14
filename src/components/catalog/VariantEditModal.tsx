'use client';

import { useTranslations } from 'next-intl';
import { promptAction } from '@/lib/app-notifications';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { UnitHelpPanel } from '@/components/ui/UnitHelpPanel';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import type { Unit } from '@/lib/units';

type Variant = {
  id: string;
  name: string;
  sku?: string | null;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  conversionFactor?: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  variant: Variant | null;
  units: Unit[];
  canWrite: boolean;

  /** Calls PUT /variants/:id. */
  onUpdate: (
    variantId: string,
    data: {
      baseUnitId?: string;
      sellUnitId?: string;
      conversionFactor?: number;
    },
  ) => Promise<void>;

  /** Calls POST /variants/:id/sku with approval check. */
  onReassignSku: (
    variantId: string,
    sku: string,
    reason: string,
  ) => Promise<void>;

  /** Uploads a file (presign → S3 → register). */
  onUploadImage: (variantId: string, file: File) => Promise<void>;

  uploadingVariantId: string | null;

  onError: (message: string) => void;
  onWarn: (message: string) => void;
};

export function VariantEditModal({
  open,
  onClose,
  variant,
  units,
  canWrite,
  onUpdate,
  onReassignSku,
  onUploadImage,
  uploadingVariantId,
  onError,
  onWarn,
}: Props) {
  const t = useTranslations('variantsPage');
  const noAccess = useTranslations('noAccess');

  if (!variant) return null;

  const unitOptions = units.map((u) => ({
    value: u.id,
    label: u.label || u.code,
  }));

  const resolvedSellUnitId = variant.sellUnitId ?? variant.baseUnitId ?? '';
  const conversionDisabled = resolvedSellUnitId === variant.baseUnitId;

  const handleSkuKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const sku = event.currentTarget.value.trim();
    if (!sku) return;
    const input = event.currentTarget;
    promptAction({
      message: t('skuReassignPrompt'),
      placeholder: t('requiredPlaceholder'),
    }).then((reason) => {
      if (!reason) {
        onWarn(t('skuReasonRequired'));
        return;
      }
      onReassignSku(variant.id, sku, reason).catch((err) => {
        onError(
          err instanceof Error
            ? err.message
            : t('skuReassignFailed'),
        );
      });
      input.value = '';
    });
  };

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="variant-edit-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="variant-edit-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('advanced')}
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {variant.name}
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
        <UnitHelpPanel mode="full" />

        <div className="grid gap-3 text-xs text-gold-200 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-gold-400">{t('baseUnit')}</span>
            <SmartSelect
              instanceId={`variant-base-unit-${variant.id}`}
              value={variant.baseUnitId ?? ''}
              onChange={(value) =>
                onUpdate(variant.id, {
                  baseUnitId: value,
                  sellUnitId:
                    variant.sellUnitId && variant.sellUnitId !== value
                      ? variant.sellUnitId
                      : value,
                  conversionFactor:
                    variant.sellUnitId === value
                      ? 1
                      : variant.conversionFactor ?? 1,
                }).catch((err) =>
                  onError(
                    err instanceof Error ? err.message : t('updateFailed'),
                  ),
                )
              }
              options={unitOptions}
              placeholder={t('baseUnit')}
              className="nvi-select-container"
            />
          </label>
          <label className="space-y-1">
            <span className="text-gold-400">{t('sellUnit')}</span>
            <SmartSelect
              instanceId={`variant-sell-unit-${variant.id}`}
              value={resolvedSellUnitId}
              onChange={(value) =>
                onUpdate(variant.id, {
                  sellUnitId: value,
                  conversionFactor:
                    value === variant.baseUnitId
                      ? 1
                      : variant.conversionFactor ?? 1,
                }).catch((err) =>
                  onError(
                    err instanceof Error ? err.message : t('updateFailed'),
                  ),
                )
              }
              options={unitOptions}
              placeholder={t('sellUnit')}
              className="nvi-select-container"
            />
          </label>
          <label className="space-y-1">
            <span className="text-gold-400">{t('sellToBaseFactor')}</span>
            <TextInput
              value={String(variant.conversionFactor ?? 1)}
              onChange={(event) =>
                onUpdate(variant.id, {
                  conversionFactor: Number(event.target.value || 1),
                }).catch((err) =>
                  onError(
                    err instanceof Error ? err.message : t('updateFailed'),
                  ),
                )
              }
              disabled={conversionDisabled}
            />
            <p className="text-[10px] text-gold-400">{t('conversionHint')}</p>
          </label>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-[var(--nvi-text-muted)]">
            {t('skuReassignTitle')}
          </p>
          <TextInput
            placeholder={t('newSku')}
            onKeyDown={handleSkuKeyDown}
            disabled={!canWrite}
          />
          <p className="text-[10px] text-gold-400">
            {t('skuReassignPrompt')}
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-[var(--nvi-text-muted)]">
            {t('variantImage')}
          </p>
          <label
            className="nvi-press inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--nvi-border)] px-3 py-1.5 text-xs text-gold-200 hover:border-gold-500 transition-colors"
            title={!canWrite ? noAccess('title') : undefined}
          >
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onUploadImage(variant.id, file).catch((err) =>
                    onError(
                      err instanceof Error
                        ? err.message
                        : t('variantImageFailed'),
                    ),
                  );
                }
              }}
              disabled={!canWrite}
            />
            {uploadingVariantId === variant.id ? (
              <span className="inline-flex items-center gap-2">
                <Spinner variant="dots" size="xs" />
                {t('uploadingImage')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="Upload" size={12} />
                {t('uploadImage')}
              </span>
            )}
          </label>
        </div>
      </div>
    </ModalSurface>
  );
}
