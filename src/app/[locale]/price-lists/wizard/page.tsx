'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useToastState } from '@/lib/app-notifications';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatEntityLabel, formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';

type PriceListItem = {
  id: string;
  variantId: string;
  price: number | string;
};

type PriceList = {
  id: string;
  name: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  items?: PriceListItem[];
};

type Variant = {
  id: string;
  name: string;
  product?: { name?: string | null };
  defaultPrice?: number | null;
};

type AdjustmentMode = 'PERCENT' | 'ADD' | 'SET';

const steps = ['scope', 'adjust', 'preview', 'apply'] as const;

export default function PriceListWizardPage() {
  const t = useTranslations('priceListWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const params = useParams<{ locale: string }>();
  const locale = params?.locale ?? 'en';
  const permissions = getPermissionSet();
  const canManage = permissions.has('price-lists.manage');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [step, setStep] = useState<(typeof steps)[number]>('scope');
  const [lists, setLists] = useState<PriceList[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [form, setForm] = useState({
    listId: '',
    scope: 'ALL' as 'ALL' | 'EXISTING',
    mode: 'PERCENT' as AdjustmentMode,
    value: '',
  });
  const [previewLimit, setPreviewLimit] = useState(12);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const [listData, variantData] = await Promise.all([
          apiFetch<PaginatedResponse<PriceList> | PriceList[]>(
            '/price-lists?limit=200',
            { token },
          ),
          apiFetch<PaginatedResponse<Variant> | Variant[]>('/variants?limit=400', {
            token,
          }),
        ]);
        setLists(normalizePaginated(listData).items);
        setVariants(normalizePaginated(variantData).items);
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
    load();
  }, []);

  const selectedList = lists.find((list) => list.id === form.listId) ?? null;
  const listItems = selectedList?.items ?? [];

  const targetVariants = useMemo(() => {
    if (!selectedList) {
      return [];
    }
    if (form.scope === 'EXISTING') {
      const ids = new Set(listItems.map((item) => item.variantId));
      return variants.filter((variant) => ids.has(variant.id));
    }
    return variants;
  }, [form.scope, listItems, selectedList, variants]);

  const computePrice = (variant: Variant) => {
    const existing = listItems.find((item) => item.variantId === variant.id);
    const base = Number(existing?.price ?? variant.defaultPrice ?? 0);
    const value = Number(form.value);
    if (!Number.isFinite(value)) {
      return base;
    }
    if (form.mode === 'PERCENT') {
      return Math.max(0, base + base * (value / 100));
    }
    if (form.mode === 'ADD') {
      return Math.max(0, base + value);
    }
    return Math.max(0, value);
  };

  const previewRows = targetVariants.slice(0, previewLimit).map((variant) => {
    const existing = listItems.find((item) => item.variantId === variant.id);
    return {
      id: variant.id,
      label: formatVariantLabel(
        {
          id: variant.id,
          name: variant.name,
          productName: variant.product?.name ?? null,
        },
        common('unknown'),
      ),
      current: Number(existing?.price ?? variant.defaultPrice ?? 0),
      next: computePrice(variant),
    };
  });

  const applyChanges = async () => {
    const token = getAccessToken();
    if (!token || !selectedList || !form.value) {
      return;
    }
    setIsApplying(true);
    setMessage(null);
    try {
      for (const variant of targetVariants) {
        const price = computePrice(variant);
        if (!Number.isFinite(price) || price <= 0) {
          continue;
        }
        await apiFetch(`/price-lists/${selectedList.id}/items`, {
          token,
          method: 'POST',
          body: JSON.stringify({
            variantId: variant.id,
            price,
          }),
        });
      }
      setMessage({ action: 'save', outcome: 'success', message: t('applied') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('applyFailed')),
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold-500">{t('eyebrow')}</p>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/price-lists`}
          className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
        >
          {t('backToPriceLists')}
        </Link>
      </div>

      {message ? <StatusBanner message={message} /> : null}

      <div className="flex flex-wrap gap-2 text-xs text-gold-300">
        {steps.map((entry) => (
          <span
            key={entry}
            className={`rounded-full border px-3 py-1 ${
              step === entry
                ? 'border-gold-500 text-gold-100'
                : 'border-gold-700/40 text-gold-400'
            }`}
          >
            {t(`${entry}Step`)}
          </span>
        ))}
      </div>

      {step === 'scope' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('scopeTitle')}</h3>
          <SmartSelect
            value={form.listId}
            onChange={(value) => setForm((prev) => ({ ...prev, listId: value }))}
            options={lists.map((list) => ({ value: list.id, label: list.name }))}
            placeholder={t('selectList')}
            className="nvi-select-container"
          />
          <SmartSelect
            value={form.scope}
            onChange={(value) =>
              setForm((prev) => ({ ...prev, scope: (value as 'ALL' | 'EXISTING') || 'ALL' }))
            }
            options={[
              { value: 'ALL', label: t('scopeAll') },
              { value: 'EXISTING', label: t('scopeExisting') },
            ]}
            placeholder={t('selectScope')}
            className="nvi-select-container"
          />
          <button
            type="button"
            onClick={() => setStep('adjust')}
            disabled={!form.listId}
            className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
          >
            {actions('next')}
          </button>
        </div>
      ) : null}

      {step === 'adjust' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('adjustTitle')}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <SmartSelect
              value={form.mode}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, mode: (value as AdjustmentMode) || 'PERCENT' }))
              }
              options={[
                { value: 'PERCENT', label: t('modePercent') },
                { value: 'ADD', label: t('modeAdd') },
                { value: 'SET', label: t('modeSet') },
              ]}
              placeholder={t('selectMode')}
              className="nvi-select-container"
            />
            <input
              value={form.value}
              onChange={(event) => setForm((prev) => ({ ...prev, value: event.target.value }))}
              placeholder={t('value')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep('preview')}
              disabled={!form.value}
              className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {actions('next')}
            </button>
            <button
              type="button"
              onClick={() => setStep('scope')}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('back')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'preview' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('previewTitle')}</h3>
          {previewRows.length ? (
            <div className="space-y-2 text-sm text-gold-200">
              {previewRows.map((row) => (
                <div key={row.id} className="rounded border border-gold-700/40 bg-black/40 p-3">
                  <p className="text-gold-100">{row.label}</p>
                  <p className="text-xs text-gold-400">
                    {t('previewRow', { current: row.current, next: row.next.toFixed(2) })}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <StatusBanner message={t('noPreview')} />
          )}
          <div className="flex items-center gap-2 text-xs text-gold-400">
            {t('previewCount', { count: targetVariants.length })}
            <button
              type="button"
              onClick={() => setPreviewLimit((prev) => prev + 12)}
              className="rounded border border-gold-700/50 px-2 py-1 text-xs text-gold-100"
            >
              {t('showMore')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep('apply')}
              className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black"
            >
              {actions('next')}
            </button>
            <button
              type="button"
              onClick={() => setStep('adjust')}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
            >
              {actions('back')}
            </button>
          </div>
        </div>
      ) : null}

      {step === 'apply' ? (
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('applyTitle')}</h3>
          <p className="text-sm text-gold-300">
            {t('applyHint', { count: targetVariants.length })}
          </p>
          <button
            type="button"
            onClick={applyChanges}
            disabled={!canManage || isApplying}
            className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            title={!canManage ? noAccess('title') : undefined}
          >
            {isApplying ? <Spinner size="xs" variant="dots" /> : null}
            {isApplying ? t('applying') : t('applyNow')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
