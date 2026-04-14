'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { Spinner } from '@/components/Spinner';

type Category = { id: string; name: string };

type FormState = {
  name: string;
  description: string;
  categoryId: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  form: FormState;
  onFormChange: (next: FormState) => void;
  categories: Category[];
  loadCategoryOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  onSubmit: () => void;
  isCreating: boolean;
  canWrite: boolean;
  wizardHref: string;
  importsHref: string;
};

export function ProductCreateModal({
  open,
  onClose,
  form,
  onFormChange,
  categories,
  loadCategoryOptions,
  onSubmit,
  isCreating,
  canWrite,
  wizardHref,
  importsHref,
}: Props) {
  const t = useTranslations('productsPage');
  const noAccess = useTranslations('noAccess');

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="product-create-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="Plus" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="product-create-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {t('createProduct')}
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
        <p className="text-xs text-gold-400">{t('wizardHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={wizardHref}
            onClick={onClose}
            className={`rounded-xl border border-gold-700/50 px-3 py-2 text-xs text-gold-100 ${!canWrite ? 'pointer-events-none opacity-70' : ''}`}
            title={!canWrite ? noAccess('title') : undefined}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="Wand" size={14} />
              {t('openWizard')}
            </span>
          </Link>
          <Link
            href={importsHref}
            onClick={onClose}
            className="rounded-xl border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon name="Upload" size={14} />
              {t('bulkImport')}
            </span>
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            label={t('productName')}
            value={form.name}
            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            placeholder={t('productName')}
          />
          <TextInput
            label={t('description')}
            value={form.description}
            onChange={(e) =>
              onFormChange({ ...form, description: e.target.value })
            }
            placeholder={t('description')}
          />
          <AsyncSmartSelect
            instanceId="product-create-category"
            value={
              form.categoryId
                ? {
                    value: form.categoryId,
                    label:
                      categories.find((c) => c.id === form.categoryId)?.name ??
                      '',
                  }
                : null
            }
            onChange={(opt) =>
              onFormChange({ ...form, categoryId: opt?.value ?? '' })
            }
            loadOptions={loadCategoryOptions}
            defaultOptions={categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            placeholder={t('category')}
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
            disabled={
              !canWrite || isCreating || !form.name.trim() || !form.categoryId
            }
            title={!canWrite ? noAccess('title') : undefined}
            className="nvi-cta nvi-press rounded-xl px-4 py-2 font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isCreating ? (
                <Spinner variant="orbit" size="xs" />
              ) : (
                <Icon name="Plus" size={14} />
              )}
              {isCreating ? t('creating') : t('createProduct')}
            </span>
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
