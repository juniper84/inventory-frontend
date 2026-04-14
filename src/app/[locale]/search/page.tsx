'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState, messageText } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { Banner } from '@/components/notifications/Banner';
import { formatVariantLabel } from '@/lib/display';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { installBarcodeScanner } from '@/lib/barcode-scanner';

const RECENT_SEARCHES_KEY = 'nvi.recentSearches';

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function addRecentSearch(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  const recent = getRecentSearches().filter((s) => s !== trimmed);
  recent.unshift(trimmed);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, 10)));
}

function clearRecentSearches() {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

type SearchResults = {
  products: {
    id: string;
    name: string;
    categoryId?: string | null;
    variants: { id: string; name: string; sku?: string | null }[];
  }[];
  variants: { id: string; name: string; sku?: string | null; product?: { name?: string | null } }[];
  receipts: { id: string; receiptNumber: string }[];
  customers: { id: string; name: string; phone?: string | null; email?: string | null }[];
  transfers: {
    id: string;
    status?: string | null;
    sourceBranch?: { name?: string | null } | null;
    destinationBranch?: { name?: string | null } | null;
  }[];
};

type SavedSearch = {
  id: string;
  name: string;
  query: string;
  filters?: Record<string, string> | null;
};

type PopularItem = {
  id: string;
  name: string;
  productName?: string | null;
  salesCount: number;
};

type TypeFilterKey = 'all' | 'products' | 'customers' | 'receipts' | 'transfers';

export default function SearchPage() {
  const t = useTranslations('searchPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterKey>('all');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [message, setMessage] = useToastState();
  const [suggestions, setSuggestions] = useState<
    { id: string; label: string }[]
  >([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [popularItems, setPopularItems] = useState<PopularItem[]>([]);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const loadedRef = useRef(false);
  const totalMatches = useMemo(() => {
    if (!results) {
      return 0;
    }
    return (
      results.products.length +
      results.variants.length +
      results.receipts.length +
      results.customers.length +
      results.transfers.length
    );
  }, [results]);

  const runSearch = useCallback(async (queryText = query) => {
    const token = getAccessToken();
    if (!token || !queryText.trim()) {
      return;
    }
    setMessage(null);
    setIsSearching(true);
    try {
      const data = await apiFetch<SearchResults>(
        `/search?q=${encodeURIComponent(queryText.trim())}`,
        { token },
      );
      setResults(data);
      addRecentSearch(queryText);
      setRecentSearches(getRecentSearches());
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('searchFailed')),
      });
    } finally {
      setIsSearching(false);
    }
  }, [query, setMessage, t]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiFetch<SearchResults>(
          `/search?q=${encodeURIComponent(query.trim())}`,
          { token },
        );
        const next = [
          ...data.products.flatMap((item) =>
            item.variants.length
              ? item.variants.map((variant) => ({
                  id: `variant:${variant.id}`,
                  label: `${formatVariantLabel(
                    {
                      id: variant.id,
                      name: variant.name,
                      productName: item.name,
                    },
                    common('unknown'),
                  )}${variant.sku ? ` (${variant.sku})` : ''}`,
                }))
              : [
                  {
                    id: `product:${item.id}`,
                    label: item.name,
                  },
                ],
          ),
          ...data.variants.map((item) => ({
            id: `variant:${item.id}`,
            label: `${formatVariantLabel(
              {
                id: item.id,
                name: item.name,
                productName: item.product?.name ?? null,
              },
              common('unknown'),
            )}${item.sku ? ` (${item.sku})` : ''}`,
          })),
          ...data.receipts.map((item) => ({
            id: `receipt:${item.id}`,
            label: item.receiptNumber,
          })),
          ...data.customers.map((item) => ({
            id: `customer:${item.id}`,
            label: item.name,
          })),
          ...data.transfers.map((item) => ({
            id: `transfer:${item.id}`,
            label: `${item.sourceBranch?.name ?? common('unknown')} → ${
              item.destinationBranch?.name ?? common('unknown')
            }`,
          })),
        ];
        setSuggestions(next);
      } catch (err) {
        setSuggestions([]);
        setMessage({
          action: 'load',
          outcome: 'failure',
          message: getApiErrorMessage(err, t('searchFailed')),
        });
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  /* Load recent searches, saved searches, and popular items on mount */
  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  const loadSavedSearches = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<SavedSearch[]>('/search/saved', { token });
      setSavedSearches(data);
    } catch {
      /* silent — non-critical */
    }
  }, []);

  const loadPopularItems = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<PopularItem[]>('/search/popular?limit=10', { token });
      setPopularItems(data);
    } catch {
      /* silent — non-critical */
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    loadSavedSearches();
    loadPopularItems();
  }, [loadSavedSearches, loadPopularItems]);

  const saveSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const name = window.prompt(t('saveSearchPrompt'));
    if (!name?.trim()) return;
    const token = getAccessToken();
    if (!token) return;
    setIsSavingSearch(true);
    try {
      await apiFetch('/search/saved', {
        token,
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), query: trimmed }),
      });
      setMessage({ action: 'save', outcome: 'success', message: t('saveSearchSuccess') });
      await loadSavedSearches();
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('saveSearchFailed')),
      });
    } finally {
      setIsSavingSearch(false);
    }
  };

  const deleteSavedSearch = async (id: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      await apiFetch(`/search/saved/${id}`, { token, method: 'DELETE' });
      setMessage({ action: 'delete', outcome: 'success', message: t('deleteSearchSuccess') });
      await loadSavedSearches();
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('deleteSearchFailed')),
      });
    }
  };

  /* Barcode scanner: auto-search when a barcode is scanned via keyboard wedge */
  useEffect(() => {
    return installBarcodeScanner({
      onScan: (code) => {
        setQuery(code);
        runSearch(code);
      },
    });
  }, [runSearch]);

  const hasResults = results !== null;
  const showPreSearch = !hasResults && !query.trim();

  const tabs = useMemo(() => [
    { id: 'all', label: `${t('filterAll')} (${totalMatches})` },
    { id: 'products', label: `${t('productsAndVariants')} (${(results?.products.length ?? 0) + (results?.variants.length ?? 0)})` },
    { id: 'customers', label: `${t('customers')} (${results?.customers.length ?? 0})` },
    { id: 'receipts', label: `${t('receipts')} (${results?.receipts.length ?? 0})` },
    { id: 'transfers', label: `${t('transfers')} (${results?.transfers.length ?? 0})` },
  ], [t, totalMatches, results]);

  return (
    <section className="nvi-page">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
              <Icon name="Globe" size={12} className="text-blue-400" />
              {t('badgeGlobalLookup')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              <Icon name="Zap" size={12} className="text-emerald-400" />
              {t('badgeLiveIndex')}
            </span>
          </>
        }
      />

      {/* ── KPI Strip ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="rounded-2xl border border-blue-500/[0.12] bg-blue-500/[0.04] p-4">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--blue">
              <Icon name="Hash" size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiTotalMatches')}</p>
              <p className="text-2xl font-bold text-blue-400">{totalMatches}</p>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-emerald-500/[0.12] bg-emerald-500/[0.04] p-4">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--emerald">
              <Icon name="Package" size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiProductSignal')}</p>
              <p className="text-2xl font-bold text-emerald-400">{results?.products.length ?? 0}</p>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-purple-500/[0.12] bg-purple-500/[0.04] p-4">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--purple">
              <Icon name="Users" size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiCustomers')}</p>
              <p className="text-2xl font-bold text-purple-400">{results?.customers.length ?? 0}</p>
            </div>
          </div>
        </article>
        <article className="rounded-2xl border border-amber-500/[0.12] bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--amber">
              <Icon name="Truck" size={18} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiTransfers')}</p>
              <p className="text-2xl font-bold text-amber-400">{results?.transfers.length ?? 0}</p>
            </div>
          </div>
        </article>
      </div>

      {message ? <Banner message={messageText(message)} /> : null}

      {/* ── Hero Search Bar ── */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 nvi-focus-pulse rounded-2xl">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-5">
                <Icon name="Search" size={22} className="text-white/30" />
              </div>
              <TypeaheadInput
                value={query}
                onChange={setQuery}
                onSelect={(option) => {
                  setQuery(option.label);
                  runSearch(option.label);
                }}
                onEnter={() => runSearch()}
                options={suggestions}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] py-4 pl-14 pr-4 text-lg text-[var(--nvi-text)] placeholder:text-white/30 focus:border-white/[0.16] focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => runSearch()}
              className="nvi-cta inline-flex h-[54px] items-center gap-2 rounded-2xl px-7 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isSearching}
            >
              {isSearching ? <Spinner size="xs" variant="orbit" /> : <Icon name="Search" size={18} />}
              {isSearching ? t('searching') : actions('search')}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/20">
              <Icon name="ScanBarcode" size={13} className="mr-1 inline-block align-[-2px] text-white/20" />
              {t('barcodeScanHint')}
            </p>
            {results && query.trim() ? (
              <button
                type="button"
                onClick={saveSearch}
                disabled={isSavingSearch || !query.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-[var(--nvi-text)] transition-colors hover:border-white/[0.16] disabled:opacity-50"
              >
                {isSavingSearch ? <Spinner size="xs" variant="dots" /> : <Icon name="BookmarkPlus" size={14} className="text-amber-400" />}
                {t('saveThisSearch')}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Pre-search: Recent + Saved + Popular ── */}
      {showPreSearch ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 nvi-stagger">
          {/* Recent searches */}
          {recentSearches.length > 0 ? (
            <div className="rounded-2xl border border-blue-500/[0.10] bg-blue-500/[0.03] p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <Icon name="Clock" size={15} className="text-blue-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--nvi-text)]">{t('recentSearches')}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearRecentSearches();
                    setRecentSearches([]);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-white/30 transition-colors hover:text-white/60"
                >
                  <Icon name="Trash2" size={12} />
                  {t('clearRecent')}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => {
                      setQuery(term);
                      runSearch(term);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-2 text-xs text-[var(--nvi-text)] transition-all hover:bg-blue-500/10 hover:text-blue-300"
                  >
                    <Icon name="CornerDownRight" size={12} className="text-blue-400/50" />
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Saved searches */}
          {savedSearches.length > 0 ? (
            <div className="rounded-2xl border border-amber-500/[0.10] bg-amber-500/[0.03] p-4">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Icon name="Star" size={15} className="text-amber-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--nvi-text)]">{t('savedSearches')}</h3>
                <span className="ml-auto rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">{savedSearches.length}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {savedSearches.map((saved) => (
                  <span
                    key={saved.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500/[0.06] px-3 py-2 text-xs text-[var(--nvi-text)]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setQuery(saved.query);
                        runSearch(saved.query);
                      }}
                      className="transition-colors hover:text-amber-300"
                    >
                      {saved.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSavedSearch(saved.id)}
                      className="ml-1 rounded p-0.5 text-white/20 transition-colors hover:text-red-400"
                      aria-label={`${actions('delete')} ${saved.name}`}
                    >
                      <Icon name="X" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Popular items */}
          {popularItems.length > 0 ? (
            <div className="rounded-2xl border border-emerald-500/[0.10] bg-emerald-500/[0.03] p-4">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Icon name="TrendingUp" size={15} className="text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-[var(--nvi-text)]">{t('popularItems')}</h3>
              </div>
              <div className="space-y-1.5">
                {popularItems.map((item, idx) => {
                  const label = item.productName
                    ? `${item.productName} - ${item.name}`
                    : item.name;
                  return (
                    <button
                      key={`${item.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        setQuery(label);
                        runSearch(label);
                      }}
                      className="flex w-full items-center justify-between rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 text-left text-xs transition-all hover:border-emerald-500/20 hover:bg-emerald-500/[0.06]"
                    >
                      <span className="flex items-center gap-2 text-[var(--nvi-text)]">
                        <Icon name="Flame" size={13} className="text-orange-400" />
                        {label}
                      </span>
                      <span className="text-[11px] font-medium text-emerald-400">
                        {t('popularSalesCount', { count: item.salesCount })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* If nothing to show pre-search */}
          {recentSearches.length === 0 && savedSearches.length === 0 && popularItems.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3">
              <EmptyState
                icon={<Icon name="Search" size={40} className="text-white/20" />}
                title={t('emptyPreSearchTitle')}
                description={t('emptyPreSearchDesc')}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Results ── */}
      {results ? (
        <>
          {totalMatches === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8">
              <EmptyState
                icon={<Icon name="SearchX" size={40} className="text-white/20" />}
                title={t('noResultsTitle')}
                description={t('noResultsDesc')}
              />
            </div>
          ) : (
            <>
              {/* Tab filter */}
              <Tabs
                tabs={tabs}
                activeId={typeFilter}
                onSelect={(tab) => setTypeFilter(tab.id as TypeFilterKey)}
              />

              <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
                {/* Products */}
                {(typeFilter === 'all' || typeFilter === 'products') ? (
                  <div className="rounded-2xl border border-blue-500/[0.10] bg-blue-500/[0.02] p-4">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                        <Icon name="Package" size={15} className="text-blue-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--nvi-text)]">
                        {t('productsAndVariants')}
                      </h3>
                      <span className="ml-auto rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-400">
                        {results.products.length}
                      </span>
                    </div>
                    {results.products.length === 0 ? (
                      <p className="py-4 text-center text-xs text-white/30">{t('noProductMatches')}</p>
                    ) : (
                      <div className="space-y-2">
                        {results.products.map((item) => (
                          <div key={item.id} className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-all hover:border-white/[0.12]">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold text-[var(--nvi-text)]">{item.name}</p>
                              <span className="text-[11px] text-white/30">
                                {t('variantCount', { count: item.variants.length })}
                              </span>
                            </div>
                            {item.variants.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {item.variants.map((variant) => (
                                  <span
                                    key={variant.id}
                                    className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/50"
                                  >
                                    {formatVariantLabel(
                                      { id: variant.id, name: variant.name, productName: item.name },
                                      common('unknown'),
                                    )}
                                    {variant.sku ? <span className="ml-1 font-mono text-emerald-400/70">({variant.sku})</span> : ''}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-1 text-[11px] text-white/20">{t('noVariantsFound')}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Variant matches */}
                {(typeFilter === 'all' || typeFilter === 'products') ? (
                  <div className="rounded-2xl border border-blue-500/[0.10] bg-blue-500/[0.02] p-4">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                        <Icon name="Layers" size={15} className="text-blue-300" />
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--nvi-text)]">
                        {t('variantMatches')}
                      </h3>
                      <span className="ml-auto rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-400">
                        {results.variants.length}
                      </span>
                    </div>
                    {results.variants.length === 0 ? (
                      <p className="py-4 text-center text-xs text-white/30">{t('noVariantMatches')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {results.variants.map((item) => (
                          <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all hover:border-white/[0.12]">
                            <Icon name="Box" size={14} className="flex-shrink-0 text-blue-400/50" />
                            <span className="text-sm text-[var(--nvi-text)]">
                              {formatVariantLabel(
                                { id: item.id, name: item.name, productName: item.product?.name ?? null },
                                common('unknown'),
                              )}
                            </span>
                            {item.sku ? (
                              <span className="ml-auto text-[11px] font-mono text-emerald-400">{item.sku}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Receipts */}
                {(typeFilter === 'all' || typeFilter === 'receipts') ? (
                  <div className="rounded-2xl border border-amber-500/[0.10] bg-amber-500/[0.02] p-4">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                        <Icon name="Receipt" size={15} className="text-amber-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--nvi-text)]">
                        {t('receipts')}
                      </h3>
                      <span className="ml-auto rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
                        {results.receipts.length}
                      </span>
                    </div>
                    {results.receipts.length === 0 ? (
                      <p className="py-4 text-center text-xs text-white/30">{t('noReceiptMatches')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {results.receipts.map((item) => (
                          <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all hover:border-white/[0.12]">
                            <Icon name="Hash" size={14} className="flex-shrink-0 text-amber-400/50" />
                            <span className="font-mono text-sm font-semibold text-amber-300">{item.receiptNumber}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Customers */}
                {(typeFilter === 'all' || typeFilter === 'customers') ? (
                  <div className="rounded-2xl border border-purple-500/[0.10] bg-purple-500/[0.02] p-4">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                        <Icon name="Users" size={15} className="text-purple-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--nvi-text)]">
                        {t('customers')}
                      </h3>
                      <span className="ml-auto rounded-full bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-medium text-purple-400">
                        {results.customers.length}
                      </span>
                    </div>
                    {results.customers.length === 0 ? (
                      <p className="py-4 text-center text-xs text-white/30">{t('noCustomerMatches')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {results.customers.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all hover:border-white/[0.12]">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/10">
                                <Icon name="User" size={13} className="text-purple-400" />
                              </div>
                              <span className="text-sm font-semibold text-[var(--nvi-text)]">{item.name}</span>
                            </div>
                            {item.phone ? (
                              <span className="flex items-center gap-1 text-[11px] text-white/40">
                                <Icon name="Phone" size={11} className="text-purple-400/50" />
                                {item.phone}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Transfers */}
                {(typeFilter === 'all' || typeFilter === 'transfers') ? (
                  <div className="rounded-2xl border border-cyan-500/[0.10] bg-cyan-500/[0.02] p-4 lg:col-span-2">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
                        <Icon name="Truck" size={15} className="text-cyan-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-[var(--nvi-text)]">
                        {t('transfers')}
                      </h3>
                      <span className="ml-auto rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-[11px] font-medium text-cyan-400">
                        {results.transfers.length}
                      </span>
                    </div>
                    {results.transfers.length === 0 ? (
                      <p className="py-4 text-center text-xs text-white/30">{t('noTransferMatches')}</p>
                    ) : (
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {results.transfers.map((item) => (
                          <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all hover:border-white/[0.12]">
                            <div className="flex items-center gap-2 text-sm">
                              <Icon name="ArrowRightLeft" size={14} className="flex-shrink-0 text-cyan-400/50" />
                              <span className="font-semibold text-[var(--nvi-text)]">{item.sourceBranch?.name ?? common('unknown')}</span>
                              <Icon name="ArrowRight" size={14} className="text-cyan-400" />
                              <span className="font-semibold text-[var(--nvi-text)]">{item.destinationBranch?.name ?? common('unknown')}</span>
                            </div>
                            {item.status ? (
                              <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
                                {item.status}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </>
      ) : null}
    </section>
  );
}
