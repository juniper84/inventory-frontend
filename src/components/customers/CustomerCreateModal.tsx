'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { Spinner } from '@/components/Spinner';

type PriceList = { id: string; name: string };

type FormState = {
  name: string;
  phone: string;
  email: string;
  tin: string;
  notes: string;
  priceListId: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  form: FormState;
  onFormChange: (next: FormState) => void;

  priceLists: PriceList[];
  loadPriceListOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;

  onSubmit: () => void;
  isCreating: boolean;
  canCreate: boolean;
};

export function CustomerCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  priceLists,
  loadPriceListOptions,
  onSubmit,
  isCreating,
  canCreate,
}: Props) {
  const t = useTranslations('customersPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="customer-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="UserPlus" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="customer-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createCustomer')}
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
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            label={t('name')}
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            placeholder={t('name')}
          />
          <div>
            <TextInput
              label={t('phoneOptional')}
              value={form.phone}
              onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
              placeholder="+255..."
              type="tel"
            />
            <p className="mt-0.5 px-1 text-[10px] text-gold-500">
              {t('phoneCountryCodeHint')}
            </p>
          </div>
          <TextInput
            label={t('emailOptional')}
            value={form.email}
            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
            placeholder={t('emailOptional')}
            type="email"
          />
          <TextInput
            label={t('tinOptional')}
            value={form.tin}
            onChange={(e) => onFormChange({ ...form, tin: e.target.value })}
            placeholder={t('tinOptional')}
          />
          <TextInput
            label={t('notesOptional')}
            value={form.notes}
            onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
            placeholder={t('notesOptional')}
          />
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
              {t('defaultPriceList')}
            </label>
            <AsyncSmartSelect
              instanceId="customer-create-pricelist"
              value={
                form.priceListId
                  ? {
                      value: form.priceListId,
                      label:
                        priceLists.find((l) => l.id === form.priceListId)
                          ?.name ?? '',
                    }
                  : null
              }
              onChange={(opt) =>
                onFormChange({ ...form, priceListId: opt?.value ?? '' })
              }
              loadOptions={loadPriceListOptions}
              defaultOptions={priceLists.map((list) => ({
                value: list.id,
                label: list.name,
              }))}
              placeholder={t('defaultPriceList')}
              isClearable
              className="nvi-select-container"
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
            disabled={isCreating || !canCreate || !form.name.trim()}
            title={!canCreate ? noAccess('title') : undefined}
            className="nvi-cta nvi-press rounded-xl px-4 py-2 font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isCreating ? (
                <Spinner variant="orbit" size="xs" />
              ) : (
                <Icon name="UserPlus" size={16} />
              )}
              {isCreating ? t('creating') : t('createCustomer')}
            </span>
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
