'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useBranchScope } from '@/lib/use-branch-scope';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { AsyncSmartSelect } from '@/components/AsyncSmartSelect';
import { CurrencyInput } from '@/components/CurrencyInput';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { buildUnitLabel, loadUnits, Unit } from '@/lib/units';
import { installBarcodeScanner } from '@/lib/barcode-scanner';
import { UnitHelpPanel } from '@/components/ui/UnitHelpPanel';
import { PageHeader, Card, Icon, TextInput, WizardSteps } from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';
import { notify } from '@/components/notifications/NotificationProvider';
import { Checkbox } from '@/components/Checkbox';

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
  availableBranchIds: string[];
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
  const common = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();
  const { activeBranch, resolveBranchId } = useBranchScope();
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
      availableBranchIds: [],
    },
  ]);
  const [stockLines, setStockLines] = useState<StockDraft[]>([]);
  const [scanActive, setScanActive] = useState(false);
  const [scanTargetId, setScanTargetId] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanAutoStart, setScanAutoStart] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<BrowserMultiFormatReader | null>(null);

  const steps = [
    t('stepProduct'),
    t('stepVariants'),
    t('stepInitialStock'),
    t('stepReview'),
  ];
  const scanTargetLabel = useMemo(() => {
    if (!scanTargetId) {
      return '';
    }
    const index = variants.findIndex((variant) => variant.id === scanTargetId);
    const variant = variants[index];
    if (!variant) {
      return '';
    }
    const name = variant.name.trim();
    return name || t('variantNumber', { index: index + 1 });
  }, [scanTargetId, variants, t]);

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
      apiFetch<PaginatedResponse<Category> | Category[]>('/categories?limit=50', {
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
      .catch((err) => setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('loadFailed')) }))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (branches.length > 0) {
      setVariants((prev) =>
        prev.map((v) =>
          v.availableBranchIds.length === 0
            ? { ...v, availableBranchIds: branches.map((b) => b.id) }
            : v,
        ),
      );
    }
  }, [branches]);

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

  const resetScanner = (reader: BrowserMultiFormatReader | null) => {
    if (!reader) {
      return;
    }
    const scanner = reader as unknown as {
      reset?: () => void;
      stopContinuousDecode?: () => void;
      stopStreams?: () => void;
    };
    scanner.reset?.();
    scanner.stopContinuousDecode?.();
    scanner.stopStreams?.();
  };

  const stopVideoStream = useCallback(() => {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const stopScan = useCallback(() => {
    resetScanner(scannerRef.current);
    scannerRef.current = null;
    setScanActive(false);
    setScanTargetId(null);
    setScanAutoStart(false);
    stopVideoStream();
  }, [stopVideoStream]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      resetScanner(scannerRef.current);
      scannerRef.current = null;
      stopVideoStream();
    };
  }, [stopVideoStream]);

  const startScan = async (variantId: string) => {
    if (!videoRef.current) {
      return;
    }
    setScanMessage(null);
    if (scannerRef.current) {
      resetScanner(scannerRef.current);
    }
    try {
      const reader = new BrowserMultiFormatReader();
      scannerRef.current = reader;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      const rearCamera = videoDevices.find((d) => /back|rear|environment/i.test(d.label));
      const deviceId = (rearCamera ?? videoDevices[0])?.deviceId;
      let handled = false;
      await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        async (result) => {
          if (!result || handled) {
            return;
          }
          handled = true;
          const normalized = result.getText().trim();
          if (!normalized) {
            handled = false;
            return;
          }
          setVariants((prev) =>
            prev.map((variant) =>
              variant.id === variantId ? { ...variant, barcode: normalized } : variant,
            ),
          );
          setMessage({
            action: 'save',
            outcome: 'success',
            message: t('scanAssignSuccess', { code: normalized }),
          });
          setScanMessage(t('scanAssignSuccess', { code: normalized }));
          stopScan();
        },
      );
      setScanActive(true);
    } catch (err) {
      setScanMessage(t('scanCameraFailed'));
    }
  };

  useEffect(() => {
    if (!scanTargetId || !scanAutoStart) {
      return;
    }
    if (!videoRef.current) {
      return;
    }
    startScan(scanTargetId);
  }, [scanTargetId, scanAutoStart]);

  useEffect(() => {
    return installBarcodeScanner({
      enabled: Boolean(scanTargetId),
      minLength: 6,
      onScan: (code) => {
        if (!scanTargetId) {
          return;
        }
        const normalized = code.trim();
        if (!normalized) {
          return;
        }
        setVariants((prev) =>
          prev.map((variant) =>
            variant.id === scanTargetId ? { ...variant, barcode: normalized } : variant,
          ),
        );
        setMessage({
          action: 'save',
          outcome: 'success',
          message: t('scanAssignSuccess', { code: normalized }),
        });
        setScanMessage(t('scanAssignSuccess', { code: normalized }));
        stopScan();
      },
    });
  }, [scanTargetId, setMessage, stopScan, t]);

  useEffect(() => {
    return () => {
      resetScanner(scannerRef.current);
      stopVideoStream();
    };
  }, []);

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

  const loadCategoryOptions = useCallback(async (inputValue: string) => {
    const token = getAccessToken();
    if (!token) return [];
    try {
      const data = await apiFetch<PaginatedResponse<Category> | Category[]>(
        `/categories?search=${encodeURIComponent(inputValue)}&limit=25`,
        { token },
      );
      return normalizePaginated(data).items.map((c) => ({ value: c.id, label: c.name }));
    } catch {
      return [];
    }
  }, []);

  const goNext = () => setStep((prev) => Math.min(prev + 1, steps.length - 1));
  const goBack = () => setStep((prev) => Math.max(prev - 1, 0));

  const updateVariant = (id: string, patch: Partial<VariantDraft>) => {
    setVariants((prev) =>
      prev.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)),
    );
    if (patch.baseUnitId || patch.sellUnitId) {
      setStockLines((prev) =>
        prev.map((line) => {
          if (line.variantId !== id) {
            return line;
          }
          const current = variants.find((variant) => variant.id === id);
          const previousBase = current?.baseUnitId || '';
          const previousSell = current?.sellUnitId || previousBase;
          const nextBase = patch.baseUnitId ?? previousBase;
          const nextSell = patch.sellUnitId ?? previousSell;
          const preferredUnit = nextSell || nextBase;
          if (
            !line.unitId ||
            line.unitId === previousSell ||
            line.unitId === previousBase
          ) {
            return { ...line, unitId: preferredUnit };
          }
          return line;
        }),
      );
    }
  };

  const addVariant = () => {
    const id = crypto.randomUUID();
    setVariants((prev) => {
      // Copy unit settings from the last variant so users don't have to re-select
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          id,
          name: '',
          sku: '',
          defaultPrice: '',
          minPrice: '',
          defaultCost: '',
          vatMode: last?.vatMode ?? 'INCLUSIVE',
          trackStock: last?.trackStock ?? true,
          barcode: '',
          baseUnitId: last?.baseUnitId ?? '',
          sellUnitId: last?.sellUnitId ?? '',
          conversionFactor: last?.conversionFactor ?? '1',
          availableBranchIds: branches.map((b) => b.id),
        },
      ];
    });
    setStockLines((prev) => [
      ...prev,
      {
        variantId: id,
        branchId: resolveBranchId(activeBranch?.id) || '',
        quantity: '',
        unitId: '',
      },
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
    if (
      !token ||
      !product.name.trim() ||
      !product.categoryId ||
      filteredVariants.length === 0
    ) {
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
            categoryId: product.categoryId,
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
      await Promise.all(
        filteredVariants.map(async (variant) => {
          const created = await apiFetch<{ id: string }>('/variants', {
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
          });
          createdVariantMap.set(variant.id, created.id);
          if (variant.barcode.trim()) {
            await apiFetch('/barcodes', {
              token,
              method: 'POST',
              body: JSON.stringify({ variantId: created.id, code: variant.barcode }),
            });
          }
        }),
      );

      await Promise.all(
        stockLines
          .filter((line) => {
            const createdId = createdVariantMap.get(line.variantId);
            const qty = Number(line.quantity);
            return createdId && Number.isFinite(qty) && qty > 0 && line.branchId;
          })
          .map((line) =>
            apiFetch('/stock/adjustments', {
              token,
              method: 'POST',
              body: JSON.stringify({
                branchId: line.branchId,
                variantId: createdVariantMap.get(line.variantId),
                quantity: Number(line.quantity),
                unitId: line.unitId || undefined,
                type: 'POSITIVE',
                gainReason: 'INITIAL_STOCK',
                reason: t('initialStockReason'),
              }),
            }),
          ),
      );

      const allBranchIds = branches.map((b) => b.id);
      const availabilityUpdates: Promise<unknown>[] = [];
      for (const variant of filteredVariants) {
        const createdId = createdVariantMap.get(variant.id);
        if (!createdId) continue;
        const disabledBranchIds = allBranchIds.filter(
          (id) => !variant.availableBranchIds.includes(id),
        );
        for (const branchId of disabledBranchIds) {
          availabilityUpdates.push(
            apiFetch(`/variants/${createdId}/availability`, {
              token,
              method: 'POST',
              body: JSON.stringify({ branchId, isActive: false }),
            }),
          );
        }
      }
      if (availabilityUpdates.length > 0) {
        await Promise.all(availabilityUpdates);
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
          availableBranchIds: allBranchIds,
        },
      ]);
      setStockLines([]);
      setStep(0);
      setMessage({ action: 'save', outcome: 'success', message: t('completed') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('completeFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  const stepColors = ['blue', 'purple', 'amber', 'emerald'] as const;
  const nextStepColor = step < 3 ? stepColors[step + 1] : 'emerald';
  const nextBtnClass =
    nextStepColor === 'purple'
      ? 'bg-purple-600 hover:bg-purple-500 text-white'
      : nextStepColor === 'amber'
        ? 'bg-amber-600 hover:bg-amber-500 text-white'
        : 'bg-emerald-600 hover:bg-emerald-500 text-white';
  const activeStockLines = stockLines.filter((line) => Number(line.quantity) > 0);

  return (
    <section className="nvi-page">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="status-chip">{t('badgeGuided')}</span>
            <span className="status-chip">{steps[step]}</span>
          </>
        }
      />
      {message ? <Banner message={message} /> : null}

      {/* KPI strip */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Icon name="ClipboardList" size={18} className="text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiCurrentStep')}</p>
            <p className="truncate text-sm font-semibold text-[var(--nvi-text)]">{steps[step]}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
            <Icon name="Layers" size={18} className="text-purple-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiVariantsDrafted')}</p>
            <p className="text-sm font-semibold text-[var(--nvi-text)]">{variants.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
            <Icon name="Package" size={18} className="text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiStockLines')}</p>
            <p className="text-sm font-semibold text-[var(--nvi-text)]">{stockLines.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <Icon name="Check" size={18} className="text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('kpiReadyVariants')}</p>
            <p className="text-sm font-semibold text-[var(--nvi-text)]">{filteredVariants.length}</p>
          </div>
        </div>
      </div>

      <Card padding="md">
        <WizardSteps steps={steps} current={step} />
      </Card>

      {/* ── Step 0: Product Details (Blue zone) ── */}
      {step === 0 ? (
        <div className="border-l-2 border-l-blue-400 rounded-xl bg-white/[0.02] p-5 space-y-4 nvi-slide-in-bottom">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Icon name="Building2" size={16} className="text-blue-400" />
            </div>
            <h3 className="text-base font-semibold text-[var(--nvi-text)]">{t('productDetails')}</h3>
          </div>
          <div className="space-y-3">
            <TextInput
              label={t('productName')}
              value={product.name}
              onChange={(event) =>
                setProduct({ ...product, name: event.target.value })
              }
              placeholder={t('productName')}
            />
            <TextInput
              label={t('descriptionOptional')}
              value={product.description}
              onChange={(event) =>
                setProduct({ ...product, description: event.target.value })
              }
              placeholder={t('descriptionOptional')}
            />
            <AsyncSmartSelect
              instanceId="wizard-product-category"
              value={product.categoryId ? { value: product.categoryId, label: categories.find((c) => c.id === product.categoryId)?.name ?? '' } : null}
              onChange={(opt) => setProduct({ ...product, categoryId: opt?.value ?? '' })}
              loadOptions={loadCategoryOptions}
              defaultOptions={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder={t('category')}
            />
          </div>
        </div>
      ) : null}

      {/* ── Step 1: Variants (Purple zone) ── */}
      {step === 1 ? (
        <div className="border-l-2 border-l-purple-400 rounded-xl bg-white/[0.02] p-5 space-y-4 nvi-slide-in-bottom">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
              <Icon name="Layers" size={16} className="text-purple-400" />
            </div>
            <h3 className="text-base font-semibold text-[var(--nvi-text)]">{t('variantsTitle')}</h3>
          </div>

          <div className="space-y-3">
            {variants.map((variant, index) => (
              <div
                key={variant.id}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3"
              >
                {/* Variant header */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--nvi-text)]">
                    {t('variantNumber', { index: index + 1 })}
                  </p>
                  {variants.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeVariant(variant.id)}
                      className="rounded-lg p-1.5 text-[var(--nvi-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400 nvi-press"
                      title={actions('remove')}
                    >
                      <Icon name="Trash2" size={15} />
                    </button>
                  ) : null}
                </div>

                {/* Name + SKU row */}
                <div className="grid gap-3 md:grid-cols-2">
                  <TextInput
                    label={t('variantName')}
                    value={variant.name}
                    onChange={(event) =>
                      updateVariant(variant.id, { name: event.target.value })
                    }
                    placeholder={t('variantName')}
                  />
                  <TextInput
                    label={t('skuOptional')}
                    value={variant.sku}
                    onChange={(event) =>
                      updateVariant(variant.id, { sku: event.target.value })
                    }
                    placeholder={t('skuOptional')}
                  />
                </div>

                {/* Pricing row */}
                {(() => {
                  const sellUnit = variant.sellUnitId ? units.find((u) => u.id === variant.sellUnitId) : null;
                  const perLabel = sellUnit ? ` (${t('perUnit', { unit: sellUnit.label || sellUnit.code })})` : '';
                  return (
                    <div className="grid gap-3 md:grid-cols-3">
                      <CurrencyInput
                        value={variant.defaultPrice}
                        onChange={(value) =>
                          updateVariant(variant.id, { defaultPrice: value })
                        }
                        placeholder={`${t('defaultPrice')}${perLabel}`}
                        className={`rounded-xl border border-white/[0.08] bg-black px-3 py-2 ${variant.defaultPrice ? 'text-emerald-400' : 'text-gold-100'}`}
                      />
                      <CurrencyInput
                        value={variant.minPrice}
                        onChange={(value) =>
                          updateVariant(variant.id, { minPrice: value })
                        }
                        placeholder={`${t('minPriceOptional')}${perLabel}`}
                        className={`rounded-xl border border-white/[0.08] bg-black px-3 py-2 ${variant.minPrice ? 'text-emerald-400' : 'text-gold-100'}`}
                      />
                      <CurrencyInput
                        value={variant.defaultCost}
                        onChange={(value) =>
                          updateVariant(variant.id, { defaultCost: value })
                        }
                        placeholder={`${t('defaultCostOptional')}${perLabel}`}
                        className={`rounded-xl border border-white/[0.08] bg-black px-3 py-2 ${variant.defaultCost ? 'text-emerald-400' : 'text-gold-100'}`}
                      />
                    </div>
                  );
                })()}

                {/* VAT + Barcode + Track stock row */}
                <div className="grid gap-3 md:grid-cols-2">
                  <SmartSelect
                    instanceId={`wizard-variant-vat-${variant.id}`}
                    value={variant.vatMode}
                    onChange={(value) =>
                      updateVariant(variant.id, { vatMode: value })
                    }
                    options={vatOptions}
                  />
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <TextInput
                        label={t('barcodeOptional')}
                        value={variant.barcode}
                        onChange={(event) =>
                          updateVariant(variant.id, { barcode: event.target.value })
                        }
                        placeholder={t('barcodeOptional')}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setScanTargetId(variant.id);
                        setScanMessage(null);
                        setScanAutoStart(true);
                      }}
                      className="mb-px flex h-[38px] items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-xs text-[var(--nvi-text-muted)] transition-colors hover:bg-white/[0.08] hover:text-[var(--nvi-text)] nvi-press"
                    >
                      <Icon name="Scan" size={14} />
                      {t('scanAssign')}
                    </button>
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
                  <Checkbox
                    checked={variant.trackStock}
                    onChange={(checked) =>
                      updateVariant(variant.id, { trackStock: checked })
                    }
                  />
                  {t('trackStock')}
                </label>

                {/* Units section — collapsed by default via details */}
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--nvi-text-muted)] hover:text-[var(--nvi-text)] transition-colors select-none flex items-center gap-1.5">
                    <Icon name="ChevronRight" size={12} className="transition-transform group-open:rotate-90" />
                    {t('baseUnit')} / {t('sellUnit')}
                  </summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="space-y-1 text-xs text-[var(--nvi-text-muted)]">
                      <span>{t('baseUnit')}</span>
                      <SmartSelect
                        instanceId={`wizard-variant-base-unit-${variant.id}`}
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
                    <label className="space-y-1 text-xs text-[var(--nvi-text-muted)]">
                      <span>{t('sellUnit')}</span>
                      <SmartSelect
                        instanceId={`wizard-variant-sell-unit-${variant.id}`}
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
                    <label className="space-y-1 text-xs text-[var(--nvi-text-muted)]">
                      <span>{t('conversionFactor')}</span>
                      <TextInput
                        label={t('conversionFactor')}
                        value={variant.conversionFactor}
                        onChange={(event) =>
                          updateVariant(variant.id, {
                            conversionFactor: event.target.value,
                          })
                        }
                        placeholder={t('conversionFactor')}
                        disabled={(variant.sellUnitId || variant.baseUnitId) === variant.baseUnitId}
                      />
                      <p className="text-[10px] text-[var(--nvi-text-muted)]">{t('conversionHint')}</p>
                      {(() => {
                        const bUnit = units.find((u) => u.id === variant.baseUnitId);
                        const sUnit = units.find((u) => u.id === (variant.sellUnitId || variant.baseUnitId));
                        const factor = Number(variant.conversionFactor) || 1;
                        return bUnit && sUnit && factor > 1 ? (
                          <UnitHelpPanel
                            mode="hint"
                            baseUnitLabel={bUnit.label || bUnit.code}
                            sellUnitLabel={sUnit.label || sUnit.code}
                            conversionFactor={factor}
                          />
                        ) : null;
                      })()}
                    </label>
                  </div>
                  <UnitHelpPanel mode="full" className="mt-3" />
                </details>

                {/* Branch availability */}
                {branches.length > 1 ? (
                  <div className="space-y-1 border-t border-white/[0.04] pt-3">
                    <p className="text-xs text-[var(--nvi-text-muted)]">{t('availableAtBranches')}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-[var(--nvi-text)]">
                      {branches.map((branch) => (
                        <label key={branch.id} className="flex items-center gap-2">
                          <Checkbox
                            checked={variant.availableBranchIds.includes(branch.id)}
                            onChange={(checked) =>
                              updateVariant(variant.id, {
                                availableBranchIds: checked
                                  ? [...variant.availableBranchIds, branch.id]
                                  : variant.availableBranchIds.filter((id) => id !== branch.id),
                              })
                            }
                          />
                          {branch.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}

            {/* Add variant button */}
            <button
              type="button"
              onClick={addVariant}
              className="w-full rounded-lg border border-dashed border-purple-400/30 bg-purple-500/[0.03] px-4 py-3 text-sm text-purple-300 transition-colors hover:border-purple-400/50 hover:bg-purple-500/[0.06] nvi-press inline-flex items-center justify-center gap-2"
            >
              <Icon name="Plus" size={15} />
              {t('addVariant')}
            </button>
          </div>

          {/* Scanner overlay */}
          {scanTargetId ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="mx-4 w-full max-w-md rounded-xl border border-white/[0.08] bg-[var(--nvi-bg,#0a0a0a)] p-5 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--nvi-text)]">
                    {t('scanAssignTitle')}
                  </h4>
                  <button
                    type="button"
                    onClick={stopScan}
                    className="rounded-lg p-1.5 text-[var(--nvi-text-muted)] transition-colors hover:bg-white/[0.06] hover:text-[var(--nvi-text)] nvi-press"
                  >
                    <Icon name="X" size={16} />
                  </button>
                </div>
                <p className="text-xs text-[var(--nvi-text-muted)]">
                  {t('scanAssignSubtitle', { variant: scanTargetLabel })}
                </p>
                {scanMessage ? (
                  <p className="text-xs text-emerald-400">{scanMessage}</p>
                ) : null}
                <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-black">
                  <video ref={videoRef} className="w-full" />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScanAutoStart(true);
                      startScan(scanTargetId);
                    }}
                    className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-purple-500 nvi-press"
                  >
                    {scanActive ? t('scanRestart') : t('scanStart')}
                  </button>
                  {scanActive ? (
                    <button
                      type="button"
                      onClick={stopScan}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-[var(--nvi-text-muted)] transition-colors hover:bg-white/[0.08] nvi-press"
                    >
                      {t('scanStop')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Step 2: Initial Stock (Amber zone) ── */}
      {step === 2 ? (
        <div className="border-l-2 border-l-amber-400 rounded-xl bg-white/[0.02] p-5 space-y-4 nvi-slide-in-bottom">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
              <Icon name="Package" size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--nvi-text)]">{t('initialStockTitle')}</h3>
              <p className="text-xs text-[var(--nvi-text-muted)]">{t('initialStockHint')}</p>
            </div>
          </div>

          {/* Column header for md+ */}
          <div className="hidden md:grid md:grid-cols-4 gap-2 px-1 text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)]">
            <span>{t('variantName')}</span>
            <span>{t('selectBranch')}</span>
            <span>{t('quantity')}</span>
            <span>{t('unit')}</span>
          </div>

          <div className="space-y-2">
            {variants.map((variant) => {
              const line = stockLines.find((l) => l.variantId === variant.id);
              return (
                <div
                  key={variant.id}
                  className="grid gap-2 md:grid-cols-4 items-center rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5"
                >
                  <div className="text-sm font-medium text-[var(--nvi-text)] truncate">
                    {variant.name || t('empty')}
                  </div>
                  <SmartSelect
                    instanceId={`wizard-variant-branch-${variant.id}`}
                    value={line?.branchId || ''}
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
                  <TextInput
                    label={t('quantity')}
                    value={line?.quantity || ''}
                    onChange={(event) =>
                      syncStockLine(variant.id, { quantity: event.target.value })
                    }
                    placeholder={t('quantity')}
                    className="text-lg font-semibold"
                  />
                  <SmartSelect
                    instanceId={`wizard-variant-unit-${variant.id}`}
                    value={line?.unitId || variant.sellUnitId || variant.baseUnitId || ''}
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
              );
            })}
          </div>
        </div>
      ) : null}

      {/* ── Step 3: Review (Emerald zone) ── */}
      {step === 3 ? (
        <div className="border-l-2 border-l-emerald-400 rounded-xl bg-white/[0.02] p-5 space-y-5 nvi-slide-in-bottom">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Icon name="ClipboardCheck" size={16} className="text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold text-[var(--nvi-text)]">{t('reviewTitle')}</h3>
          </div>

          {/* Product summary */}
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('reviewProduct')}</span>
              <span className="text-sm font-semibold text-[var(--nvi-text)]">{product.name || t('empty')}</span>
            </div>
            {product.categoryId ? (
              <div className="flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-wide text-[var(--nvi-text-muted)]">{t('category')}</span>
                <span className="text-sm text-[var(--nvi-text)]">
                  {categories.find((c) => c.id === product.categoryId)?.name ?? ''}
                </span>
              </div>
            ) : null}
          </div>

          {/* Totals */}
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-1.5">
              <Icon name="Layers" size={14} className="text-purple-400" />
              <span className="text-purple-300">{filteredVariants.length} {t('reviewVariants').toLowerCase()}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-1.5">
              <Icon name="Package" size={14} className="text-amber-400" />
              <span className="text-amber-300">{activeStockLines.length} {t('reviewStockLines').toLowerCase()}</span>
            </div>
          </div>

          {/* Variants table */}
          {filteredVariants.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    <th className="px-4 py-2 text-left text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)] font-medium">{t('variantName')}</th>
                    <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)] font-medium">{t('defaultPrice')}</th>
                    <th className="px-4 py-2 text-right text-[11px] uppercase tracking-wide text-[var(--nvi-text-muted)] font-medium">{t('quantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVariants.map((variant) => {
                    const line = stockLines.find((l) => l.variantId === variant.id);
                    const qty = Number(line?.quantity) || 0;
                    return (
                      <tr key={variant.id} className="border-b border-white/[0.03] last:border-0">
                        <td className="px-4 py-2.5 text-[var(--nvi-text)]">{variant.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-400">
                          {variant.defaultPrice ? Number(variant.defaultPrice).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[var(--nvi-text)]">
                          {qty > 0 ? qty.toLocaleString() : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Navigation ── */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={async () => {
            const confirmed = await notify.confirm({
              message: t('confirmCancel'),
              confirmText: common('confirm'),
              cancelText: common('cancel'),
            });
            if (!confirmed) {
              return;
            }
            router.push(`/${locale}/catalog/products`);
          }}
          className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-[var(--nvi-text-muted)] transition-colors hover:bg-white/[0.08] nvi-press inline-flex items-center gap-1.5"
        >
          <Icon name="X" size={14} />
          {common('cancel')}
        </button>
        {step > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-[var(--nvi-text-muted)] transition-colors hover:bg-white/[0.08] nvi-press inline-flex items-center gap-1.5"
          >
            <Icon name="ChevronLeft" size={14} />
            {actions('back')}
          </button>
        ) : null}
        <div className="flex-1" />
        {step < steps.length - 1 ? (
          <button
            type="button"
            onClick={goNext}
            className={`rounded-lg px-4 py-2 text-sm font-semibold nvi-press inline-flex items-center gap-1.5 transition-colors ${nextBtnClass}`}
          >
            {t('continue')}
            <Icon name="ChevronRight" size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submitWizard}
            disabled={isSubmitting}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70 nvi-press inline-flex items-center gap-2"
          >
            {isSubmitting ? <Spinner size="xs" variant="orbit" /> : <Icon name="Check" size={15} />}
            {isSubmitting ? t('creating') : t('finish')}
          </button>
        )}
      </div>
    </section>
  );
}
