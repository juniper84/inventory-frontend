'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type DelegateUser = { id: string; name: string; email: string };

type Props = {
  open: boolean;
  onClose: () => void;

  approvalId: string | null;
  /** Human-readable summary of the approval being delegated (e.g. "Refund · Sale REF-123"). */
  approvalSummary?: string | null;

  users: DelegateUser[];
  isBusy: boolean;

  onSubmit: (approvalId: string, userId: string) => void;
};

export function ApprovalDelegateModal({
  open,
  onClose,
  approvalId,
  approvalSummary,
  users,
  isBusy,
  onSubmit,
}: Props) {
  const t = useTranslations('approvalsPage');
  const actions = useTranslations('actions');
  const [selectedUserId, setSelectedUserId] = useState('');

  if (!approvalId) return null;

  return (
    <ModalSurface
      open={open}
      onClose={() => {
        setSelectedUserId('');
        onClose();
      }}
      labelledBy="approval-delegate-title"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="approval-delegate-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('delegate')}
            </h2>
            {approvalSummary ? (
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                {approvalSummary}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedUserId('');
              onClose();
            }}
            className="nvi-press rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[color:var(--muted)]"
            aria-label="Close"
          >
            <Icon name="X" size={14} />
          </button>
        </div>
      </div>

      <div className="nvi-modal-panel__body space-y-3">
        <p className="text-xs text-[color:var(--muted)]">{t('selectUser')}</p>
        <SmartSelect
          instanceId={`delegate-modal-${approvalId}`}
          value={selectedUserId}
          onChange={(userId) => setSelectedUserId(userId ?? '')}
          options={users.map((u) => ({
            value: u.id,
            label: `${u.name} (${u.email})`,
          }))}
          placeholder={t('selectUser')}
          className="nvi-select-container"
        />
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedUserId('');
              onClose();
            }}
            disabled={isBusy}
            className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-xs text-[color:var(--muted)]"
          >
            {actions('cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedUserId) return;
              onSubmit(approvalId, selectedUserId);
              setSelectedUserId('');
            }}
            disabled={isBusy || !selectedUserId}
            className="nvi-decision-btn nvi-decision-delegate"
          >
            {isBusy ? (
              <Spinner size="xs" variant="pulse" />
            ) : (
              <Icon name="Forward" size={14} />
            )}
            {t('delegate')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
