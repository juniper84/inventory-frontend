'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { PaginationControls } from '@/components/PaginationControls';
import { StatusBanner } from '@/components/StatusBanner';
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
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

// ─── Types ───────────────────────────────────────────────────────────────────

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
type VariantSummary = { id: string; name: string };
type StockSnapshot = { variantId: string; quantity: number | string };
type StockMovement = {
  id: string;
  quantity: number | string;
  movementType: string;
  createdAt: string;
  variant?: { id: string; name: string } | null;
};
type EditDraft = {
  name: string;
  description: string;
  categoryId: string;
  status: string;
  saving: boolean;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const style =
    status === 'ACTIVE'
      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
      : status === 'ARCHIVED'
        ? 'bg-red-500/15 border-red-500/30 text-red-400'
        : 'bg-gold-700/20 border-gold-700/30 text-gold-400';
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {status}
    </span>
  );
}

function UploadZone({
  label,
  hint,
  disabled,
  isUploading,
  onFile,
}: {
  label: string;
  hint: string;
  disabled: boolean;
  isUploading: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' '))
          inputRef.current?.click();
      }}
      className={`relative flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center transition-colors select-none ${
        disabled
          ? 'cursor-not-allowed border-gold-700/20 opacity-40'
          : 'cursor-pointer border-gold-700/50 hover:border-gold-500 hover:bg-gold-900/10'
      }`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-6 w-6 text-gold-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <p className="text-xs font-medium text-gold-300">{label}</p>
      <p className="text-[10px] text-gold-500">{hint}</p>
      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/70">
          <Spinner variant="dots" size="xs" />
        </div>
      )}
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
    </div>
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
  const router = useRouter();
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
  const [editMap, setEditMap] = useState<Record<string, EditDraft>>({});
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
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
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
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

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

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

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
    setEditMap((prev) => ({
      ...prev,
      [product.id]: {
        name: product.name,
        description: product.description ?? '',
        categoryId: product.categoryId ?? '',
        status: product.status,
        saving: false,
      },
    }));
  };

  const cancelEdit = (productId: string) => {
    setEditMap((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const saveEdit = async (productId: string) => {
    const token = getAccessToken();
    const draft = editMap[productId];
    if (!token || !draft || !draft.name.trim()) return;
    setEditMap((prev) => ({ ...prev, [productId]: { ...draft, saving: true } }));
    try {
      await apiFetch(`/products/${productId}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description || undefined,
          categoryId: draft.categoryId || undefined,
          status: draft.status,
        }),
      });
      cancelEdit(productId);
      await load(page);
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
    } catch (err) {
      setEditMap((prev) => ({ ...prev, [productId]: { ...draft, saving: false } }));
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
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

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">{t('badgeProducts')}</span>
            <span className="status-chip">{t('badgeMediaAware')}</span>
          </>
        }
        actions={
          <ViewToggle
            value={viewMode}
            onChange={setViewMode}
            labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
          />
        }
      />
      {message ? <StatusBanner message={message} /> : null}

      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiProducts')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{total ?? products.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiActive')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{activeCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiWithImages')}</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{withImagesCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">{t('kpiCatalogFocus')}</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">
            {filters.categoryId ? resolveCategoryName(filters.categoryId) : common('allCategories')}
          </p>
        </article>
      </div>

      {/* Filters */}
      <div className="command-card nvi-reveal nvi-panel p-4">
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
            value={filters.categoryId ? { value: filters.categoryId, label: categories.find((c) => c.id === filters.categoryId)?.name ?? filters.categoryId } : null}
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
      </div>

      {/* Quick create */}
      <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('newProduct')}</h3>
        <p className="text-xs text-gold-400">{t('wizardHint')}</p>
        <button
          type="button"
          onClick={() => router.push(`/${locale}/catalog/products/wizard`)}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canWrite}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {t('openWizard')}
        </button>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder={t('productName')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder={t('description')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <AsyncSmartSelect
            instanceId="product-create-category"
            value={form.categoryId ? { value: form.categoryId, label: categories.find((c) => c.id === form.categoryId)?.name ?? '' } : null}
            onChange={(opt) => setForm({ ...form, categoryId: opt?.value ?? '' })}
            loadOptions={loadCategoryOptions}
            defaultOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder={t('category')}
            className="nvi-select-container"
          />
        </div>
        <button
          type="button"
          onClick={createProduct}
          disabled={!canWrite || isCreating || !form.name.trim() || !form.categoryId}
          title={!canWrite ? noAccess('title') : undefined}
          className="nvi-cta rounded px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center gap-2">
            {isCreating ? <Spinner variant="orbit" size="xs" /> : null}
            {isCreating ? t('creating') : t('createProduct')}
          </span>
        </button>
      </div>

      {/* Table view */}
      {viewMode === 'table' ? (
        <div className="command-card nvi-panel p-4 nvi-reveal">
          {!products.length ? (
            <StatusBanner message={t('noProducts')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2 w-12" aria-label={t('images')} />
                    <th className="px-3 py-2">{t('productName')}</th>
                    <th className="px-3 py-2">{t('category')}</th>
                    <th className="px-3 py-2">{common('status')}</th>
                    <th className="px-3 py-2">{t('images')}</th>
                    <th className="px-3 py-2">{t('relatedRecords')}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const activeImages = product.images.filter(
                      (img) => img.status === 'ACTIVE',
                    );
                    const primary =
                      activeImages.find((img) => img.isPrimary) ?? activeImages[0];
                    return (
                      <tr key={product.id} className="border-t border-gold-700/20">
                        <td className="px-3 py-2">
                          <div className="relative h-9 w-9 overflow-hidden rounded border border-gold-700/40 bg-black">
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
                          <StatusBadge status={product.status} />
                        </td>
                        <td className="px-3 py-2 text-gold-300">{activeImages.length}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* Cards view */}
      {viewMode === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {products.length === 0 ? (
            <StatusBanner message={t('noProducts')} />
          ) : (
            products.map((product) => {
              const activeImages = product.images.filter(
                (img) => img.status === 'ACTIVE',
              );
              const primary = activeImages.find((img) => img.isPrimary);
              const extraImages = activeImages.filter((img) => !img.isPrimary);
              const draft = editMap[product.id];
              const isEditing = Boolean(draft);

              return (
                <div
                  key={product.id}
                  className="command-card nvi-panel p-4 space-y-4 nvi-reveal"
                >
                  {/* ── Card header ─────────────────────────────────────── */}
                  {isEditing ? (
                    /* Edit form */
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        {/* Keep thumbnail visible in edit mode */}
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-gold-700/40 bg-black">
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
                          <input
                            value={draft.name}
                            onChange={(e) =>
                              setEditMap((prev) => ({
                                ...prev,
                                [product.id]: { ...draft, name: e.target.value },
                              }))
                            }
                            placeholder={t('productName')}
                            className="w-full rounded border border-gold-700/50 bg-black px-3 py-1.5 text-sm text-gold-100"
                          />
                          <input
                            value={draft.description}
                            onChange={(e) =>
                              setEditMap((prev) => ({
                                ...prev,
                                [product.id]: { ...draft, description: e.target.value },
                              }))
                            }
                            placeholder={t('description')}
                            className="w-full rounded border border-gold-700/50 bg-black px-3 py-1.5 text-sm text-gold-100"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <AsyncSmartSelect
                              instanceId={`edit-category-${product.id}`}
                              value={draft.categoryId ? { value: draft.categoryId, label: categories.find((c) => c.id === draft.categoryId)?.name ?? '' } : null}
                              onChange={(opt) =>
                                setEditMap((prev) => ({
                                  ...prev,
                                  [product.id]: { ...draft, categoryId: opt?.value ?? '' },
                                }))
                              }
                              loadOptions={loadCategoryOptions}
                              defaultOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
                              placeholder={t('category')}
                              className="nvi-select-container"
                            />
                            <SmartSelect
                              instanceId={`edit-status-${product.id}`}
                              value={draft.status}
                              onChange={(value) =>
                                setEditMap((prev) => ({
                                  ...prev,
                                  [product.id]: { ...draft, status: value },
                                }))
                              }
                              options={productStatusOptions}
                              placeholder={common('status')}
                              className="nvi-select-container"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => saveEdit(product.id)}
                          disabled={!draft.name.trim() || draft.saving}
                          className="nvi-cta rounded px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-70"
                        >
                          <span className="inline-flex items-center gap-2">
                            {draft.saving ? <Spinner variant="orbit" size="xs" /> : null}
                            {draft.saving ? actions('saving') : actions('save')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelEdit(product.id)}
                          disabled={draft.saving}
                          className="rounded border border-gold-700/50 px-4 py-1.5 text-sm text-gold-300 hover:text-gold-100 disabled:opacity-50"
                        >
                          {actions('cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Read-only header */
                    <div className="flex items-start gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-gold-700/40 bg-black">
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
                        {activeImages.length > 1 && (
                          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 py-0.5 text-[9px] font-semibold text-gold-300">
                            {activeImages.length}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-base font-semibold text-gold-100 leading-snug">
                            {product.name}
                          </h4>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => startEdit(product)}
                              className="shrink-0 rounded border border-gold-700/50 px-2 py-0.5 text-xs text-gold-400 hover:text-gold-100"
                            >
                              {actions('edit')}
                            </button>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <StatusBadge status={product.status} />
                          {product.categoryId && (
                            <span className="text-xs text-gold-400">
                              {resolveCategoryName(product.categoryId)}
                            </span>
                          )}
                        </div>
                        {product.description ? (
                          <p className="mt-1.5 text-xs text-gold-500 line-clamp-2">
                            {product.description}
                          </p>
                        ) : (
                          <p className="mt-1.5 text-xs text-gold-600 italic">
                            {t('noDescription')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── View related button ──────────────────────────────── */}
                  <button
                    type="button"
                    onClick={() => toggleRelated(product.id)}
                    className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
                  >
                    {relatedMap[product.id]?.open ? t('hideRelated') : t('viewRelated')}
                  </button>

                  {/* ── Related records panel ────────────────────────────── */}
                  {relatedMap[product.id]?.open ? (
                    <div className="rounded border border-gold-700/40 bg-black/60 p-4 space-y-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                        {t('relatedRecords')}
                      </p>
                      {relatedMap[product.id]?.loading ? (
                        <div className="flex items-center gap-2 text-xs text-gold-300">
                          <Spinner size="xs" variant="grid" /> {t('loadingRelated')}
                        </div>
                      ) : relatedMap[product.id]?.error ? (
                        <p className="text-xs text-gold-300">
                          {relatedMap[product.id]?.error}
                        </p>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-3 text-xs text-gold-200">
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
                    </div>
                  ) : null}

                  {/* ── Notes ───────────────────────────────────────────── */}
                  <RelatedNotesPanel resourceType="Product" resourceId={product.id} />

                  {/* ── Images section ───────────────────────────────────── */}
                  <div className="space-y-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                      {t('images')}
                    </p>

                    {/* Hint when no primary */}
                    {!primary && (
                      <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <p className="text-xs text-amber-300">{t('uploadPrimaryHint')}</p>
                      </div>
                    )}

                    {/* Upload zones */}
                    <div className="grid grid-cols-2 gap-3">
                      <UploadZone
                        label={primary ? t('replacePrimary') : t('primaryImage')}
                        hint={t('uploadZoneHint')}
                        disabled={!canWrite || uploadingProductId === product.id}
                        isUploading={uploadingProductId === product.id}
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
                      <UploadZone
                        label={t('addMoreImages')}
                        hint={t('uploadZoneHint')}
                        disabled={!primary || !canWrite || uploadingProductId === product.id}
                        isUploading={false}
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
                    {activeImages.length > 0 ? (
                      <div className="flex flex-wrap gap-3">
                        {[...(primary ? [primary] : []), ...extraImages].map((img) => (
                          <div
                            key={img.id}
                            className="group relative overflow-hidden rounded border border-gold-700/40 bg-black/70"
                          >
                            <img
                              src={img.url}
                              alt={t('productImageAlt')}
                              className="h-16 w-16 object-cover"
                            />
                            {img.isPrimary && (
                              <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5 text-center text-[9px] font-semibold text-gold-300">
                                {t('primaryBadge')}
                              </span>
                            )}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
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
                                  className="rounded bg-gold-500/20 px-2 py-0.5 text-[10px] text-gold-200 hover:bg-gold-500/30 disabled:opacity-50"
                                >
                                  <span className="inline-flex items-center gap-1">
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
                                className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                              >
                                <span className="inline-flex items-center gap-1">
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
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}

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
    </section>
  );
}
