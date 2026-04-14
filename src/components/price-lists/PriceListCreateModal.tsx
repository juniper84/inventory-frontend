'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { Spinner } from '@/components/Spinner';

type Props = {
  open: boolean;
  onClose: () => void;

  name: string;
  onNameChange: (value: string) => void;

  onSubmit: () => void;
  isCreating: boolean;
  canManage: boolean;
};

export function PriceListCreateModal({
  open,
  onClose,
  name,
  onNameChange,
  onSubmit,
  isCreating,
  canManage,
}: Props) {
  const t = useTranslations('priceListsPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="price-list-create-title"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="ListOrdered" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="price-list-create-title"
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

      <div className="nvi-modal-panel__body">
        <TextInput
          label={t('namePlaceholder')}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={t('namePlaceholder')}
        />
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
            disabled={isCreating || !canManage || !name.trim()}
            title={!canManage ? noAccess('title') : undefined}
          >
            {isCreating ? <Spinner size="xs" variant="orbit" /> : <Icon name="Plus" size={14} />}
            {isCreating ? t('creating') : common('create')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
