'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { StatusBanner } from '@/components/StatusBanner';
import { formatVariantLabel } from '@/lib/display';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

type SearchResults = {
  products: {
    id: string;
    name: string;
    variants: { id: string; name: string; sku?: string | null }[];
  }[];
  variants: { id: string; name: string; sku?: string | null; product?: { name?: string | null } }[];
  receipts: { id: string; receiptNumber: string }[];
  customers: { id: string; name: string }[];
  transfers: {
    id: string;
    sourceBranch?: { name?: string | null } | null;
    destinationBranch?: { name?: string | null } | null;
  }[];
};

export default function SearchPage() {
  const t = useTranslations('searchPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [message, setMessage] = useToastState();
  const [suggestions, setSuggestions] = useState<
    { id: string; label: string }[]
  >([]);
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

  const runSearch = async (queryText = query) => {
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
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('searchFailed')),
      });
    } finally {
      setIsSearching(false);
    }
  };

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

  return (
    <section className="space-y-4">
      <PremiumPageHeader
        eyebrow="DISCOVERY HUB"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">GLOBAL LOOKUP</span>
            <span className="nvi-badge">LIVE INDEX</span>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">TOTAL MATCHES</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{totalMatches}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">PRODUCT SIGNAL</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{results?.products.length ?? 0}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">CUSTOMERS</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{results?.customers.length ?? 0}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">TRANSFERS</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{results?.transfers.length ?? 0}</p>
        </article>
      </div>
      {message ? <StatusBanner message={message} /> : null}
      <div className="command-card nvi-panel p-4 nvi-reveal">
        <div className="flex gap-2">
        <TypeaheadInput
          value={query}
          onChange={setQuery}
          onSelect={(option) => {
            setQuery(option.label);
            runSearch(option.label);
          }}
          onEnter={() => runSearch()}
          options={suggestions}
          placeholder={actions('search')}
          className="flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <button
          type="button"
          onClick={() => runSearch()}
          className="nvi-cta inline-flex items-center gap-2 rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSearching}
        >
          {isSearching ? <Spinner size="xs" variant="orbit" /> : null}
          {isSearching ? t('searching') : actions('search')}
        </button>
        </div>
      </div>

      {results ? (
        <div className="grid gap-4 lg:grid-cols-2 nvi-stagger">
          <div className="command-card nvi-panel p-4 nvi-reveal">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('productsAndVariants')}
            </h3>
            {results.products.length === 0 ? (
              <StatusBanner message={t('noProductMatches')} />
            ) : (
              results.products.map((item) => (
                <div key={item.id} className="space-y-2">
                  <p className="text-sm text-gold-200">{item.name}</p>
                  {item.variants.length ? (
                    <div className="grid gap-1 rounded border border-gold-700/40 bg-black/60 p-2 text-xs text-gold-300">
                      {item.variants.map((variant) => (
                        <span key={variant.id}>
                          {formatVariantLabel(
                            {
                              id: variant.id,
                              name: variant.name,
                              productName: item.name,
                            },
                            common('unknown'),
                          )}{' '}
                          {variant.sku ? `(${variant.sku})` : ''}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <StatusBanner message={t('noVariantsFound')} />
                  )}
                </div>
              ))
            )}
          </div>
          <div className="command-card nvi-panel p-4 nvi-reveal">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('variantMatches')}
            </h3>
            {results.variants.length === 0 ? (
              <StatusBanner message={t('noVariantMatches')} />
            ) : (
              results.variants.map((item) => (
                <p key={item.id} className="text-sm text-gold-200">
                  {formatVariantLabel(
                    {
                      id: item.id,
                      name: item.name,
                      productName: item.product?.name ?? null,
                    },
                    common('unknown'),
                  )}{' '}
                  {item.sku ? `(${item.sku})` : ''}
                </p>
              ))
            )}
          </div>
          <div className="command-card nvi-panel p-4 nvi-reveal">
            <h3 className="text-lg font-semibold text-gold-100">{t('receipts')}</h3>
            {results.receipts.length === 0 ? (
              <StatusBanner message={t('noReceiptMatches')} />
            ) : (
              results.receipts.map((item) => (
                <p key={item.id} className="text-sm text-gold-200">
                  {item.receiptNumber}
                </p>
              ))
            )}
          </div>
          <div className="command-card nvi-panel p-4 nvi-reveal">
            <h3 className="text-lg font-semibold text-gold-100">{t('customers')}</h3>
            {results.customers.length === 0 ? (
              <StatusBanner message={t('noCustomerMatches')} />
            ) : (
              results.customers.map((item) => (
                <p key={item.id} className="text-sm text-gold-200">
                  {item.name}
                </p>
              ))
            )}
          </div>
          <div className="command-card nvi-panel p-4 lg:col-span-2 nvi-reveal">
            <h3 className="text-lg font-semibold text-gold-100">{t('transfers')}</h3>
            {results.transfers.length === 0 ? (
              <StatusBanner message={t('noTransferMatches')} />
            ) : (
              results.transfers.map((item) => (
                <p key={item.id} className="text-sm text-gold-200">
                  {item.sourceBranch?.name ?? common('unknown')} →{' '}
                  {item.destinationBranch?.name ?? common('unknown')}
                </p>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
