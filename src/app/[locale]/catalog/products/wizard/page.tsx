'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useActiveBranch } from '@/lib/branch-context';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';

type Category = { id: string; name: string };
type Branch = { id: string; name: string };

type VariantDraft = {
  id: string;
  name: string;
  sku: string;
  defaultPrice: string;
  minPrice: string;
  defaultCost: string;
  vatMode: string;
  trackStock: boolean;
  barcode: string;
  baseUnitId: string;
  sellUnitId: string;
  conversionFactor: string;
};

type StockDraft = {
  variantId: string;
  branchId: string;
  quantity: string;
  unitId: string;
};

export default function ProductWizardPage() {
  const t = useTranslations('productWizardPage');
  const actions = useTranslations('actions');
  const activeBranch = useActiveBranch();
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useToastState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [product, setProduct] = useState({
    name: '',
    description: '',
    categoryId: '',
  });
  const [variants, setVariants] = useState<VariantDraft[]>([
    {
      id: crypto.randomUUID(),
      name: '',
      sku: '',
      defaultPrice: '',
      minPrice: '',
      defaultCost: '',
      vatMode: 'INCLUSIVE',
      trackStock: true,
      barcode: '',
      baseUnitId: '',
      sellUnitId: '',
      conversionFactor: '1',
    },
  ]);
  const [stockLines, setStockLines] = useState<StockDraft[]>([]);

  const steps = [
    t('stepProduct'),
    t('stepVariants'),
    t('stepInitialStock'),
    t('stepReview'),
  ];

  const vatOptions = useMemo(
    () => [
      { value: 'INCLUSIVE', label: t('vatInclusive') },
      { value: 'EXCLUSIVE', label: t('vatExclusive') },
      { value: 'EXEMPT', label: t('vatExempt') },
    ],
    [t],
  );

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    Promise.all([
      apiFetch<PaginatedResponse<Category> | Category[]>('/categories?limit=200', {
        token,
      }),
      apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', {
        token,
      }),
      loadUnits(token),
    ])
      .then(([cats, branchData, unitList]) => {
        setCategories(normalizePaginated(cats).items);
        setBranches(normalizePaginated(branchData).items);
        setUnits(unitList);
      })
      .catch(() => setMessage(t('loadFailed')))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (activeBranch?.id && stockLines.length === 0 && variants.length > 0) {
      setStockLines(
        variants.map((variant) => ({
          variantId: variant.id,
          branchId: activeBranch.id,
          quantity: '',
          unitId: variant.sellUnitId || variant.baseUnitId || '',
        })),
      );
    }
  }, [activeBranch?.id, variants, stockLines.length]);

  useEffect(() => {
    if (!units.length) {
      return;
    }
    const defaultUnitId =
      units.find((unit) => unit.code === 'piece')?.id ?? units[0]?.id ?? '';
    if (!defaultUnitId) {
      return;
    }
    setVariants((prev) =>
      prev.map((variant) =>
        variant.baseUnitId
          ? variant
          : {
              ...variant,
              baseUnitId: defaultUnitId,
              sellUnitId: defaultUnitId,
              conversionFactor: variant.conversionFactor || '1',
            },
      ),
    );
    setStockLines((prev) =>
      prev.map((line) =>
        line.unitId ? line : { ...line, unitId: defaultUnitId },
      ),
    );
  }, [units]);

  const goNext = () => setStep((prev) => Math.min(prev + 1, steps.length - 1));
  const goBack = () => setStep((prev) => Math.max(prev - 1, 0));

  const updateVariant = (id: string, patch: Partial<VariantDraft>) => {
    setVariants((prev) =>
      prev.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)),
    );
  };

  const addVariant = () => {
    const id = crypto.randomUUID();
    setVariants((prev) => [
      ...prev,
      {
        id,
        name: '',
        sku: '',
        defaultPrice: '',
        minPrice: '',
        defaultCost: '',
        vatMode: 'INCLUSIVE',
        trackStock: true,
        barcode: '',
        baseUnitId: '',
        sellUnitId: '',
        conversionFactor: '1',
      },
    ]);
    setStockLines((prev) => [
      ...prev,
      { variantId: id, branchId: activeBranch?.id || '', quantity: '', unitId: '' },
    ]);
  };

  const removeVariant = (id: string) => {
    setVariants((prev) => prev.filter((variant) => variant.id !== id));
    setStockLines((prev) => prev.filter((line) => line.variantId !== id));
  };

  const syncStockLine = (variantId: string, patch: Partial<StockDraft>) => {
    setStockLines((prev) => {
      const existing = prev.find((line) => line.variantId === variantId);
      if (!existing) {
        return [...prev, { variantId, branchId: '', quantity: '', unitId: '', ...patch }];
      }
      return prev.map((line) =>
        line.variantId === variantId ? { ...line, ...patch } : line,
      );
    });
  };

  const filteredVariants = useMemo(
    () => variants.filter((variant) => variant.name.trim()),
    [variants],
  );

  const submitWizard = async () => {
    const token = getAccessToken();
    if (!token || !product.name.trim() || filteredVariants.length === 0) {
      setMessage({ action: 'save', outcome: 'failure', message: t('validationError') });
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    try {
      const createdProduct = await apiFetch<{ id: string } | { product?: { id: string } }>(
        '/products',
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            name: product.name.trim(),
            description: product.description || undefined,
            categoryId: product.categoryId || undefined,
          }),
        },
      );
      const productId =
        'id' in createdProduct
          ? createdProduct.id
          : createdProduct.product?.id || '';
      if (!productId) {
        throw new Error(t('productIdMissing'));
      }

      const createdVariantMap = new Map<string, string>();
      for (const variant of filteredVariants) {
        const created = await apiFetch<{ id: string }>(
          '/variants',
          {
            token,
            method: 'POST',
            body: JSON.stringify({
              productId,
              name: variant.name,
              sku: variant.sku || undefined,
              baseUnitId: variant.baseUnitId || undefined,
              sellUnitId: variant.sellUnitId || undefined,
              conversionFactor: variant.conversionFactor
                ? Number(variant.conversionFactor)
                : undefined,
              defaultPrice: variant.defaultPrice
                ? Number(variant.defaultPrice)
                : undefined,
              minPrice: variant.minPrice ? Number(variant.minPrice) : undefined,
              defaultCost: variant.defaultCost
                ? Number(variant.defaultCost)
                : undefined,
              vatMode: variant.vatMode,
              trackStock: variant.trackStock,
            }),
          },
        );
        createdVariantMap.set(variant.id, created.id);

        if (variant.barcode.trim()) {
          await apiFetch('/barcodes', {
            token,
            method: 'POST',
            body: JSON.stringify({ variantId: created.id, code: variant.barcode }),
          });
        }
      }

      for (const line of stockLines) {
        const createdId = createdVariantMap.get(line.variantId);
        if (!createdId) {
          continue;
        }
        const qty = Number(line.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          continue;
        }
        if (!line.branchId) {
          continue;
        }
        await apiFetch('/stock/adjustments', {
          token,
          method: 'POST',
          body: JSON.stringify({
            branchId: line.branchId,
            variantId: createdId,
            quantity: qty,
            unitId: line.unitId || undefined,
            type: 'POSITIVE',
            reason: t('initialStockReason'),
          }),
        });
      }

      setProduct({ name: '', description: '', categoryId: '' });
      setVariants([
        {
          id: crypto.randomUUID(),
          name: '',
          sku: '',
          defaultPrice: '',
          minPrice: '',
          defaultCost: '',
          vatMode: 'INCLUSIVE',
          trackStock: true,
          barcode: '',
          baseUnitId: units.find((unit) => unit.code === 'piece')?.id || '',
          sellUnitId: units.find((unit) => unit.code === 'piece')?.id || '',
          conversionFactor: '1',
        },
      ]);
      setStockLines([]);
      setStep(0);
      setMessage({ action: 'save', outcome: 'success', message: t('completed') });
    } catch (err) {
      setMessage({ action: 'save', outcome: 'failure', message: t('completeFailed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
      <p className="text-sm text-gold-300">{t('subtitle')}</p>
      {message ? <p className="text-sm text-gold-300">{message}</p> : null}

      <div className="command-card p-4 nvi-reveal">
        <div className="flex flex-wrap items-center gap-2 text-xs text-gold-300">
          {steps.map((label, index) => (
            <span
              key={label}
              className={`rounded-full border px-3 py-1 ${
                index === step
                  ? 'border-gold-500 text-gold-100'
                  : 'border-gold-700/40 text-gold-400'
              }`}
            >
              {index + 1}. {label}
            </span>
          ))}
        </div>
      </div>

      {step === 0 ? (
        <div className="command-card p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('productDetails')}</h3>
          <input
            value={product.name}
            onChange={(event) =>
              setProduct({ ...product, name: event.target.value })
            }
            placeholder={t('productName')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <input
            value={product.description}
            onChange={(event) =>
              setProduct({ ...product, description: event.target.value })
            }
            placeholder={t('descriptionOptional')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={product.categoryId}
            onChange={(value) =>
              setProduct({ ...product, categoryId: value })
            }
            placeholder={t('categoryOptional')}
            options={categories.map((category) => ({
              value: category.id,
              label: category.name,
            }))}
            isClearable
          />
        </div>
      ) : null}

      {step === 1 ? (
        <div className="command-card p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('variantsTitle')}</h3>
          {variants.map((variant, index) => (
            <div
              key={variant.id}
              className="rounded border border-gold-700/40 bg-black/60 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-gold-200">
                  {t('variantNumber', { index: index + 1 })}
                </p>
                {variants.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeVariant(variant.id)}
                    className="rounded border border-gold-700/50 px-2 py-1 text-xs text-gold-100"
                  >
                    {actions('remove')}
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={variant.name}
                  onChange={(event) =>
                    updateVariant(variant.id, { name: event.target.value })
                  }
                  placeholder={t('variantName')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <input
                  value={variant.sku}
                  onChange={(event) =>
                    updateVariant(variant.id, { sku: event.target.value })
                  }
                  placeholder={t('skuOptional')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <input
                  value={variant.defaultPrice}
                  onChange={(event) =>
                    updateVariant(variant.id, { defaultPrice: event.target.value })
                  }
                  placeholder={t('defaultPrice')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <input
                  value={variant.minPrice}
                  onChange={(event) =>
                    updateVariant(variant.id, { minPrice: event.target.value })
                  }
                  placeholder={t('minPriceOptional')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <input
                  value={variant.defaultCost}
                  onChange={(event) =>
                    updateVariant(variant.id, { defaultCost: event.target.value })
                  }
                  placeholder={t('defaultCostOptional')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <SmartSelect
                  value={variant.vatMode}
                  onChange={(value) =>
                    updateVariant(variant.id, { vatMode: value })
                  }
                  options={vatOptions}
                />
                <input
                  value={variant.barcode}
                  onChange={(event) =>
                    updateVariant(variant.id, { barcode: event.target.value })
                  }
                  placeholder={t('barcodeOptional')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <label className="flex items-center gap-2 text-xs text-gold-300">
                  <input
                    type="checkbox"
                    checked={variant.trackStock}
                    onChange={(event) =>
                      updateVariant(variant.id, { trackStock: event.target.checked })
                    }
                  />
                  {t('trackStock')}
                </label>
                <label className="space-y-1 text-xs text-gold-300">
                  <span className="text-gold-400">{t('baseUnit')}</span>
                  <SmartSelect
                    value={variant.baseUnitId}
                    onChange={(value) =>
                      updateVariant(variant.id, {
                        baseUnitId: value,
                        sellUnitId: variant.sellUnitId || value,
                        conversionFactor:
                          (variant.sellUnitId || value) === value
                            ? '1'
                            : variant.conversionFactor,
                      })
                    }
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: buildUnitLabel(unit),
                    }))}
                    placeholder={t('baseUnit')}
                  />
                </label>
                <label className="space-y-1 text-xs text-gold-300">
                  <span className="text-gold-400">{t('sellUnit')}</span>
                  <SmartSelect
                    value={variant.sellUnitId || variant.baseUnitId}
                    onChange={(value) =>
                      updateVariant(variant.id, {
                        sellUnitId: value,
                        conversionFactor:
                          value === variant.baseUnitId ? '1' : variant.conversionFactor,
                      })
                    }
                    options={units.map((unit) => ({
                      value: unit.id,
                      label: buildUnitLabel(unit),
                    }))}
                    placeholder={t('sellUnit')}
                  />
                </label>
                <label className="space-y-1 text-xs text-gold-300">
                  <span className="text-gold-400">{t('conversionFactor')}</span>
                  <input
                    value={variant.conversionFactor}
                    onChange={(event) =>
                      updateVariant(variant.id, {
                        conversionFactor: event.target.value,
                      })
                    }
                    placeholder={t('conversionFactor')}
                    disabled={(variant.sellUnitId || variant.baseUnitId) === variant.baseUnitId}
                    className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 disabled:opacity-70"
                  />
                  <p className="text-[10px] text-gold-400">{t('conversionHint')}</p>
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addVariant}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {t('addVariant')}
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="command-card p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('initialStockTitle')}</h3>
          <p className="text-xs text-gold-400">
            {t('initialStockHint')}
          </p>
          <div className="space-y-2">
            {variants.map((variant) => (
              <div key={variant.id} className="grid gap-2 md:grid-cols-4">
                <div className="text-sm text-gold-200">{variant.name || t('empty')}</div>
                <SmartSelect
                  value={
                    stockLines.find((line) => line.variantId === variant.id)
                      ?.branchId || ''
                  }
                  onChange={(value) =>
                    syncStockLine(variant.id, { branchId: value })
                  }
                  placeholder={t('selectBranch')}
                  options={branches.map((branch) => ({
                    value: branch.id,
                    label: branch.name,
                  }))}
                  isClearable
                />
                <input
                  value={
                    stockLines.find((line) => line.variantId === variant.id)
                      ?.quantity || ''
                  }
                  onChange={(event) =>
                    syncStockLine(variant.id, { quantity: event.target.value })
                  }
                  placeholder={t('quantity')}
                  className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                />
                <SmartSelect
                  value={
                    stockLines.find((line) => line.variantId === variant.id)
                      ?.unitId || variant.sellUnitId || variant.baseUnitId || ''
                  }
                  onChange={(value) =>
                    syncStockLine(variant.id, { unitId: value })
                  }
                  placeholder={t('unit')}
                  options={units.map((unit) => ({
                    value: unit.id,
                    label: buildUnitLabel(unit),
                  }))}
                  isClearable
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="command-card p-6 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('reviewTitle')}</h3>
          <div className="text-sm text-gold-300 space-y-2">
            <p>
              <span className="text-gold-100">{t('reviewProduct')}</span>{' '}
              {product.name || t('empty')}
            </p>
            <p>
              <span className="text-gold-100">{t('reviewVariants')}</span>{' '}
              {filteredVariants.length}
            </p>
            <p>
              <span className="text-gold-100">{t('reviewStockLines')}</span>{' '}
              {stockLines.filter((line) => Number(line.quantity) > 0).length}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100"
          >
            {actions('back')}
          </button>
        ) : null}
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black"
          >
            {t('continue')}
          </button>
        ) : (
          <button
            type="button"
            onClick={submitWizard}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? <Spinner size="xs" variant="orbit" /> : null}
            {isSubmitting ? t('creating') : t('finish')}
          </button>
        )}
      </div>
    </section>
  );
}
