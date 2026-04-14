'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';

import { Spinner } from '@/components/Spinner';

import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { Banner } from '@/components/notifications/Banner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { RelatedNotesPanel } from '@/components/RelatedNotesPanel';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { ListPage, Card, Icon, ActionButtons, SortableTableHeader, SortDirection } from '@/components/ui';
import { ProductCreateModal } from '@/components/catalog/ProductCreateModal';
import { ProductEditModal, type ProductEditDraft } from '@/components/catalog/ProductEditModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = { id: string; name: string };
type ProductImage = {
  id: string;
  url: string;
  isPrimary: boolean;
  status: string;
};
type ProductVariant = {
  id: string;
  name: string;
};
type Product = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  categoryId?: string | null;
  images: ProductImage[];
  variants?: ProductVariant[];
  lastSoldAt?: string | null;
};
type VariantSummary = { id: string; name: string };
type StockSnapshot = { variantId: string; quantity: number | string };
type StockMovement = {
  id: string;
  quantity: number | string;
  movementType: string;
  createdAt: string;
  variant?: { id: string; name: string } | null;
};
// ─── Sub-components ──────────────────────────────────────────────────────────

function UploadButton({
  label,
  disabled,
  isUploading,
  onFile,
  icon,
}: {
  label: string;
  disabled: boolean;
  isUploading: boolean;
  onFile: (file: File) => void;
  icon: 'Camera' | 'Plus';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        disabled
          ? 'cursor-not-allowed border-gold-700/20 text-gold-600 opacity-50'
          : 'cursor-pointer border-gold-700/50 text-gold-300 hover:border-gold-500 hover:text-gold-100 hover:bg-gold-900/10'
      }`}
    >
      {isUploading ? (
        <Spinner variant="dots" size="xs" />
      ) : (
        <Icon name={icon} size={13} />
      )}
      <span>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onFile(file);
            e.target.value = '';
          }
        }}
      />
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'ACTIVE'
      ? 'bg-emerald-400'
      : status === 'INACTIVE'
        ? 'bg-amber-400'
        : 'bg-zinc-500';
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
      title={status}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const t = useTranslations('productsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('catalog.write');
  const common = useTranslations('common');
  const locale = useLocale();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    categoryId: '',
  });
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [uploadingProductId, setUploadingProductId] = useState<string | null>(null);
  const [imageAction, setImageAction] = useState<{
    productId: string;
    imageId: string;
    type: 'primary' | 'remove';
  } | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editDraft, setEditDraft] = useState<ProductEditDraft | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [relatedMap, setRelatedMap] = useState<
    Record<
      string,
      {
        open: boolean;
        loading: boolean;
        variants: VariantSummary[];
        stock: StockSnapshot[];
        movements: StockMovement[];
        error?: string;
      }
    >
  >({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [total, setTotal] = useState<number | null>(null);
  const { activeBranch, resolveBranchId } = useBranchScope();

  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    categoryId: '',
    hasVariants: '',
    hasImages: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const handleSort = (key: string, dir: SortDirection) => {
    setSortKey(dir ? key : null);
    setSortDir(dir);
  };

  const sortedProducts = useMemo(() => {
    if (!sortKey || !sortDir) return products;
    return [...products].sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortKey] ?? '';
      const vb = (b as Record<string, unknown>)[sortKey] ?? '';
      return sortDir === 'asc'
        ? String(va).localeCompare(String(vb), undefined, { numeric: true })
        : String(vb).localeCompare(String(va), undefined, { numeric: true });
    });
  }, [products, sortKey, sortDir]);

  const categoryOptions = useMemo(
    () => [
      { value: '', label: common('allCategories') },
      ...categories.map((category) => ({
        value: category.id,
        label: category.name,
      })),
    ],
    [categories, common],
  );

  const loadCategoryOptions = useCallback(async (inputValue: string) => {
    const token = getAccessToken();
    if (!token) return [];
    try {
      const data = await apiFetch<PaginatedResponse<Category> | Category[]>(
        `/categories?search=${encodeURIComponent(inputValue)}&limit=25`,
        { token },
      );
      return normalizePaginated(data).items.map((cat) => ({ value: cat.id, label: cat.name }));
    } catch {
      return [];
    }
  }, []);

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'INACTIVE', label: common('statusInactive') },
      { value: 'ARCHIVED', label: common('statusArchived') },
    ],
    [common],
  );

  const productStatusOptions = useMemo(
    () => [
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'INACTIVE', label: common('statusInactive') },
      { value: 'ARCHIVED', label: common('statusArchived') },
    ],
    [common],
  );

  const yesNoOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      { value: 'yes', label: common('yes') },
      { value: 'no', label: common('no') },
    ],
    [common],
  );

  const withImagesCount = useMemo(
    () =>
      products.filter((product) =>
        product.images.some((img) => img.status === 'ACTIVE'),
      ).length,
    [products],
  );

  const activeCount = useMemo(
    () => products.filter((product) => product.status === 'ACTIVE').length,
    [products],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const cats = await apiFetch<PaginatedResponse<Category> | Category[]>(
        '/categories?limit=50',
        { token },
      );
      setCategories(normalizePaginated(cats).items);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const load = async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) return;
    setIsLoading(true);
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursors[targetPage] ?? null;
      const query = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        categoryId: filters.categoryId || undefined,
        hasVariants: filters.hasVariants || undefined,
        hasImages: filters.hasImages || undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
      });
      const items = await apiFetch<PaginatedResponse<Product> | Product[]>(
        `/products${query}`,
        { token },
      );
      const productResult = normalizePaginated(items);
      setProducts(productResult.items);
      setNextCursor(productResult.nextCursor);
      if (typeof productResult.total === 'number') {
        setTotal(productResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (productResult.nextCursor) {
          nextState[targetPage + 1] = productResult.nextCursor;
        }
        return nextState;
      });
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [
    filters.search,
    filters.status,
    filters.categoryId,
    filters.hasVariants,
    filters.hasImages,
  ]);

  const createProduct = async () => {
    const token = getAccessToken();
    if (!token || !form.name.trim() || !form.categoryId) return;
    setMessage(null);
    setIsCreating(true);
    try {
      await apiFetch('/products', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || undefined,
          categoryId: form.categoryId,
        }),
      });
      setForm({ name: '', description: '', categoryId: '' });
      setFormOpen(false);
      await load(1);
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('createFailed')),
      });
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (product: Product) => {
    setEditing(product);
    setEditDraft({
      name: product.name,
      description: product.description ?? '',
      categoryId: product.categoryId ?? '',
      status: product.status,
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setEditDraft(null);
  };

  const duplicateProduct = (product: Product) => {
    setForm({
      name: `${product.name} (copy)`,
      description: product.description ?? '',
      categoryId: product.categoryId ?? '',
    });
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editing || !editDraft || !editDraft.name.trim()) return;
    setIsSavingEdit(true);
    try {
      await apiFetch(`/products/${editing.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editDraft.name.trim(),
          description: editDraft.description || undefined,
          categoryId: editDraft.categoryId || undefined,
          status: editDraft.status,
        }),
      });
      closeEdit();
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleRelated = async (productId: string) => {
    const existing = relatedMap[productId];
    if (existing?.open) {
      setRelatedMap((prev) => ({
        ...prev,
        [productId]: { ...existing, open: false },
      }));
      return;
    }
    if (existing?.variants.length) {
      setRelatedMap((prev) => ({
        ...prev,
        [productId]: { ...existing, open: true },
      }));
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setRelatedMap((prev) => ({
      ...prev,
      [productId]: { open: true, loading: true, variants: [], stock: [], movements: [] },
    }));
    try {
      const variantData = await apiFetch<
        PaginatedResponse<VariantSummary> | VariantSummary[]
      >(`/variants?limit=50&productId=${productId}`, { token });
      const variantsResult = normalizePaginated(variantData).items;
      const sampleVariants = variantsResult.slice(0, 6);
      const scopedBranchId = resolveBranchId();
      const stockData = await Promise.all(
        sampleVariants.map((variant) =>
          apiFetch<PaginatedResponse<StockSnapshot> | StockSnapshot[]>(
            `/stock?limit=10&variantId=${variant.id}${
              scopedBranchId ? `&branchId=${scopedBranchId}` : ''
            }`,
            { token },
          ),
        ),
      );
      const stockItems = stockData.flatMap((entry) =>
        normalizePaginated(entry).items,
      );
      const movementData = await Promise.all(
        sampleVariants.map((variant) =>
          apiFetch<PaginatedResponse<StockMovement> | StockMovement[]>(
            `/stock/movements?limit=5&variantId=${variant.id}${
              scopedBranchId ? `&branchId=${scopedBranchId}` : ''
            }`,
            { token },
          ),
        ),
      );
      const movementItems = movementData.flatMap((entry) =>
        normalizePaginated(entry).items,
      );
      setRelatedMap((prev) => ({
        ...prev,
        [productId]: {
          open: true,
          loading: false,
          variants: variantsResult,
          stock: stockItems,
          movements: movementItems,
        },
      }));
    } catch (err) {
      setRelatedMap((prev) => ({
        ...prev,
        [productId]: {
          open: true,
          loading: false,
          variants: [],
          stock: [],
          movements: [],
          error: getApiErrorMessage(err, t('relatedLoadFailed')),
        },
      }));
    }
  };

  const uploadProductImage = async (
    productId: string,
    file: File,
    isPrimary: boolean,
  ) => {
    const token = getAccessToken();
    if (!token) return;
    setUploadingProductId(productId);
    try {
      const presign = await apiFetch<{
        url: string;
        publicUrl: string;
        key: string;
      }>(`/products/${productId}/images/presign`, {
        token,
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });
      const uploadResponse = await fetch(presign.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error(t('uploadFailed'));
      await apiFetch(`/products/${productId}/images`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          url: presign.publicUrl,
          filename: file.name,
          mimeType: file.type,
          sizeMb: Number((file.size / (1024 * 1024)).toFixed(2)),
          isPrimary,
        }),
      });
      await load(page);
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('uploadFailed')),
      });
    } finally {
      setUploadingProductId(null);
    }
  };

  const setPrimary = async (productId: string, imageId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setImageAction({ productId, imageId, type: 'primary' });
    try {
      await apiFetch(`/products/${productId}/images/${imageId}/primary`, {
        token,
        method: 'POST',
      });
      await load(page);
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setImageAction(null);
    }
  };

  const removeImage = async (productId: string, imageId: string) => {
    const token = getAccessToken();
    if (!token) return;
    setImageAction({ productId, imageId, type: 'remove' });
    try {
      await apiFetch(`/products/${productId}/images/${imageId}/remove`, {
        token,
        method: 'POST',
      });
      await load(page);
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      setImageAction(null);
    }
  };

  const resolveCategoryName = (categoryId?: string | null) => {
    if (!categoryId) return '—';
    return categories.find((cat) => cat.id === categoryId)?.name ?? common('unknown');
  };

  function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  return (
    <>
    <ListPage
      title={t('title')}
      subtitle={t('subtitle')}
      eyebrow={t('eyebrow')}
      badges={
        <>
          <span className="status-chip">{t('badgeProducts')}</span>
          <span className="status-chip">{t('badgeMediaAware')}</span>
        </>
      }
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <button
              type="button"
              onClick={() => setFormOpen(true)}
              className="nvi-cta nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-black"
            >
              <Icon name="Plus" size={14} />
              {t('createProduct')}
            </button>
          ) : null}
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        </div>
      }
      isLoading={isLoading}
      banner={message ? <Banner message={messageText(message)} /> : null}
      kpis={
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
          {(
            [
              { icon: 'Package' as const,     tone: 'blue' as const,    label: t('kpiProducts'),     value: String(total ?? products.length),                                             accent: 'text-blue-400',    size: '2xl' },
              { icon: 'CircleCheck' as const, tone: 'emerald' as const, label: t('kpiActive'),       value: String(activeCount),                                                         accent: 'text-emerald-400', size: '2xl' },
              { icon: 'Image' as const,       tone: 'purple' as const,  label: t('kpiWithImages'),   value: String(withImagesCount),                                                     accent: 'text-purple-400',  size: '2xl' },
              { icon: 'FolderTree' as const,  tone: 'amber' as const,   label: t('kpiCatalogFocus'), value: filters.categoryId ? resolveCategoryName(filters.categoryId) : common('allCategories'), accent: 'text-amber-400',   size: 'lg'  },
            ]
          ).map((k) => (
            <Card key={k.label} padding="md" as="article">
              <div className="flex items-center gap-3">
                <div className={`nvi-kpi-icon nvi-kpi-icon--${k.tone}`}>
                  <Icon name={k.icon} size={20} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{k.label}</p>
                  <p className={`${k.size === '2xl' ? 'text-2xl' : 'text-lg'} font-bold ${k.accent}`}>{k.value}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      }
      filters={
        <ListFilters
          searchValue={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={() => pushFilters({ search: searchDraft })}
          onReset={() => resetFilters()}
          isLoading={isLoading}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
      >
        <AsyncSmartSelect
          instanceId="products-filter-category"
          value={filters.categoryId ? { value: filters.categoryId, label: categories.find((c) => c.id === filters.categoryId)?.name ?? common('unknown') } : null}
          onChange={(opt) => pushFilters({ categoryId: opt?.value ?? '' })}
          loadOptions={loadCategoryOptions}
          defaultOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
          placeholder={common('category')}
          isClearable
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="products-filter-status"
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="products-filter-has-variants"
          value={filters.hasVariants}
          onChange={(value) => pushFilters({ hasVariants: value })}
          options={yesNoOptions}
          placeholder={t('hasVariants')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="products-filter-has-images"
          value={filters.hasImages}
          onChange={(value) => pushFilters({ hasImages: value })}
          options={yesNoOptions}
          placeholder={t('hasImages')}
          className="nvi-select-container"
        />
        </ListFilters>
      }
      viewMode={viewMode}
      isEmpty={!sortedProducts.length}
      emptyIcon={<div className="nvi-float"><Icon name="Package" size={32} className="text-gold-500/40" /></div>}
      emptyTitle={t('noProducts')}
      table={
        <Card padding="md">
          <div className="overflow-auto">
            <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2 w-12" aria-label={t('images')} />
                    <SortableTableHeader label={t('productName')} sortKey="name" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <SortableTableHeader label={t('category')} sortKey="categoryId" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <SortableTableHeader label={common('status')} sortKey="status" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2">{t('images')}</th>
                    <th className="px-3 py-2">{t('variants')}</th>
                    <SortableTableHeader label={t('lastSold')} sortKey="lastSoldAt" currentSortKey={sortKey} currentDirection={sortDir} onSort={handleSort} />
                    <th className="px-3 py-2">{t('relatedRecords')}</th>
                    <th className="px-3 py-2" aria-label={actions('edit')} />
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.map((product) => {
                    const activeImages = product.images.filter(
                      (img) => img.status === 'ACTIVE',
                    );
                    const primary =
                      activeImages.find((img) => img.isPrimary) ?? activeImages[0];
                    return (
                      <tr key={product.id} className="border-t border-gold-700/20">
                        <td className="px-3 py-2">
                          <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-gold-700/40 bg-black">
                            {primary ? (
                              <img
                                src={primary.url}
                                alt={product.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-gold-500">
                                —
                              </div>
                            )}
                            {activeImages.length > 1 && (
                              <span className="absolute bottom-0 right-0 rounded-tl bg-black/80 px-1 text-[8px] font-semibold text-gold-300">
                                {activeImages.length}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-semibold">{product.name}</p>
                          {product.description && (
                            <p className="text-xs text-gold-500 line-clamp-1">{product.description}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gold-300">
                          {resolveCategoryName(product.categoryId)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5 text-xs text-gold-300">
                            <StatusDot status={product.status} />
                            {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gold-300">{activeImages.length}</td>
                        <td className="px-3 py-2 text-gold-300">{product.variants?.length ?? 0}</td>
                        <td className="px-3 py-2 text-xs text-[var(--nvi-text-muted)]">
                          {product.lastSoldAt ? timeAgo(product.lastSoldAt) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setViewMode('cards');
                              toggleRelated(product.id);
                            }}
                            className="text-xs text-gold-300 hover:text-gold-100"
                          >
                            {t('viewRelated')}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          {canWrite && (
                            <ActionButtons actions={[
                              { key: 'edit', icon: <Icon name="Pencil" size={14} className="text-blue-400" />, label: actions('edit'), onClick: () => startEdit(product) },
                              { key: 'duplicate', icon: <Icon name="Copy" size={14} className="text-gold-400" />, label: t('duplicate'), onClick: () => duplicateProduct(product) },
                            ]} size="xs" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
        </Card>
      }
      cards={
        <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
          {sortedProducts.map((product) => {
              const activeImages = product.images.filter(
                (img) => img.status === 'ACTIVE',
              );
              const primary = activeImages.find((img) => img.isPrimary);
              const extraImages = activeImages.filter((img) => !img.isPrimary);

              return (
                <Card
                  key={product.id}
                  padding="md"
                  className="space-y-3 nvi-card-hover"
                >
                  {/* ── Card header ─────────────────────────────────────── */}
                    <div className="flex items-start gap-3">
                      {/* Compact thumbnail */}
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gold-700/40 bg-black">
                        {primary ? (
                          <img
                            src={primary.url}
                            alt={product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Icon name="Package" size={18} className="text-gold-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-gold-100 leading-snug truncate">
                              {product.name}
                            </h4>
                            {/* Category as muted breadcrumb */}
                            {product.categoryId && (
                              <p className="text-[11px] text-gold-500 truncate">
                                {resolveCategoryName(product.categoryId)}
                              </p>
                            )}
                          </div>
                          {canWrite && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEdit(product)}
                                className="rounded-md p-1 text-blue-400 hover:bg-blue-500/10 transition-colors"
                                title={actions('edit')}
                              >
                                <Icon name="Pencil" size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => duplicateProduct(product)}
                                className="rounded-md p-1 text-gold-400 hover:bg-gold-500/10 transition-colors"
                                title={t('duplicate')}
                              >
                                <Icon name="Copy" size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Row 2: Status dot + metrics on one line */}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gold-400">
                          <span className="inline-flex items-center gap-1">
                            <StatusDot status={product.status} />
                            {product.status.charAt(0) + product.status.slice(1).toLowerCase()}
                          </span>
                          <span className="text-gold-600">·</span>
                          <span>{product.variants?.length ?? 0} variants</span>
                          {product.lastSoldAt && (
                            <>
                              <span className="text-gold-600">·</span>
                              <span>Sold {timeAgo(product.lastSoldAt)}</span>
                            </>
                          )}
                        </div>
                        {/* Description — single line if present */}
                        {product.description && (
                          <p className="mt-0.5 text-[11px] text-gold-600 line-clamp-1">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </div>

                  {/* ── Compact action row: Related + Images toggle ─────── */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleRelated(product.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gold-700/30 px-2 py-1 text-[11px] text-gold-300 hover:text-gold-100 hover:border-gold-600 transition-colors"
                    >
                      <Icon name="ChevronDown" size={12} className={relatedMap[product.id]?.open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      {relatedMap[product.id]?.open ? t('hideRelated') : t('viewRelated')}
                    </button>

                    {/* Images toggle — shows count if images exist */}
                    <button
                      type="button"
                      onClick={() =>
                        setRelatedMap((prev) => ({
                          ...prev,
                          [`img_${product.id}`]: {
                            ...prev[`img_${product.id}`],
                            open: !prev[`img_${product.id}`]?.open,
                            loading: false,
                            variants: [],
                            stock: [],
                            movements: [],
                          },
                        }))
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-gold-700/30 px-2 py-1 text-[11px] text-gold-300 hover:text-gold-100 hover:border-gold-600 transition-colors"
                    >
                      <Icon name="Camera" size={12} />
                      {activeImages.length > 0
                        ? `${activeImages.length} ${activeImages.length === 1 ? 'image' : 'images'}`
                        : t('images')}
                      <Icon name="ChevronDown" size={10} className={relatedMap[`img_${product.id}`]?.open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>

                  {/* ── Related records panel ────────────────────────────── */}
                  {relatedMap[product.id]?.open ? (
                    <Card padding="md" glow={false}>
                      <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                        {t('relatedRecords')}
                      </p>
                      {relatedMap[product.id]?.loading ? (
                        <div className="mt-3 flex items-center gap-2 text-xs text-gold-300">
                          <Spinner size="xs" variant="grid" /> {t('loadingRelated')}
                        </div>
                      ) : relatedMap[product.id]?.error ? (
                        <p className="mt-3 text-xs text-gold-300">
                          {relatedMap[product.id]?.error}
                        </p>
                      ) : (
                        <div className="mt-3 grid gap-4 md:grid-cols-3 text-xs text-gold-200">
                          <div className="space-y-2">
                            <p className="text-gold-100">{t('variants')}</p>
                            {relatedMap[product.id]?.variants.length ? (
                              relatedMap[product.id]?.variants.map((variant) => (
                                <div key={variant.id}>{variant.name}</div>
                              ))
                            ) : (
                              <p className="text-gold-400">{t('noVariants')}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-gold-100">
                              {t('stockOnHand')}
                              {activeBranch?.name ? ` (${activeBranch.name})` : ''}
                            </p>
                            {relatedMap[product.id]?.stock.length ? (
                              relatedMap[product.id]?.stock.map((snapshot) => (
                                <div key={snapshot.variantId}>{snapshot.quantity}</div>
                              ))
                            ) : (
                              <p className="text-gold-400">{t('noStock')}</p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <p className="text-gold-100">{t('recentMovements')}</p>
                            {relatedMap[product.id]?.movements.length ? (
                              relatedMap[product.id]?.movements.map((movement) => (
                                <div key={movement.id}>
                                  {movement.movementType} • {movement.quantity}
                                </div>
                              ))
                            ) : (
                              <p className="text-gold-400">{t('noMovements')}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  ) : null}

                  {/* ── Notes ───────────────────────────────────────────── */}
                  <RelatedNotesPanel resourceType="Product" resourceId={product.id} />

                  {/* ── Images section — collapsible ─────────────────────── */}
                  {relatedMap[`img_${product.id}`]?.open && (
                    <div className="space-y-2 border-t border-gold-700/20 pt-2">
                      {/* Hint when no primary */}
                      {!primary && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                          <Icon name="TriangleAlert" size={12} className="mt-0.5 shrink-0 text-amber-400" />
                          <p className="text-[11px] text-amber-300">{t('uploadPrimaryHint')}</p>
                        </div>
                      )}

                      {/* Compact upload buttons */}
                      <div className="flex items-center gap-2">
                        <UploadButton
                          label={primary ? t('replacePrimary') : t('primaryImage')}
                          disabled={!canWrite || uploadingProductId === product.id}
                          isUploading={uploadingProductId === product.id}
                          icon="Camera"
                          onFile={(file) =>
                            uploadProductImage(product.id, file, true).catch((err) =>
                              setMessage({
                                action: 'save',
                                outcome: 'failure',
                                message: getApiErrorMessage(err, t('uploadFailed')),
                              }),
                            )
                          }
                        />
                        <UploadButton
                          label={t('addMoreImages')}
                          disabled={!primary || !canWrite || uploadingProductId === product.id}
                          isUploading={false}
                          icon="Plus"
                          onFile={(file) =>
                            uploadProductImage(product.id, file, false).catch((err) =>
                              setMessage({
                                action: 'save',
                                outcome: 'failure',
                                message: getApiErrorMessage(err, t('uploadFailed')),
                              }),
                            )
                          }
                        />
                      </div>

                      {/* Gallery */}
                      {activeImages.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {[...(primary ? [primary] : []), ...extraImages].map((img) => (
                            <div
                              key={img.id}
                              className="group relative overflow-hidden rounded-md border border-gold-700/40 bg-black/70"
                            >
                              <img
                                src={img.url}
                                alt={t('productImageAlt')}
                                className="h-14 w-14 object-cover"
                              />
                              {img.isPrimary && (
                                <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[8px] font-semibold text-gold-300">
                                  {t('primaryBadge')}
                                </span>
                              )}
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
                                {!img.isPrimary && (
                                  <button
                                    type="button"
                                    onClick={() => setPrimary(product.id, img.id)}
                                    disabled={
                                      !canWrite ||
                                      (imageAction?.productId === product.id &&
                                        imageAction?.imageId === img.id &&
                                        imageAction?.type === 'primary')
                                    }
                                    className="rounded bg-gold-500/20 px-1.5 py-0.5 text-[9px] text-gold-200 hover:bg-gold-500/30 disabled:opacity-50"
                                  >
                                    <span className="inline-flex items-center gap-0.5">
                                      {imageAction?.productId === product.id &&
                                      imageAction?.imageId === img.id &&
                                      imageAction?.type === 'primary' ? (
                                        <Spinner variant="pulse" size="xs" />
                                      ) : null}
                                      {imageAction?.productId === product.id &&
                                      imageAction?.imageId === img.id &&
                                      imageAction?.type === 'primary'
                                        ? t('updating')
                                        : t('makePrimary')}
                                    </span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeImage(product.id, img.id)}
                                  disabled={
                                    !canWrite ||
                                    (imageAction?.productId === product.id &&
                                      imageAction?.imageId === img.id &&
                                      imageAction?.type === 'remove')
                                  }
                                  className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                                >
                                  <span className="inline-flex items-center gap-0.5">
                                    {imageAction?.productId === product.id &&
                                    imageAction?.imageId === img.id &&
                                    imageAction?.type === 'remove' ? (
                                      <Spinner variant="bars" size="xs" />
                                    ) : null}
                                    {imageAction?.productId === product.id &&
                                    imageAction?.imageId === img.id &&
                                    imageAction?.type === 'remove'
                                      ? t('removing')
                                      : actions('remove')}
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
        </div>
      }
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={products.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={Boolean(nextCursor)}
          hasPrev={page > 1}
          isLoading={isLoading}
          onPageChange={(nextPage) => load(nextPage)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setPageCursors({ 1: null });
            setTotal(null);
            load(1, size);
          }}
        />
      }
    />

    <ProductCreateModal
      open={formOpen}
      onClose={() => setFormOpen(false)}
      form={form}
      onFormChange={setForm}
      categories={categories}
      loadCategoryOptions={loadCategoryOptions}
      onSubmit={createProduct}
      isCreating={isCreating}
      canWrite={canWrite}
      wizardHref={`/${locale}/catalog/products/wizard`}
      importsHref={`/${locale}/imports`}
    />

    <ProductEditModal
      open={Boolean(editing)}
      onClose={closeEdit}
      product={editing}
      draft={editDraft}
      onDraftChange={setEditDraft}
      categories={categories}
      loadCategoryOptions={loadCategoryOptions}
      statusOptions={productStatusOptions}
      onSubmit={saveEdit}
      isSaving={isSavingEdit}
      canWrite={canWrite}
    />
    </>
  );
}
