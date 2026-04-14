'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, StatusBadge, type IconName } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type DocItem = {
  id: string;
  status: string;
  createdAt?: string;
  supplier?: { id: string; name: string } | null;
};
type TargetType = 'purchase' | 'purchaseOrder';

type Props = {
  open: boolean;
  onClose: () => void;

  targetType: TargetType;
  onTargetTypeChange: (value: TargetType) => void;

  targetId: string;
  onTargetIdChange: (value: string) => void;

  purchases: DocItem[];
  purchaseOrders: DocItem[];
  formatDocLabel: (item: DocItem) => string;

  file: File | null;
  onFileSelected: (file: File) => void;
  onClearFile: () => void;

  isDragging: boolean;
  onDragStateChange: (value: boolean) => void;

  getFileIcon: (mime: string) => IconName;
  getFileIconColor: (mime: string) => string;

  onSubmit: () => void;
  isUploading: boolean;
  canWrite: boolean;
};

export function AttachmentUploadModal({
  open,
  onClose,
  targetType,
  onTargetTypeChange,
  targetId,
  onTargetIdChange,
  purchases,
  purchaseOrders,
  formatDocLabel,
  file,
  onFileSelected,
  onClearFile,
  isDragging,
  onDragStateChange,
  getFileIcon,
  getFileIconColor,
  onSubmit,
  isUploading,
  canWrite,
}: Props) {
  const t = useTranslations('attachmentsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="attachment-upload-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Upload" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="attachment-upload-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('uploadTitle')}
            </h2>
            <StatusBadge
              status={targetType === 'purchase' ? 'ACTIVE' : 'INFO'}
              label={targetType === 'purchase' ? t('purchase') : t('purchaseOrder')}
              size="xs"
            />
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
        <div className="grid gap-3 md:grid-cols-3">
          <SmartSelect
            instanceId="attachment-target-type"
            value={targetType}
            onChange={(value) => onTargetTypeChange(value as TargetType)}
            options={[
              { value: 'purchase', label: t('purchase') },
              { value: 'purchaseOrder', label: t('purchaseOrder') },
            ]}
          />
          <SmartSelect
            instanceId="attachment-target-id"
            value={targetId}
            onChange={onTargetIdChange}
            placeholder={t('selectDocument')}
            options={(targetType === 'purchase' ? purchases : purchaseOrders).map((item) => ({
              value: item.id,
              label: formatDocLabel(item),
            }))}
            isClearable
            className="md:col-span-2"
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            onDragStateChange(true);
          }}
          onDragLeave={() => onDragStateChange(false)}
          onDrop={(e) => {
            e.preventDefault();
            onDragStateChange(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) onFileSelected(dropped);
          }}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all duration-200 ${
            isDragging
              ? 'border-[var(--accent)] bg-[var(--accent)]/5 scale-[1.01]'
              : 'border-[var(--nvi-border)] hover:border-gold-500/40'
          }`}
        >
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
              isDragging ? 'bg-[var(--accent)]/15' : 'bg-gold-400/10'
            }`}
          >
            <Icon name="Upload" size={24} className={isDragging ? 'text-[var(--accent)]' : 'text-gold-400'} />
          </div>
          {isDragging ? (
            <p className="text-sm font-medium text-[var(--accent)]">{t('dropZoneHint')}</p>
          ) : (
            <>
              <p className="text-sm text-[var(--nvi-text-secondary)]">{t('dropZoneLabel')}</p>
              <label className="cursor-pointer rounded-lg border border-[var(--nvi-border)] bg-[var(--nvi-bg-elevated)] px-4 py-2 text-xs font-medium text-[var(--nvi-text-primary)] transition-colors hover:border-gold-500/50">
                {t('browseFiles')}
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => {
                    const selected = event.target.files?.[0];
                    if (selected) onFileSelected(selected);
                  }}
                  className="sr-only"
                />
              </label>
              <p className="text-[11px] text-[var(--nvi-text-muted)]">{t('acceptedFormats')}</p>
            </>
          )}
        </div>

        {file ? (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--nvi-border)] bg-[var(--nvi-bg-elevated)] p-3">
            <Icon name={getFileIcon(file.type)} size={20} className={getFileIconColor(file.type)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--nvi-text-primary)]">{file.name}</p>
              <p className="text-[11px] text-[var(--nvi-text-muted)]">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={onClearFile}
              className="text-[var(--nvi-text-muted)] hover:text-red-400 transition-colors"
            >
              <Icon name="X" size={16} />
            </button>
          </div>
        ) : null}
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
            disabled={isUploading || !canWrite || !file || !targetId}
            className="nvi-press inline-flex items-center gap-2 rounded-xl bg-[var(--nvi-accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isUploading ? <Spinner size="xs" variant="orbit" /> : <Icon name="Upload" size={14} />}
            {isUploading ? t('uploading') : actions('upload')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
