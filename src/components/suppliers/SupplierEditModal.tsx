'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput, Textarea, AvatarInitials } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export type SupplierEditDraft = {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  leadTimeDays?: number | null;
  status: SupplierStatus;
};

type Props = {
  open: boolean;
  onClose: () => void;
  draft: SupplierEditDraft | null;
  onDraftChange: (next: SupplierEditDraft) => void;
  onSubmit: () => void;
  isSaving: boolean;
  canWrite: boolean;
};

export function SupplierEditModal({
  open,
  onClose,
  draft,
  onDraftChange,
  onSubmit,
  isSaving,
  canWrite,
}: Props) {
  const t = useTranslations('suppliersPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');

  if (!draft) return null;

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="supplier-edit-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-1">
              <AvatarInitials name={draft.name} size="lg" />
            </div>
            <div>
              <h2
                id="supplier-edit-title"
                className="text-lg font-semibold text-[color:var(--foreground)]"
              >
                {t('editSupplier') ?? actions('edit')}
              </h2>
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                {draft.name}
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
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            label={t('name')}
            value={draft.name}
            onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
          />
          <TextInput
            label={t('phoneOptional')}
            value={draft.phone ?? ''}
            onChange={(e) => onDraftChange({ ...draft, phone: e.target.value })}
            placeholder="+255..."
            type="tel"
          />
          <TextInput
            label={t('emailOptional')}
            value={draft.email ?? ''}
            onChange={(e) => onDraftChange({ ...draft, email: e.target.value })}
            type="email"
          />
          <TextInput
            label={t('addressOptional')}
            value={draft.address ?? ''}
            onChange={(e) =>
              onDraftChange({ ...draft, address: e.target.value })
            }
            className="md:col-span-2"
          />
          <TextInput
            label={t('leadTimeDays')}
            value={String(draft.leadTimeDays ?? '')}
            onChange={(e) =>
              onDraftChange({
                ...draft,
                leadTimeDays: e.target.value ? Number(e.target.value) : null,
              })
            }
            type="number"
            min={0}
          />
          <Textarea
            label={t('notesOptional')}
            value={draft.notes ?? ''}
            onChange={(e) => onDraftChange({ ...draft, notes: e.target.value })}
            rows={2}
            className="md:col-span-2"
          />
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gold-300/80">
              {common('status')}
            </label>
            <SmartSelect
              instanceId={`supplier-${draft.id}-status`}
              value={draft.status}
              onChange={(value) =>
                onDraftChange({
                  ...draft,
                  status: value as SupplierStatus,
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-sm text-[var(--nvi-text)] transition-colors hover:border-[var(--nvi-accent)] disabled:opacity-50"
          >
            <Icon name="X" size={14} />
            {actions('cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isSaving || !canWrite || !draft.name.trim()}
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isSaving ? (
              <Spinner size="xs" variant="pulse" />
            ) : (
              <Icon name="Check" size={14} />
            )}
            {isSaving ? t('saving') : actions('save')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
