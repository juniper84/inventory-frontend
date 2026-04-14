'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput, Textarea } from '@/components/ui';
import { Spinner } from '@/components/Spinner';

type FormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  leadTimeDays: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  form: FormState;
  onFormChange: (next: FormState) => void;
  onSubmit: () => void;
  isCreating: boolean;
  canWrite: boolean;
};

export function SupplierCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  onSubmit,
  isCreating,
  canWrite,
}: Props) {
  const t = useTranslations('suppliersPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="supplier-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Building2" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="supplier-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createSupplier')}
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
        <div className="grid gap-4 md:grid-cols-3">
          <TextInput
            label={t('name')}
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            placeholder={t('name')}
          />
          <div className="grid gap-1.5">
            <TextInput
              label={t('phoneOptional')}
              value={form.phone}
              onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
              placeholder="+255..."
              type="tel"
            />
            <p className="px-1 text-[10px] text-[var(--nvi-text-muted)]">
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
            label={t('addressOptional')}
            value={form.address}
            onChange={(e) => onFormChange({ ...form, address: e.target.value })}
            placeholder={t('addressOptional')}
            className="md:col-span-2"
          />
          <TextInput
            label={t('leadTimeDays')}
            value={form.leadTimeDays}
            onChange={(e) =>
              onFormChange({ ...form, leadTimeDays: e.target.value })
            }
            placeholder={t('leadTimeDays')}
            type="number"
            min={0}
          />
          <Textarea
            label={t('notesOptional')}
            value={form.notes}
            onChange={(e) => onFormChange({ ...form, notes: e.target.value })}
            placeholder={t('notesOptional')}
            rows={2}
            className="md:col-span-3"
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
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreating || !canWrite || !form.name.trim()}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isCreating ? (
              <Spinner size="xs" variant="orbit" />
            ) : (
              <Icon name="Plus" size={16} />
            )}
            {isCreating ? t('creating') : t('createSupplier')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
