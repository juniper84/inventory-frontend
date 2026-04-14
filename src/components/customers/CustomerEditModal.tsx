'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput, AvatarInitials } from '@/components/ui';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

type Customer = {
  id: string;
  name: string;
  status?: CustomerStatus;
};

type PriceList = { id: string; name: string };

export type CustomerEditDraft = {
  name: string;
  phone: string;
  email: string;
  tin: string;
  notes: string;
  status: CustomerStatus;
  priceListId: string;
};

type Props = {
  open: boolean;
  onClose: () => void;

  customer: Customer | null;
  draft: CustomerEditDraft | null;
  onDraftChange: (next: CustomerEditDraft) => void;

  priceLists: PriceList[];
  loadPriceListOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;

  onSubmit: () => void;
  isSaving: boolean;
  canEdit: boolean;
};

export function CustomerEditModal({
  open,
  onClose,
  customer,
  draft,
  onDraftChange,
  priceLists,
  loadPriceListOptions,
  onSubmit,
  isSaving,
  canEdit,
}: Props) {
  const t = useTranslations('customersPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');

  if (!customer || !draft) return null;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="customer-edit-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-0.5">
              <AvatarInitials name={draft.name || customer.name} size="lg" />
            </div>
            <div>
              <h2
                id="customer-edit-title"
                className="text-lg font-semibold text-[color:var(--foreground)]"
              >
                {t('editingCustomer')}
              </h2>
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                {customer.name}
              </p>
            </div>
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
          <TextInput
            label={t('name')}
            value={draft.name}
            onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
          />
          <TextInput
            label={t('phoneOptional')}
            value={draft.phone}
            onChange={(e) => onDraftChange({ ...draft, phone: e.target.value })}
            placeholder="+255..."
            type="tel"
          />
          <TextInput
            label={t('emailOptional')}
            value={draft.email}
            onChange={(e) => onDraftChange({ ...draft, email: e.target.value })}
            type="email"
          />
          <TextInput
            label={t('tinOptional')}
            value={draft.tin}
            onChange={(e) => onDraftChange({ ...draft, tin: e.target.value })}
          />
          <TextInput
            label={t('notesOptional')}
            value={draft.notes}
            onChange={(e) => onDraftChange({ ...draft, notes: e.target.value })}
          />
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
              {t('defaultPriceList')}
            </label>
            <AsyncSmartSelect
              instanceId={`customer-edit-pricelist-${customer.id}`}
              value={
                draft.priceListId
                  ? {
                      value: draft.priceListId,
                      label:
                        priceLists.find((l) => l.id === draft.priceListId)
                          ?.name ?? '',
                    }
                  : null
              }
              onChange={(opt) =>
                onDraftChange({ ...draft, priceListId: opt?.value ?? '' })
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
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
              {t('status')}
            </label>
            <SmartSelect
              instanceId={`customer-edit-status-${customer.id}`}
              value={draft.status ?? 'ACTIVE'}
              onChange={(value) =>
                onDraftChange({
                  ...draft,
                  status: value as CustomerStatus,
                })
              }
              options={[
                { value: 'ACTIVE', label: t('statusActive') },
                { value: 'INACTIVE', label: t('statusInactive') },
                { value: 'ARCHIVED', label: t('statusArchived') },
              ]}
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
            disabled={isSaving}
            className="rounded-xl border border-gold-700/50 px-4 py-1.5 text-xs text-gold-100 nvi-press disabled:opacity-50"
          >
            {common('cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSaving || !canEdit || !draft.name.trim()}
            title={!canEdit ? noAccess('title') : undefined}
            className="nvi-cta nvi-press rounded-xl px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isSaving ? <Spinner variant="grid" size="xs" /> : null}
              {isSaving ? t('saving') : common('save')}
            </span>
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
