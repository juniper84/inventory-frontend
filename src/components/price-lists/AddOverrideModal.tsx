'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { Spinner } from '@/components/Spinner';
import { formatVariantLabel } from '@/lib/display';

type PriceList = { id: string; name: string };
type Variant = {
  id: string;
  name: string;
  product?: { name?: string | null } | null;
};
type FormState = { listId: string; variantId: string; price: string };

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  lists: PriceList[];
  variants: Variant[];

  loadVariantOptions: (input: string) => Promise<{ value: string; label: string }[]>;
  getVariantOption: (id: string) => { value: string; label: string } | null;

  onSubmit: () => void;
  isAssigning: boolean;
  canManage: boolean;
};

export function AddOverrideModal({
  open,
  onClose,
  form,
  onFormChange,
  lists,
  variants,
  loadVariantOptions,
  getVariantOption,
  onSubmit,
  isAssigning,
  canManage,
}: Props) {
  const t = useTranslations('priceListsPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="price-list-add-override-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
              <Icon name="Tags" size={14} className="text-blue-400" />
            </span>
            <h2
              id="price-list-add-override-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('assignTitle')}
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

      <div className="nvi-modal-panel__body">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-blue-300/70">
              {t('selectList')}
            </label>
            <SmartSelect
              instanceId="pricelist-assign-list"
              value={form.listId}
              onChange={(value) => onFormChange({ ...form, listId: value })}
              options={lists.map((list) => ({
                value: list.id,
                label: list.name,
              }))}
              placeholder={t('selectList')}
              isClearable
              className="nvi-select-container"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-blue-300/70">
              {t('selectVariant')}
            </label>
            <AsyncSmartSelect
              instanceId="pricelist-assign-variant"
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
              onChange={(opt) => onFormChange({ ...form, variantId: opt?.value ?? '' })}
              placeholder={t('selectVariant')}
              isClearable
              className="nvi-select-container"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-blue-300/70">
              {t('price')}
            </label>
            <CurrencyInput
              value={form.price}
              onChange={(value) => onFormChange({ ...form, price: value })}
              placeholder={t('price')}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
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
            className="nvi-press inline-flex items-center gap-2 rounded-xl bg-[var(--nvi-accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isAssigning || !canManage || !form.listId || !form.variantId || !form.price}
            title={!canManage ? noAccess('title') : undefined}
          >
            {isAssigning ? <Spinner size="xs" variant="pulse" /> : <Icon name="Plus" size={14} />}
            {isAssigning ? t('saving') : t('savePrice')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
