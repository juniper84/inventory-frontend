'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
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

export default function ProductsPage() {
  const t = useTranslations('productsPage');
  const actions = useTranslations('actions');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('catalog.write');
  const common = useTranslations('common');
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

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
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
    () => products.filter((product) => product.images.some((img) => img.status === 'ACTIVE')).length,
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

  const load = async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
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
    const [items, cats] = await Promise.all([
      apiFetch<PaginatedResponse<Product> | Product[]>(`/products${query}`, {
        token,
      }),
      apiFetch<PaginatedResponse<Category> | Category[]>(
        '/categories?limit=200',
        { token },
      ),
    ]);
    const productResult = normalizePaginated(items);
    const categoryResult = normalizePaginated(cats);
    setProducts(productResult.items);
    setCategories(categoryResult.items);
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
    setIsLoading(false);
  };

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1).catch((err) => setMessage(getApiErrorMessage(err, t('loadFailed'))));
  }, [
    filters.search,
    filters.status,
    filters.categoryId,
    filters.hasVariants,
    filters.hasImages,
  ]);

  const createProduct = async () => {
    const token = getAccessToken();
    if (!token || !form.name.trim() || !form.categoryId) {
      return;
    }
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
    if (!token) {
      return;
    }
    setRelatedMap((prev) => ({
      ...prev,
      [productId]: {
        open: true,
        loading: true,
        variants: [],
        stock: [],
        movements: [],
      },
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
    if (!token) {
      return;
    }
    setUploadingProductId(productId);
    try {
      const presign = await apiFetch<{
        url: string;
        publicUrl: string;
        key: string;
      }>(`/products/${productId}/images/presign`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      const uploadResponse = await fetch(presign.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(t('uploadFailed'));
      }

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
    } finally {
      setUploadingProductId(null);
    }
  };

  const setPrimary = async (productId: string, imageId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setImageAction({ productId, imageId, type: 'primary' });
    await apiFetch(`/products/${productId}/images/${imageId}/primary`, {
      token,
      method: 'POST',
    });
    await load(page);
    setImageAction(null);
  };

  const removeImage = async (productId: string, imageId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setImageAction({ productId, imageId, type: 'remove' });
    await apiFetch(`/products/${productId}/images/${imageId}/remove`, {
      token,
      method: 'POST',
    });
    await load(page);
    setImageAction(null);
  };

  const resolveCategoryName = (categoryId?: string | null) => {
    if (!categoryId) {
      return '—';
    }
    return categories.find((cat) => cat.id === categoryId)?.name ?? common('unknown');
  };

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="nvi-page">
      <PremiumPageHeader
        eyebrow="Catalog command"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">Products</span>
            <span className="status-chip">Media-aware</span>
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Products</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{products.length}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Active</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{activeCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">With images</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{withImagesCount}</p>
        </article>
        <article className="kpi-card nvi-tile p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">Catalog focus</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">
            {filters.categoryId ? resolveCategoryName(filters.categoryId) : common('allCategories')}
          </p>
        </article>
      </div>
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
          <SmartSelect
            value={filters.categoryId}
            onChange={(value) => pushFilters({ categoryId: value })}
            options={categoryOptions}
            placeholder={common('category')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={filters.status}
            onChange={(value) => pushFilters({ status: value })}
            options={statusOptions}
            placeholder={common('status')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={filters.hasVariants}
            onChange={(value) => pushFilters({ hasVariants: value })}
            options={yesNoOptions}
            placeholder={t('hasVariants')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={filters.hasImages}
            onChange={(value) => pushFilters({ hasImages: value })}
            options={yesNoOptions}
            placeholder={t('hasImages')}
            className="nvi-select-container"
          />
        </ListFilters>
      </div>
      <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('newProduct')}</h3>
        <p className="text-xs text-gold-400">
          {t('wizardHint')}
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.href = `/${window.location.pathname.split('/')[1]}/catalog/products/wizard`;
          }}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={!canWrite}
          title={!canWrite ? noAccess('title') : undefined}
        >
          {t('openWizard')}
        </button>
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={form.name}
            onChange={(event) =>
              setForm({ ...form, name: event.target.value })
            }
            placeholder={t('productName')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
            placeholder={t('description')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={form.categoryId}
            onChange={(value) => setForm({ ...form, categoryId: value })}
            options={categories.map((cat) => ({
              value: cat.id,
              label: cat.name,
            }))}
            placeholder={t('category')}
            className="nvi-select-container"
          />
        </div>
        <button
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
                          <div className="h-8 w-8 overflow-hidden rounded border border-gold-700/40 bg-black">
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
                          </div>
                        </td>
                        <td className="px-3 py-2 font-semibold">{product.name}</td>
                        <td className="px-3 py-2">
                          {resolveCategoryName(product.categoryId)}
                        </td>
                        <td className="px-3 py-2">{product.status}</td>
                        <td className="px-3 py-2">{activeImages.length}</td>
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
          return (
            <div
              key={product.id}
              className="command-card nvi-panel p-4 space-y-3 nvi-reveal"
            >
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 overflow-hidden rounded border border-gold-700/40 bg-black">
                  {primary ? (
                    <img
                      src={primary.url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-gold-400">
                      {t('noImage')}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-gold-100">
                    {product.name}
                  </h4>
                  <p className="text-xs text-gold-400">{product.status}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleRelated(product.id)}
                className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
              >
                {relatedMap[product.id]?.open ? t('hideRelated') : t('viewRelated')}
              </button>
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
                          relatedMap[product.id]?.stock.map((snapshot, index) => (
                            <div key={`${snapshot.variantId}-${index}`}>
                              {snapshot.quantity}
                            </div>
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
              <RelatedNotesPanel resourceType="Product" resourceId={product.id} />
              <label className="text-xs text-gold-300">
                {t('primaryImage')}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="mt-2 block text-xs text-gold-100"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      uploadProductImage(product.id, file, true).catch((err) =>
                        setMessage(getApiErrorMessage(err, t('uploadFailed'))),
                      );
                    }
                  }}
                  disabled={!canWrite}
                />
              </label>
              {uploadingProductId === product.id ? (
                <p className="text-xs text-gold-400">
                  <span className="inline-flex items-center gap-2">
                    <Spinner variant="dots" size="xs" />
                    {t('uploadingImage')}
                  </span>
                </p>
              ) : null}
              <label className="text-xs text-gold-300">
                {t('additionalImage')}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="mt-2 block text-xs text-gold-100"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      uploadProductImage(product.id, file, false).catch((err) =>
                        setMessage(getApiErrorMessage(err, t('uploadFailed'))),
                      );
                    }
                  }}
                  disabled={!canWrite}
                />
              </label>
              {primary ? (
                <div className="space-y-2">
                  <p className="text-xs text-gold-300">{t('images')}</p>
                  <div className="flex flex-wrap gap-3">
                    {[primary, ...extraImages].map((img) => (
                      <div
                        key={img.id}
                        className="flex items-center gap-2 rounded border border-gold-700/40 bg-black/70 px-2 py-1 text-xs text-gold-100"
                      >
                        <img
                          src={img.url}
                          alt={t('productImageAlt')}
                          className="h-8 w-8 rounded object-cover"
                        />
                        {img.isPrimary ? (
                          <span className="text-gold-300">{t('primaryBadge')}</span>
                        ) : (
                          <button
                            onClick={() => setPrimary(product.id, img.id)}
                            className="rounded border border-gold-700/60 px-2 py-0.5 text-xs"
                            disabled={
                              !canWrite ||
                              imageAction?.productId === product.id &&
                              imageAction?.imageId === img.id &&
                              imageAction?.type === 'primary'
                            }
                            title={!canWrite ? noAccess('title') : undefined}
                          >
                            <span className="inline-flex items-center gap-2">
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
                          onClick={() => removeImage(product.id, img.id)}
                          className="rounded border border-gold-700/60 px-2 py-0.5 text-xs"
                          disabled={
                            !canWrite ||
                            imageAction?.productId === product.id &&
                            imageAction?.imageId === img.id &&
                            imageAction?.type === 'remove'
                          }
                          title={!canWrite ? noAccess('title') : undefined}
                        >
                            <span className="inline-flex items-center gap-2">
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
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gold-400">
                  {t('primaryRequired')}
                </p>
              )}
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
