'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useNotify } from '@/components/notifications/NotificationProvider';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';
import { getPermissionSet } from '@/lib/permissions';
import { useCurrency, formatCurrency } from '@/lib/business-context';
import {
  PageHeader,
  Card,
  Icon,
  WizardSteps,
  ProgressBar,
  MetricComparison,
  EmptyState,
} from '@/components/ui';

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

ChartJS.register(ArcElement, Tooltip, Legend);

const steps = ['scope', 'adjust', 'preview', 'apply'] as const;

export default function PriceListWizardPage() {
  const t = useTranslations('priceListWizard');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const locale = useLocale();
  const currency = useCurrency();
  const permissions = getPermissionSet();
  const canManage = permissions.has('price-lists.manage');
  const notify = useNotify();
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
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [applyResult, setApplyResult] = useState<{ success: number; failed: number } | null>(null);
  const applyCardRef = useRef<HTMLDivElement>(null);

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
        notify.error(getApiErrorMessage(err, t('loadFailed')));
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

  const impactSummary = useMemo(() => {
    if (!targetVariants.length || !form.value) {
      return null;
    }
    let increases = 0;
    let decreases = 0;
    let totalDiff = 0;
    let totalPercent = 0;
    let countWithBase = 0;
    for (const variant of targetVariants) {
      const existing = listItems.find((item) => item.variantId === variant.id);
      const base = Number(existing?.price ?? variant.defaultPrice ?? 0);
      const next = computePrice(variant);
      const diff = next - base;
      totalDiff += diff;
      if (base > 0) {
        totalPercent += (diff / base) * 100;
        countWithBase++;
      }
      if (diff > 0) increases++;
      else if (diff < 0) decreases++;
    }
    return {
      total: targetVariants.length,
      increases,
      decreases,
      unchanged: targetVariants.length - increases - decreases,
      avgAbsolute: targetVariants.length ? totalDiff / targetVariants.length : 0,
      avgPercent: countWithBase ? totalPercent / countWithBase : 0,
    };
  }, [targetVariants, listItems, form.value, form.mode]);

  const applyChanges = async () => {
    const token = getAccessToken();
    if (!token || !selectedList || !form.value) {
      return;
    }
    setIsApplying(true);
    setApplyResult(null);
    try {
      const validVariants = targetVariants.filter((variant) => {
        const price = computePrice(variant);
        return Number.isFinite(price) && price > 0;
      });

      const BATCH_SIZE = 20;
      const totalBatches = Math.ceil(validVariants.length / BATCH_SIZE);
      setBatchProgress({ current: 0, total: totalBatches });
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < validVariants.length; i += BATCH_SIZE) {
        const batch = validVariants.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((variant) =>
            apiFetch(`/price-lists/${selectedList.id}/items`, {
              token,
              method: 'POST',
              body: JSON.stringify({
                variantId: variant.id,
                price: computePrice(variant),
              }),
            }),
          ),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') successCount++;
          else failCount++;
        }
        setBatchProgress({ current: Math.floor(i / BATCH_SIZE) + 1, total: totalBatches });
      }

      setApplyResult({ success: successCount, failed: failCount });

      if (failCount === 0) {
        notify.success(t('applied'));
        // Flash the apply card green on full success
        if (applyCardRef.current) {
          applyCardRef.current.classList.add('nvi-save-flash');
          applyCardRef.current.addEventListener(
            'animationend',
            () => applyCardRef.current?.classList.remove('nvi-save-flash'),
            { once: true },
          );
        }
      } else {
        notify.warning(t('applyPartial', { success: successCount, failed: failCount }));
      }
    } catch (err) {
      notify.error(getApiErrorMessage(err, t('applyFailed')));
    } finally {
      setIsApplying(false);
    }
  };

  const stepIndex = steps.indexOf(step);
  const stepLabels = steps.map((s) => t(`${s}Step`));

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page space-y-6">
      {/* ── Hero ── */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-hero__badge">{t('badgeBulkUpdate')}</span>
            <span className="nvi-hero__badge">{t(`${step}Step`)}</span>
          </>
        }
        actions={
          <Link
            href={`/${locale}/price-lists`}
            className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-3 py-2 text-xs text-[var(--nvi-text)] transition-colors hover:border-[var(--nvi-gold)] hover:text-[var(--nvi-gold)]"
          >
            <Icon name="ArrowLeft" size={14} />
            {t('backToPriceLists')}
          </Link>
        }
      />

      {/* ── KPI strip ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Icon name="ClipboardList" size={18} className="text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-[var(--nvi-text-muted)]">{t('kpiCurrentStep')}</p>
              <p className="mt-1 text-lg font-semibold text-blue-400">{t(`${step}Step`)}</p>
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
              <Icon name="Package" size={18} className="text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-[var(--nvi-text-muted)]">{t('kpiTargetVariants')}</p>
              <p className="mt-1 text-3xl font-semibold text-purple-400">{targetVariants.length}</p>
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <Icon name="Eye" size={18} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-[var(--nvi-text-muted)]">{t('kpiPreviewRows')}</p>
              <p className="mt-1 text-3xl font-semibold text-amber-400">{previewRows.length}</p>
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Icon name="ListOrdered" size={18} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest text-[var(--nvi-text-muted)]">{t('kpiSelectedList')}</p>
              <p className="mt-1 truncate text-lg font-semibold text-emerald-400">
                {selectedList?.name ?? common('unknown')}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Wizard steps + progress ── */}
      <Card padding="md" className="space-y-3">
        <ProgressBar
          value={stepIndex + 1}
          max={steps.length}
          height={6}
          color="accent"
          showPercent
          label={t('kpiCurrentStep')}
        />
        <WizardSteps steps={stepLabels} current={stepIndex} />
      </Card>

      {/* ── Step 1: Scope ── */}
      {step === 'scope' ? (
        <Card padding="lg" className="nvi-slide-in-bottom space-y-5">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--nvi-text)]">
              <Icon name="Target" size={20} className="text-[var(--nvi-gold)]" />
              {t('scopeTitle')}
            </h3>
            <p className="mt-1 text-sm text-[var(--nvi-text-muted)]">{t('scopeSubtitle')}</p>
          </div>

          {/* List selector */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--nvi-text-muted)]">
              <Icon name="ListOrdered" size={14} />
              {t('selectList')}
            </label>
            <SmartSelect
              instanceId="wizard-scope-list"
              value={form.listId}
              onChange={(value) => setForm((prev) => ({ ...prev, listId: value }))}
              options={lists.map((list) => ({ value: list.id, label: list.name }))}
              placeholder={t('selectList')}
              className="nvi-select-container"
            />
          </div>

          {/* Scope option cards */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--nvi-text-muted)]">
              <Icon name="ListFilter" size={14} />
              {t('selectScope')}
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, scope: 'ALL' }))}
                className={`nvi-press group flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  form.scope === 'ALL'
                    ? 'border-blue-500/30 bg-blue-500/[0.04] ring-1 ring-blue-500/20'
                    : 'border-[var(--nvi-border)] hover:border-blue-500/30'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  form.scope === 'ALL' ? 'bg-blue-500/15' : 'bg-[var(--nvi-border)]/50'
                }`}>
                  <Icon name="Layers" size={20} className={form.scope === 'ALL' ? 'text-blue-400' : 'text-[var(--nvi-text-muted)]'} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${form.scope === 'ALL' ? 'text-blue-400' : 'text-[var(--nvi-text)]'}`}>
                    {t('scopeAll')}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--nvi-text-muted)] leading-relaxed">{t('scopeAllDesc')}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, scope: 'EXISTING' }))}
                className={`nvi-press group flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  form.scope === 'EXISTING'
                    ? 'border-purple-500/30 bg-purple-500/[0.04] ring-1 ring-purple-500/20'
                    : 'border-[var(--nvi-border)] hover:border-purple-500/30'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  form.scope === 'EXISTING' ? 'bg-purple-500/15' : 'bg-[var(--nvi-border)]/50'
                }`}>
                  <Icon name="ListFilter" size={20} className={form.scope === 'EXISTING' ? 'text-purple-400' : 'text-[var(--nvi-text-muted)]'} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${form.scope === 'EXISTING' ? 'text-purple-400' : 'text-[var(--nvi-text)]'}`}>
                    {t('scopeExisting')}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--nvi-text-muted)] leading-relaxed">{t('scopeExistingDesc')}</p>
                </div>
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setStep('adjust')}
              disabled={!form.listId}
              className="nvi-press inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            >
              {actions('next')}
              <Icon name="ArrowRight" size={16} />
            </button>
          </div>
        </Card>
      ) : null}

      {/* ── Step 2: Adjust ── */}
      {step === 'adjust' ? (
        <Card padding="lg" className="nvi-slide-in-bottom space-y-5">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--nvi-text)]">
              <Icon name="SlidersHorizontal" size={20} className="text-[var(--nvi-gold)]" />
              {t('adjustTitle')}
            </h3>
            <p className="mt-1 text-sm text-[var(--nvi-text-muted)]">{t('adjustSubtitle')}</p>
          </div>

          {/* Mode option cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              { mode: 'PERCENT' as AdjustmentMode, icon: 'Percent' as const, label: t('modePercent'), desc: t('modePercentDesc'), color: 'emerald' },
              { mode: 'ADD' as AdjustmentMode, icon: 'Plus' as const, label: t('modeAdd'), desc: t('modeAddDesc'), color: 'blue' },
              { mode: 'SET' as AdjustmentMode, icon: 'DollarSign' as const, label: t('modeSet'), desc: t('modeSetDesc'), color: 'amber' },
            ]).map((opt) => {
              const isActive = form.mode === opt.mode;
              const colorMap = {
                emerald: {
                  border: isActive ? 'border-emerald-500/30 bg-emerald-500/[0.04] ring-1 ring-emerald-500/20' : 'border-[var(--nvi-border)] hover:border-emerald-500/30',
                  iconBg: isActive ? 'bg-emerald-500/15' : 'bg-[var(--nvi-border)]/50',
                  iconText: isActive ? 'text-emerald-400' : 'text-[var(--nvi-text-muted)]',
                  label: isActive ? 'text-emerald-400' : 'text-[var(--nvi-text)]',
                },
                blue: {
                  border: isActive ? 'border-blue-500/30 bg-blue-500/[0.04] ring-1 ring-blue-500/20' : 'border-[var(--nvi-border)] hover:border-blue-500/30',
                  iconBg: isActive ? 'bg-blue-500/15' : 'bg-[var(--nvi-border)]/50',
                  iconText: isActive ? 'text-blue-400' : 'text-[var(--nvi-text-muted)]',
                  label: isActive ? 'text-blue-400' : 'text-[var(--nvi-text)]',
                },
                amber: {
                  border: isActive ? 'border-amber-500/30 bg-amber-500/[0.04] ring-1 ring-amber-500/20' : 'border-[var(--nvi-border)] hover:border-amber-500/30',
                  iconBg: isActive ? 'bg-amber-500/15' : 'bg-[var(--nvi-border)]/50',
                  iconText: isActive ? 'text-amber-400' : 'text-[var(--nvi-text-muted)]',
                  label: isActive ? 'text-amber-400' : 'text-[var(--nvi-text)]',
                },
              };
              const c = colorMap[opt.color as keyof typeof colorMap];
              return (
                <button
                  key={opt.mode}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, mode: opt.mode }))}
                  className={`nvi-press group flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${c.border}`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${c.iconBg}`}>
                    <Icon name={opt.icon} size={22} className={c.iconText} />
                  </div>
                  <p className={`text-sm font-semibold ${c.label}`}>
                    {opt.label}
                  </p>
                  <p className="text-xs text-[var(--nvi-text-muted)]">{opt.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Value input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--nvi-text-muted)]">{t('value')}</label>
            <CurrencyInput
              value={form.value}
              onChange={(value) => setForm((prev) => ({ ...prev, value }))}
              placeholder={t('value')}
              className="nvi-focus-pulse w-full rounded-xl border border-[var(--nvi-border)] bg-[color:var(--nvi-bg)] px-4 py-2.5 text-sm text-[var(--nvi-text)]"
            />
            {form.value && targetVariants.length > 0 ? (
              <p className="nvi-bounce-in flex items-center gap-1.5 text-xs text-[var(--nvi-text-muted)]">
                <Icon name="Info" size={13} />
                {t('affectsHint', { count: targetVariants.length })}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep('scope')}
              className="nvi-press inline-flex items-center gap-2 rounded-xl border border-[var(--nvi-border)] px-4 py-2.5 text-sm text-[var(--nvi-text)] transition-colors hover:border-blue-500/40"
            >
              <Icon name="ArrowLeft" size={16} />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={() => setStep('preview')}
              disabled={!form.value}
              className="nvi-press inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            >
              {actions('next')}
              <Icon name="ArrowRight" size={16} />
            </button>
          </div>
        </Card>
      ) : null}

      {/* ── Step 3: Preview — the STAR step ── */}
      {step === 'preview' ? (
        <div className="nvi-slide-in-bottom space-y-5">
          {/* Section header */}
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--nvi-text)]">
              <Icon name="ChartColumn" size={20} className="text-[var(--nvi-gold)]" />
              {t('previewTitle')}
            </h3>
            <p className="mt-1 text-sm text-[var(--nvi-text-muted)]">{t('previewSubtitle')}</p>
          </div>

          {/* Impact metrics -- 4 stat boxes */}
          {impactSummary ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 nvi-stagger">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                    <Icon name="Package" size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-blue-400/70">{t('impactTotal')}</p>
                    <p className="mt-0.5 text-2xl font-bold text-blue-300">{impactSummary.total}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                    <Icon name="TrendingUp" size={20} className="text-red-400" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-red-400/80">{t('impactIncreases')}</p>
                    <p className="mt-0.5 text-2xl font-bold text-red-300">{impactSummary.increases}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Icon name="TrendingDown" size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-emerald-400/80">{t('impactDecreases')}</p>
                    <p className="mt-0.5 text-2xl font-bold text-emerald-300">{impactSummary.decreases}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                    <Icon name="Percent" size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-amber-400/70">{t('impactAvgChange')}</p>
                    <p className="mt-0.5 text-lg font-bold text-amber-300">
                      {impactSummary.avgPercent >= 0 ? '+' : ''}{impactSummary.avgPercent.toFixed(1)}%
                      <span className="ml-2 text-sm font-normal text-amber-400/60">
                        ({impactSummary.avgAbsolute >= 0 ? '+' : ''}{formatCurrency(Math.round(impactSummary.avgAbsolute), currency)})
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Doughnut chart in a card */}
          {impactSummary && (impactSummary.increases > 0 || impactSummary.decreases > 0 || impactSummary.unchanged > 0) ? (
            <Card padding="md" className="nvi-card-hover border border-purple-500/15">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
                  <Icon name="ChartPie" size={14} className="text-purple-400" />
                </div>
                <h4 className="text-sm font-semibold text-[var(--nvi-text)]">{t('impactDistribution')}</h4>
              </div>
              <div className="mx-auto" style={{ maxWidth: 220, maxHeight: 220 }}>
                <Doughnut
                  data={{
                    labels: [t('impactIncreases'), t('impactDecreases'), t('impactUnchanged')],
                    datasets: [{
                      data: [impactSummary.increases, impactSummary.decreases, impactSummary.unchanged],
                      backgroundColor: ['#4caf82', '#c35151', '#6e7a8c'],
                      borderWidth: 0,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: { color: '#d4c9a8', font: { size: 11 } },
                      },
                    },
                  }}
                />
              </div>
            </Card>
          ) : null}

          {/* Preview table */}
          {previewRows.length ? (
            <Card padding="md" className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--nvi-text)]">
                <Icon name="Table" size={16} className="text-[var(--nvi-gold)]" />
                {t('previewCount', { count: targetVariants.length })}
              </h4>
              <div className="space-y-2 nvi-stagger">
                {previewRows.map((row) => {
                  const diff = row.next - row.current;
                  const pctChange = row.current > 0 ? ((diff / row.current) * 100) : 0;
                  return (
                    <div
                      key={row.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 transition-colors ${
                        diff > 0
                          ? 'border-red-500/20 bg-red-500/5'
                          : diff < 0
                            ? 'border-emerald-500/20 bg-emerald-500/5'
                            : 'border-[var(--nvi-border)] bg-[color:var(--nvi-bg)]'
                      }`}
                    >
                      <p className="min-w-0 truncate text-sm font-medium text-[var(--nvi-text)]">{row.label}</p>
                      <div className="flex items-center gap-3">
                        <MetricComparison
                          oldValue={row.current}
                          newValue={row.next}
                          format={(v) => formatCurrency(Number(v), currency)}
                        />
                        {diff !== 0 ? (
                          <span
                            className={`nvi-bounce-in inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold ${
                              diff > 0
                                ? 'bg-red-500/15 text-red-400'
                                : 'bg-emerald-500/15 text-emerald-400'
                            }`}
                          >
                            {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(1)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show more */}
              {targetVariants.length > previewLimit ? (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setPreviewLimit((prev) => prev + 12)}
                    className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-xs text-[var(--nvi-text)] transition-colors hover:border-[var(--nvi-gold)]"
                  >
                    <Icon name="ChevronDown" size={14} />
                    {t('showMore')}
                  </button>
                </div>
              ) : null}
            </Card>
          ) : (
            <EmptyState
              icon={<Icon name="SearchX" size={32} className="text-[var(--nvi-text-muted)]" />}
              title={t('noPreview')}
            />
          )}

          {/* Navigation */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStep('adjust')}
              className="nvi-press inline-flex items-center gap-2 rounded-xl border border-[var(--nvi-border)] px-4 py-2.5 text-sm text-[var(--nvi-text)] transition-colors hover:border-emerald-500/40"
            >
              <Icon name="ArrowLeft" size={16} />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={() => setStep('apply')}
              className="nvi-press inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity"
            >
              {actions('next')}
              <Icon name="ArrowRight" size={16} />
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Step 4: Apply ── */}
      {step === 'apply' ? (
        <div ref={applyCardRef}>
        <Card padding="lg" className="nvi-slide-in-bottom space-y-5">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-[var(--nvi-text)]">
              <Icon name="Rocket" size={20} className="text-[var(--nvi-gold)]" />
              {t('applyTitle')}
            </h3>
            <p className="mt-1 text-sm text-[var(--nvi-text-muted)]">{t('applySubtitle')}</p>
          </div>

          {/* Summary card */}
          <div className="rounded-xl border border-[var(--nvi-gold)]/20 bg-[var(--nvi-gold)]/5 p-4">
            <div className="flex items-center gap-3">
              <Icon name="FileCheck" size={20} className="text-[var(--nvi-gold)]" />
              <p className="text-sm text-[var(--nvi-text)]">
                {t('applySummary', { count: targetVariants.length, list: selectedList?.name ?? '' })}
              </p>
            </div>
          </div>

          {/* Batch progress */}
          {isApplying && batchProgress.total > 0 ? (
            <div className="space-y-2">
              <ProgressBar
                value={batchProgress.current}
                max={batchProgress.total}
                height={8}
                color={batchProgress.current === batchProgress.total ? 'green' : 'accent'}
                showValue
                label={t('batchProgress')}
                formatValue={(v, m) => `${v} / ${m}`}
              />
            </div>
          ) : null}

          {/* Result summary */}
          {applyResult ? (
            <div className={`nvi-bounce-in flex items-center gap-3 rounded-xl border p-4 ${
              applyResult.failed === 0
                ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                : 'border-red-500/30 bg-red-500/[0.04]'
            }`}>
              <Icon
                name={applyResult.failed === 0 ? 'CircleCheck' : 'TriangleAlert'}
                size={20}
                className={applyResult.failed === 0 ? 'text-emerald-400' : 'text-red-400'}
              />
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--nvi-text)]">
                <span>
                  {applyResult.failed === 0
                    ? t('applySuccess', { count: applyResult.success })
                    : t('applyPartial', { success: applyResult.success, failed: applyResult.failed })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-400">
                  <Icon name="Check" size={12} /> {applyResult.success}
                </span>
                {applyResult.failed > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400">
                    <Icon name="X" size={12} /> {applyResult.failed}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep('preview')}
              disabled={isApplying}
              className="nvi-press inline-flex items-center gap-2 rounded-xl border border-[var(--nvi-border)] px-4 py-2.5 text-sm text-[var(--nvi-text)] transition-colors hover:border-amber-500/40 disabled:opacity-40"
            >
              <Icon name="ArrowLeft" size={16} />
              {actions('back')}
            </button>
            <button
              type="button"
              onClick={applyChanges}
              disabled={!canManage || isApplying}
              className="nvi-press inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              title={!canManage ? noAccess('title') : undefined}
            >
              {isApplying ? <Spinner size="xs" variant="dots" /> : <Icon name="Zap" size={16} />}
              {isApplying ? t('applying') : t('applyNow')}
            </button>
          </div>
        </Card>
        </div>
      ) : null}
    </section>
  );
}
