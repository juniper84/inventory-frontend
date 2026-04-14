'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type Branch = { id: string; name: string };
type Option = { value: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;

  exportType: string;
  onExportTypeChange: (value: string) => void;
  exportTypes: Option[];

  exportFormat: string;
  onExportFormatChange: (value: string) => void;
  exportFormatOptions: Option[];

  branchId: string;
  onBranchIdChange: (value: string) => void;
  branches: Branch[];

  auditAck: boolean;
  onAuditAckChange: (value: boolean) => void;

  onSubmit: () => void;
  isCreating: boolean;
};

export function ExportCreateModal({
  open,
  onClose,
  exportType,
  onExportTypeChange,
  exportTypes,
  exportFormat,
  onExportFormatChange,
  exportFormatOptions,
  branchId,
  onBranchIdChange,
  branches,
  auditAck,
  onAuditAckChange,
  onSubmit,
  isCreating,
}: Props) {
  const t = useTranslations('exportsPage');
  const common = useTranslations('common');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="export-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Upload" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="export-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createExport')}
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

      <div className="nvi-modal-panel__body space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              {t('typeLabel')}
            </label>
            <SmartSelect
              instanceId="exports-create-type"
              value={exportType}
              onChange={onExportTypeChange}
              options={exportTypes}
              className="nvi-select-container"
            />
          </div>
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
              {t('formatLabel') || t('typeLabel')}
            </label>
            <SmartSelect
              instanceId="exports-create-format"
              value={exportFormat}
              onChange={onExportFormatChange}
              options={exportFormatOptions}
              className="nvi-select-container"
            />
          </div>
          {exportType !== 'EXPORT_ON_EXIT' ? (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">
                {common('branch')}
              </label>
              <SmartSelect
                instanceId="exports-create-branch"
                value={branchId}
                onChange={onBranchIdChange}
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: branch.name,
                }))}
                placeholder={common('branch')}
                isClearable
                className="nvi-select-container"
              />
            </div>
          ) : null}
        </div>

        {exportType === 'AUDIT_LOGS' ? (
          <label className="flex items-start gap-2 text-xs text-[color:var(--muted)]">
            <input
              type="checkbox"
              checked={auditAck}
              onChange={(event) => onAuditAckChange(event.target.checked)}
              className="mt-0.5"
            />
            <span>{t('auditAck')}</span>
          </label>
        ) : null}

        {exportType === 'EXPORT_ON_EXIT' ? (
          <div className="nvi-info-hint">
            <Icon name="Info" size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="opacity-80">{t('exportOnExitHint')}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="nvi-press rounded-xl border border-[color:var(--border)] px-4 py-2 text-xs text-[color:var(--muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="nvi-press inline-flex items-center gap-2 rounded-xl bg-[var(--nvi-accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isCreating}
          >
            {isCreating ? (
              <Spinner size="xs" variant="orbit" />
            ) : (
              <Icon name="Play" size={14} />
            )}
            {isCreating ? t('running') : t('runExport')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
