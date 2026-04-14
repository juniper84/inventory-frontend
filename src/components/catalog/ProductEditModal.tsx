'use client';

import { useTranslations } from 'next-intl';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';

type Category = { id: string; name: string };
type ProductImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  status: string;
};
type Product = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  categoryId?: string | null;
  images: ProductImage[];
};

export type ProductEditDraft = {
  name: string;
  description: string;
  categoryId: string;
  status: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  draft: ProductEditDraft | null;
  onDraftChange: (next: ProductEditDraft) => void;
  categories: Category[];
  loadCategoryOptions: (
    input: string,
  ) => Promise<{ value: string; label: string }[]>;
  statusOptions: { value: string; label: string }[];
  onSubmit: () => void;
  isSaving: boolean;
  canWrite: boolean;
};

export function ProductEditModal({
  open,
  onClose,
  product,
  draft,
  onDraftChange,
  categories,
  loadCategoryOptions,
  statusOptions,
  onSubmit,
  isSaving,
  canWrite,
}: Props) {
  const t = useTranslations('productsPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');

  if (!product || !draft) return null;

  const activeImages = product.images.filter((img) => img.status === 'ACTIVE');
  const primary = activeImages.find((img) => img.isPrimary) ?? activeImages[0];

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="product-edit-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2
              id="product-edit-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {actions('edit')}
            </h2>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {product.name}
            </p>
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
        <div className="flex items-start gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gold-700/40 bg-black">
            {primary ? (
              <img
                src={primary.url}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-gold-500">
                {t('noImage')}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <TextInput
              label={t('productName')}
              value={draft.name}
              onChange={(e) =>
                onDraftChange({ ...draft, name: e.target.value })
              }
              placeholder={t('productName')}
            />
            <TextInput
              label={t('description')}
              value={draft.description}
              onChange={(e) =>
                onDraftChange({ ...draft, description: e.target.value })
              }
              placeholder={t('description')}
            />
            <div className="grid grid-cols-2 gap-2">
              <AsyncSmartSelect
                instanceId={`edit-category-${product.id}`}
                value={
                  draft.categoryId
                    ? {
                        value: draft.categoryId,
                        label:
                          categories.find((c) => c.id === draft.categoryId)
                            ?.name ?? '',
                      }
                    : null
                }
                onChange={(opt) =>
                  onDraftChange({ ...draft, categoryId: opt?.value ?? '' })
                }
                loadOptions={loadCategoryOptions}
                defaultOptions={categories.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                placeholder={t('category')}
                className="nvi-select-container"
              />
              <SmartSelect
                instanceId={`edit-status-${product.id}`}
                value={draft.status}
                onChange={(value) => onDraftChange({ ...draft, status: value })}
                options={statusOptions}
                placeholder={common('status')}
                className="nvi-select-container"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-xl border border-gold-700/50 px-4 py-2 text-xs text-gold-300 hover:text-gold-100 disabled:opacity-50"
          >
            {actions('cancel')}
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canWrite || isSaving || !draft.name.trim()}
            title={!canWrite ? noAccess('title') : undefined}
            className="nvi-cta nvi-press rounded-xl px-4 py-2 text-xs font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isSaving ? (
                <Spinner variant="orbit" size="xs" />
              ) : (
                <Icon name="CircleCheck" size={14} />
              )}
              {isSaving ? actions('saving') : actions('save')}
            </span>
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
