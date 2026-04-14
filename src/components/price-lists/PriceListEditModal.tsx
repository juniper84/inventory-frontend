'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type Status = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

type Props = {
  open: boolean;
  onClose: () => void;

  name: string;
  status: Status;
  onNameChange: (value: string) => void;
  onStatusChange: (value: Status) => void;

  instanceIdSuffix: string;

  onSubmit: () => void;
  isSaving: boolean;
  canManage: boolean;
};

export function PriceListEditModal({
  open,
  onClose,
  name,
  status,
  onNameChange,
  onStatusChange,
  instanceIdSuffix,
  onSubmit,
  isSaving,
  canManage,
}: Props) {
  const t = useTranslations('priceListsPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface open={open} onClose={onClose} labelledBy="price-list-edit-title">
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Pencil" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="price-list-edit-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {common('edit')}
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
        <TextInput
          label={common('name') || 'Name'}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
        <div className="grid gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {t('statusLabel')}
          </label>
          <SmartSelect
            instanceId={`pricelist-edit-status-${instanceIdSuffix}`}
            value={status}
            onChange={(value) => onStatusChange((value || 'ACTIVE') as Status)}
            options={[
              { value: 'ACTIVE', label: t('statusActive') },
              { value: 'INACTIVE', label: t('statusInactive') },
              { value: 'ARCHIVED', label: t('statusArchived') },
            ]}
            className="nvi-select-container"
          />
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
            disabled={isSaving || !canManage}
            title={!canManage ? noAccess('title') : undefined}
          >
            {isSaving ? <Spinner size="xs" variant="grid" /> : <Icon name="CircleCheck" size={14} />}
            {isSaving ? t('saving') : common('save')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
