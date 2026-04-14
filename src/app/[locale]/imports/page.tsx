'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useFormatDate } from '@/lib/business-context';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { Spinner } from '@/components/Spinner';
import { Banner } from '@/components/notifications/Banner';
import {
  StatusBadge,
  ProgressBar,
  CollapsibleSection,
  Icon,
  PageHeader,
  EmptyState,
} from '@/components/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

type Branch = { id: string; name: string };

type ImportPreview = {
  validRows: number;
  invalidRows: number;
  errors: { row: number; message: string }[];
  preview: Record<string, unknown>[];
};

type ImportHistoryEntry = {
  id: string;
  type: string;
  validRows: number;
  invalidRows: number;
  errors: { row: number; message: string }[];
  user?: { id: string; name: string } | null;
  createdAt: string;
};

// ─── Template data ──────────────────────────────────────────────────────────

const IMPORT_TEMPLATES: Record<string, {
  headers: string[];
  example: string[][];
  /** When set, branch names are appended as extra columns */
  dynamicBranches?: boolean;
  /** Position to insert branch columns: 'after-first' inserts after the 1st header (for stock types), 'end' appends at the end (default) */
  branchInsert?: 'after-first' | 'end';
  /** 'quantity' = cell values are numeric quantities; 'yes-no' = cell values are yes/blank (default for end-insert) */
  branchValueType?: 'quantity' | 'yes-no';
}> = {
  categories: {
    headers: ['name', 'status', 'parent (optional)'],
    example: [
      ['Electronics', 'ACTIVE', ''],
      ['Phones', 'ACTIVE', 'Electronics'],
      ['Tablets', 'ACTIVE', 'Electronics'],
      ['Beverages', 'ACTIVE', ''],
      ['Soft Drinks', 'ACTIVE', 'Beverages'],
    ],
  },
  products: {
    headers: ['product_name', 'category', 'status', 'variant_name', 'description (optional)', 'sku (optional)', 'barcode (optional)', 'price', 'cost', 'min_price (optional)', 'vat_mode (optional)', 'base_unit', 'sell_unit', 'conversion_factor', 'track_stock'],
    example: [
      ['iPhone Case', 'Accessories', 'ACTIVE', 'Red', 'Protective phone case', 'SKU-001', '12345678', '10000', '6000', '8000', 'INCLUSIVE', 'piece', 'piece', '1', 'true'],
      ['iPhone Case', 'Accessories', 'ACTIVE', 'Blue', '', 'SKU-002', '', '10000', '6000', '', '', '', '', '', ''],
      ['iPhone Case', 'Accessories', 'ACTIVE', 'Black', '', 'SKU-003', '', '10000', '6000', '', '', '', '', '', ''],
      ['Water Bottle', 'Beverages', 'ACTIVE', '500ml', '', 'W-500', '', '1000', '500', '', '', '', '', '', ''],
      ['Water Bottle', 'Beverages', 'ACTIVE', '1 Liter', '', 'W-1000', '', '1800', '900', '', '', '', '', '', ''],
      ['Rice', 'Food', 'ACTIVE', '5kg Bag', 'Premium rice', 'RICE-5', '', '15000', '10000', '12000', 'INCLUSIVE', 'kg', 'bag', '5', 'true'],
      ['Soap', 'Cleaning', 'ACTIVE', 'Bar', '', '', '', '2000', '1200', '', 'INCLUSIVE', 'piece', 'box', '24', ''],
    ],
    dynamicBranches: true,
    branchValueType: 'yes-no',
  },
  opening_stock: {
    headers: ['product_name', 'variant_name', 'sku (optional)', 'variant_id (optional)', 'batch_id (optional)', 'expiry_date (optional)', 'unit_cost (optional)'],
    example: [
      ['iPhone Case', 'Red', '', '', '', '', '6000'],
      ['iPhone Case', 'Blue', '', '', '', '', '6000'],
      ['Water Bottle', '500ml', '', '', 'BATCH-JAN', '2027-06-15', '500'],
      ['Rice', '5kg Bag', '', '', '', '', '10000'],
    ],
    dynamicBranches: true,
    branchValueType: 'quantity',
  },
  price_updates: {
    headers: ['product_name', 'variant_name', 'price', 'sku (optional)', 'variant_id (optional)', 'vat_mode (optional)', 'min_price (optional)'],
    example: [
      ['iPhone Case', 'Red', '12000', '', '', '', '9000'],
      ['iPhone Case', 'Blue', '12000', '', '', '', '9000'],
      ['Water Bottle', '500ml', '1200', '', '', '', ''],
      ['Rice', '5kg Bag', '16000', '', '', 'INCLUSIVE', '13000'],
    ],
  },
  status_updates: {
    headers: ['product_name', 'status', 'variant_name (optional)'],
    example: [
      ['iPhone Case', 'INACTIVE', ''],
      ['iPhone Case', 'ARCHIVED', 'Red'],
      ['Water Bottle', 'ACTIVE', ''],
    ],
  },
  suppliers: {
    headers: ['name', 'status', 'phone', 'email (optional)', 'address (optional)', 'notes (optional)', 'lead_time_days (optional)'],
    example: [
      ['Acme Supplies', 'ACTIVE', '+255712345678', 'acme@example.com', '123 Main St Dar es Salaam', 'Reliable supplier', '7'],
      ['Fresh Foods Ltd', 'ACTIVE', '+255755555555', 'fresh@example.com', '', 'Perishable goods', '2'],
      ['Quick Parts', 'ACTIVE', '', '', 'Industrial Area', '', '14'],
    ],
  },
  branches: {
    headers: ['name', 'status', 'address (optional)', 'phone (optional)'],
    example: [
      ['Downtown', 'ACTIVE', '456 Center Ave Dar es Salaam', '+255798765432'],
      ['Airport', 'ACTIVE', 'Terminal 2 JNIA', ''],
      ['Warehouse', 'ACTIVE', 'Industrial Area Plot 12', '+255744444444'],
    ],
  },
  users: {
    headers: ['name', 'email', 'role', 'status', 'phone (optional)'],
    example: [
      ['John Doe', 'john@example.com', 'Manager', 'ACTIVE', '+255700000001'],
      ['Jane Smith', 'jane@example.com', 'Cashier', 'ACTIVE', '+255700000002'],
      ['Ali Hassan', 'ali@example.com', 'Cashier', 'ACTIVE', ''],
      ['Grace Mwangi', 'grace@example.com', 'Manager', 'ACTIVE', ''],
    ],
    dynamicBranches: true,
    branchValueType: 'yes-no',
  },
  customers: {
    headers: ['name', 'status', 'phone (optional)', 'email (optional)', 'tin (optional)', 'notes (optional)'],
    example: [
      ['ABC Trading Co', 'ACTIVE', '+255711111111', 'abc@example.com', 'TIN-12345', 'Wholesale customer'],
      ['Mama Lishe', 'ACTIVE', '+255722222222', '', '', 'Restaurant owner'],
      ['Local Shop', 'ACTIVE', '', '', '', ''],
      ['Hotel Mariam', 'ACTIVE', '+255733333333', 'mariam@hotel.co.tz', 'TIN-67890', 'Weekly orders'],
    ],
  },
  units: {
    headers: ['code', 'label', 'unit_type (optional)'],
    example: [
      ['piece', 'Piece', 'COUNT'],
      ['kg', 'Kilogram', 'WEIGHT'],
      ['box', 'Box', 'COUNT'],
      ['liter', 'Liter', 'VOLUME'],
      ['dozen', 'Dozen', 'COUNT'],
      ['bag', 'Bag', 'COUNT'],
      ['meter', 'Meter', 'LENGTH'],
    ],
  },
  stock_counts: {
    headers: ['product_name', 'variant_name', 'sku (optional)', 'variant_id (optional)', 'reason (optional)'],
    example: [
      ['iPhone Case', 'Red', '', '', 'Monthly count'],
      ['iPhone Case', 'Blue', '', '', ''],
      ['Water Bottle', '500ml', '', '', 'Quarterly audit'],
      ['Rice', '5kg Bag', '', '', 'Shortage found'],
    ],
    dynamicBranches: true,
    branchValueType: 'quantity',
  },
};

// ─── Card color + icon mapping ──────────────────────────────────────────────

const TEMPLATE_CARD_CONFIG: Record<string, {
  icon: 'FolderTree' | 'Package' | 'Layers' | 'DollarSign' | 'ToggleRight' | 'Truck' | 'Building2' | 'Users' | 'UserCheck' | 'Ruler' | 'ClipboardCheck';
  color: string; // tailwind color name
  bg: string;
  ring: string;
  ringSelected: string;
  bgSelected: string;
  text: string;
}> = {
  categories:     { icon: 'FolderTree',     color: 'amber',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20',   ringSelected: 'ring-amber-500/40',   bgSelected: 'bg-amber-500/[0.04]',   text: 'text-amber-400' },
  products:       { icon: 'Package',        color: 'blue',    bg: 'bg-blue-500/10',    ring: 'ring-blue-500/20',    ringSelected: 'ring-blue-500/40',    bgSelected: 'bg-blue-500/[0.04]',    text: 'text-blue-400' },
  opening_stock:  { icon: 'Layers',         color: 'cyan',    bg: 'bg-cyan-500/10',    ring: 'ring-cyan-500/20',    ringSelected: 'ring-cyan-500/40',    bgSelected: 'bg-cyan-500/[0.04]',    text: 'text-cyan-400' },
  price_updates:  { icon: 'DollarSign',     color: 'emerald', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', ringSelected: 'ring-emerald-500/40', bgSelected: 'bg-emerald-500/[0.04]', text: 'text-emerald-400' },
  status_updates: { icon: 'ToggleRight',    color: 'purple',  bg: 'bg-purple-500/10',  ring: 'ring-purple-500/20',  ringSelected: 'ring-purple-500/40',  bgSelected: 'bg-purple-500/[0.04]',  text: 'text-purple-400' },
  suppliers:      { icon: 'Truck',          color: 'amber',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20',   ringSelected: 'ring-amber-500/40',   bgSelected: 'bg-amber-500/[0.04]',   text: 'text-amber-400' },
  branches:       { icon: 'Building2',      color: 'blue',    bg: 'bg-blue-500/10',    ring: 'ring-blue-500/20',    ringSelected: 'ring-blue-500/40',    bgSelected: 'bg-blue-500/[0.04]',    text: 'text-blue-400' },
  users:          { icon: 'Users',          color: 'purple',  bg: 'bg-purple-500/10',  ring: 'ring-purple-500/20',  ringSelected: 'ring-purple-500/40',  bgSelected: 'bg-purple-500/[0.04]',  text: 'text-purple-400' },
  customers:      { icon: 'UserCheck',      color: 'emerald', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20', ringSelected: 'ring-emerald-500/40', bgSelected: 'bg-emerald-500/[0.04]', text: 'text-emerald-400' },
  units:          { icon: 'Ruler',          color: 'cyan',    bg: 'bg-cyan-500/10',    ring: 'ring-cyan-500/20',    ringSelected: 'ring-cyan-500/40',    bgSelected: 'bg-cyan-500/[0.04]',    text: 'text-cyan-400' },
  stock_counts:   { icon: 'ClipboardCheck', color: 'amber',   bg: 'bg-amber-500/10',   ring: 'ring-amber-500/20',  ringSelected: 'ring-amber-500/40',   bgSelected: 'bg-amber-500/[0.04]',   text: 'text-amber-400' },
};

/** Maps snake_case template keys to camelCase translation keys */
const TEMPLATE_I18N_KEY: Record<string, string> = {
  categories: 'categories',
  products: 'products',
  opening_stock: 'openingStock',
  price_updates: 'priceUpdates',
  status_updates: 'statusUpdates',
  suppliers: 'suppliers',
  branches: 'branches',
  users: 'users',
  customers: 'customers',
  units: 'units',
  stock_counts: 'stockCounts',
};

// ─── CSV helpers ────────────────────────────────────────────────────────────

function generateCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map((cell) => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(','));
  }
  return lines.join('\n');
}

function buildDynamicHeaders(
  baseHeaders: string[],
  branches: Branch[],
  insert: 'after-first' | 'end' = 'end',
): string[] {
  const branchNames = branches.map((b) => b.name);
  if (insert === 'after-first') {
    const [first, ...rest] = baseHeaders;
    return [first, ...branchNames, ...rest];
  }
  return [...baseHeaders, ...branchNames];
}

function buildDynamicExampleRows(
  baseHeaders: string[],
  baseExamples: string[][],
  branches: Branch[],
  insert: 'after-first' | 'end' = 'end',
  valueType: 'quantity' | 'yes-no' = 'yes-no',
): string[][] {
  return baseExamples.map((row, rowIdx) => {
    const branchCells = branches.map((_, branchIdx) => {
      if (valueType === 'quantity') {
        if (branchIdx === 0) return String((rowIdx + 1) * 50);
        if (branchIdx === 1 && rowIdx % 2 === 0) return String((rowIdx + 1) * 30);
        return '';
      }
      if (branchIdx === 0) return 'yes';
      if (branchIdx === 1 && rowIdx % 2 === 0) return 'yes';
      return '';
    });

    if (insert === 'after-first') {
      const [firstCol, ...restCols] = row;
      return [firstCol, ...branchCells, ...restCols];
    }
    return [...row, ...branchCells];
  });
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ImportsPage() {
  const t = useTranslations('importsPage');
  const { formatDateTime } = useFormatDate();
  const [message, setMessage] = useToastState();

  // ─── State ────────────────────────────────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [importCsv, setImportCsv] = useState('');
  const debouncedImportCsv = useDebouncedValue(importCsv, 1000);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedErrors, setCopiedErrors] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>([]);

  // ─── Data loaders ─────────────────────────────────────────────────────

  const loadBranches = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const branchData = await apiFetch<PaginatedResponse<Branch> | Branch[]>(
        '/branches?limit=200',
        { token },
      );
      setBranches(normalizePaginated(branchData).items);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const loadImportHistory = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<ImportHistoryEntry[]>('/imports/history', { token });
      setImportHistory(data);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('historyLoadFailed')),
      });
    }
  }, [setMessage, t]);

  useEffect(() => {
    loadBranches();
    loadImportHistory();
  }, [loadBranches, loadImportHistory]);

  // ─── Actions ──────────────────────────────────────────────────────────

  const previewImport = async () => {
    const token = getAccessToken();
    if (!token || !importCsv.trim() || !selectedType) return;
    setMessage(null);
    setImportError(null);
    setPreview(null);
    setCopiedErrors(false);
    setIsPreviewing(true);
    try {
      const result = await apiFetch<ImportPreview>('/imports/preview', {
        token,
        method: 'POST',
        body: JSON.stringify({ type: selectedType, csv: importCsv }),
      });
      setPreview(result);
    } catch (err) {
      setImportError(getApiErrorMessage(err, t('previewFailed')));
    } finally {
      setIsPreviewing(false);
    }
  };

  const applyImport = async () => {
    const token = getAccessToken();
    if (!token || !importCsv.trim() || !selectedType) return;
    const ok = await notify.confirm({
      title: t('confirmApplyTitle'),
      message: t('confirmApplyMessage'),
      confirmText: t('confirmApplyButton'),
    });
    if (!ok) return;
    setMessage(null);
    setImportError(null);
    setCopiedErrors(false);
    setIsApplying(true);
    try {
      const result = await apiFetch<ImportPreview>('/imports/apply', {
        token,
        method: 'POST',
        body: JSON.stringify({ type: selectedType, csv: importCsv }),
      });
      loadImportHistory();
      if (result.invalidRows === 0) {
        setPreview(null);
        setImportCsv('');
        setMessage({ action: 'import', outcome: 'success', message: t('applySuccess') });
      } else {
        setPreview(result);
      }
    } catch (err) {
      setImportError(getApiErrorMessage(err, t('applyFailed')));
    } finally {
      setIsApplying(false);
    }
  };

  // Auto-preview when CSV content or import type changes
  useEffect(() => {
    if (!debouncedImportCsv.trim() || !selectedType) {
      setPreview(null);
      setImportError(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    let cancelled = false;
    setImportError(null);
    setPreview(null);
    setCopiedErrors(false);
    setIsPreviewing(true);
    apiFetch<ImportPreview>('/imports/preview', {
      token,
      method: 'POST',
      body: JSON.stringify({ type: selectedType, csv: debouncedImportCsv }),
    })
      .then((result) => { if (!cancelled) setPreview(result); })
      .catch((err) => { if (!cancelled) setImportError(getApiErrorMessage(err, t('previewFailed'))); })
      .finally(() => { if (!cancelled) setIsPreviewing(false); });
    return () => { cancelled = true; };
  }, [debouncedImportCsv, selectedType, t]);

  // ─── Template download handlers ──────────────────────────────────────

  const handleDownloadTemplate = useCallback(async (type: string) => {
    const prefilledTypes = ['opening_stock', 'price_updates', 'status_updates', 'stock_counts'];
    if (prefilledTypes.includes(type)) {
      const token = getAccessToken();
      if (!token) return;
      try {
        const result = await apiFetch<{ csv: string }>(`/imports/template?type=${type}`, { token });
        downloadCsv(`${type}_template.csv`, result.csv);
      } catch (err) {
        setMessage({ action: 'import', outcome: 'failure', message: getApiErrorMessage(err, t('previewFailed')) });
      }
      return;
    }
    const tmpl = IMPORT_TEMPLATES[type];
    if (tmpl) {
      const hdrs = tmpl.dynamicBranches
        ? buildDynamicHeaders(tmpl.headers, branches, tmpl.branchInsert ?? 'end')
        : tmpl.headers;
      downloadCsv(`${type}_template.csv`, hdrs.join(',') + '\n');
    }
  }, [branches, setMessage, t]);

  const handleDownloadExample = useCallback((type: string) => {
    const tmpl = IMPORT_TEMPLATES[type];
    if (tmpl) {
      const hdrs = tmpl.dynamicBranches
        ? buildDynamicHeaders(tmpl.headers, branches, tmpl.branchInsert ?? 'end')
        : tmpl.headers;
      const rows = tmpl.dynamicBranches
        ? buildDynamicExampleRows(tmpl.headers, tmpl.example, branches, tmpl.branchInsert ?? 'end', tmpl.branchValueType ?? 'yes-no')
        : tmpl.example;
      downloadCsv(`${type}_example.csv`, generateCsv(hdrs, rows));
    }
  }, [branches]);

  // ─── Computed column guide for selected type ──────────────────────────

  const columnGuide = useMemo(() => {
    if (!selectedType) return [];
    const tmpl = IMPORT_TEMPLATES[selectedType];
    if (!tmpl) return [];
    const displayHeaders: { name: string; isOptional: boolean; isBranch: boolean }[] = [];
    const insertMode = tmpl.branchInsert ?? 'end';
    for (const header of tmpl.headers) {
      const isOptional = header.includes('(optional)');
      const cleanHeader = header.replace(/ \(optional\)/g, '');
      displayHeaders.push({ name: cleanHeader, isOptional, isBranch: false });
      if (tmpl.dynamicBranches && insertMode === 'after-first' && displayHeaders.length === 1) {
        for (const branch of branches) {
          displayHeaders.push({ name: branch.name, isOptional: true, isBranch: true });
        }
      }
    }
    if (tmpl.dynamicBranches && insertMode === 'end') {
      for (const branch of branches) {
        displayHeaders.push({ name: branch.name, isOptional: true, isBranch: true });
      }
    }
    return displayHeaders;
  }, [selectedType, branches]);

  // ─── Render helpers ───────────────────────────────────────────────────

  const selectedTmpl = selectedType ? IMPORT_TEMPLATES[selectedType] : null;
  const selectedConfig = selectedType ? TEMPLATE_CARD_CONFIG[selectedType] : null;
  const selectedI18nKey = selectedType ? (TEMPLATE_I18N_KEY[selectedType] ?? selectedType) : null;

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <section className="nvi-page nvi-stagger">

      {/* ── Hero ── */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {/* ── Status banner ── */}
      {message ? (
        <Banner
          severity={message.outcome === 'success' ? 'success' : message.outcome === 'failure' ? 'error' : 'info'}
          message={message.message}
          onDismiss={() => setMessage(null)}
        />
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 1 — Choose what to import
         ══════════════════════════════════════════════════════════════════ */}
      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-[color:var(--muted)]">
          {t('stepChoose')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(IMPORT_TEMPLATES).map(([key, tmpl]) => {
            const config = TEMPLATE_CARD_CONFIG[key];
            const i18nKey = TEMPLATE_I18N_KEY[key] ?? key;
            const isSelected = selectedType === key;
            const colCount = tmpl.dynamicBranches
              ? tmpl.headers.length + branches.length
              : tmpl.headers.length;

            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setSelectedType(key);
                  setImportCsv('');
                  setPreview(null);
                  setImportError(null);
                  setCopiedErrors(false);
                }}
                className={`nvi-card-hover nvi-press group relative flex items-start gap-3.5 rounded-2xl border p-4 text-left transition-all ${
                  isSelected
                    ? `ring-2 ${config.ringSelected} ${config.bgSelected} border-transparent`
                    : 'border-[color:var(--border)] bg-[color:var(--surface)] hover:border-[color:var(--border-hover,var(--border))] hover:shadow-lg hover:shadow-black/5'
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.bg} ring-1 ${config.ring}`}>
                  <Icon name={config.icon} size={20} className={config.text} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-bold text-[color:var(--foreground)] leading-tight">
                    {t(`types.${i18nKey}`)}
                  </p>
                  <p className="text-[11px] leading-relaxed text-[color:var(--muted)]">
                    {t(`typeDesc.${i18nKey}`)}
                  </p>
                  <span className="inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--muted)]">
                    {colCount} {t('columns')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          STEP 2 — Understand the format
         ══════════════════════════════════════════════════════════════════ */}
      {selectedType && selectedConfig && selectedI18nKey && selectedTmpl ? (
        <div className="nvi-slide-in-bottom space-y-5">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selectedConfig.bg} ring-1 ${selectedConfig.ring}`}>
                <Icon name={selectedConfig.icon} size={20} className={selectedConfig.text} />
              </div>
              <h2 className="text-base font-bold text-[color:var(--foreground)]">
                {t('stepFormatTitle', { type: t(`types.${selectedI18nKey}`) })}
              </h2>
            </div>
          </div>

          {/* Section A — What this import does */}
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {t('whatItDoes')}
            </h3>
            <p className="text-sm leading-relaxed text-[color:var(--foreground)]">
              {t(`importDesc.${selectedI18nKey}.what`)}
            </p>
          </div>

          {/* Section B — Column guide */}
          <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              {t('columnGuide')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[color:var(--foreground)]">
                <thead className="text-[10px] uppercase text-[color:var(--muted)]">
                  <tr>
                    <th className="px-2 py-1.5">{t('guideColumn')}</th>
                    <th className="px-2 py-1.5">{t('guideRequired')}</th>
                    <th className="px-2 py-1.5">{t('guideDescription')}</th>
                    <th className="px-2 py-1.5">{t('guideExample')}</th>
                  </tr>
                </thead>
                <tbody>
                  {columnGuide.map((col, idx) => {
                    const guideKey = `importGuide.${selectedType}.${col.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
                    let description: string;
                    if (col.isBranch) {
                      const valueType = selectedTmpl.branchValueType ?? 'yes-no';
                      description = valueType === 'quantity'
                        ? t('importGuide.branchQuantity', { branch: col.name })
                        : t('importGuide.branchAvailability', { branch: col.name });
                    } else {
                      try { description = t(guideKey); } catch { description = col.name; }
                      if (description === guideKey) description = col.name;
                    }
                    // Get example value from the first example row
                    const exampleRow = selectedTmpl.example[0];
                    const headerIdx = selectedTmpl.headers.findIndex((h) =>
                      h.replace(/ \(optional\)/g, '') === col.name,
                    );
                    const exampleVal = col.isBranch
                      ? (selectedTmpl.branchValueType === 'quantity' ? '50' : 'yes')
                      : (headerIdx >= 0 && exampleRow ? exampleRow[headerIdx] || '---' : '---');

                    return (
                      <tr key={`${col.name}-${idx}`} className="border-t border-[color:var(--border)]">
                        <td className="px-2 py-1.5 font-mono text-[color:var(--foreground)]">{col.name}</td>
                        <td className="px-2 py-1.5">
                          {col.isOptional ? (
                            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-[color:var(--muted)]">{t('guideOptional')}</span>
                          ) : (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">{t('guideYes')}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-[color:var(--muted)]">{description}</td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-[color:var(--muted)]">{exampleVal}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section C — Important notes */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400/80">
              {t('importantNotes')}
            </h3>
            <p className="text-sm leading-relaxed text-[color:var(--foreground)]">
              {t(`importDesc.${selectedI18nKey}.notes`)}
            </p>
            <p className="text-xs leading-relaxed text-[color:var(--muted)]">
              {t(`importDesc.${selectedI18nKey}.apply`)}
            </p>
          </div>

          {/* Section D — Download */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => handleDownloadTemplate(selectedType)}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500/10 px-4 py-2.5 text-xs font-semibold text-blue-400 ring-1 ring-blue-500/20 transition-all hover:bg-blue-500/20 hover:ring-blue-500/30"
            >
              <Icon name="FileDown" size={14} />
              {t('downloadTemplate')}
            </button>
            <button
              type="button"
              onClick={() => handleDownloadExample(selectedType)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/20 transition-all hover:bg-emerald-500/20 hover:ring-emerald-500/30"
            >
              <Icon name="FileSpreadsheet" size={14} />
              {t('downloadExample')}
            </button>
          </div>
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 3 — Upload and preview
         ══════════════════════════════════════════════════════════════════ */}
      {selectedType ? (
        <div className="nvi-slide-in-bottom space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-[color:var(--muted)]">
            {t('stepUpload')}
          </h2>

          {/* Upload area */}
          <div className="rounded-xl border-2 border-dashed border-[color:var(--border)] bg-[color:var(--surface)]/40 p-4 transition-colors hover:border-[color:var(--accent)]/40">
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--accent)]/10 ring-1 ring-[color:var(--accent)]/20">
                <Icon name="Upload" size={20} className="text-[color:var(--accent)]" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[color:var(--accent)]/10 px-3.5 py-2 text-xs font-semibold text-[color:var(--accent)] ring-1 ring-[color:var(--accent)]/20 transition-all hover:bg-[color:var(--accent)]/20">
                  <Icon name="Upload" size={12} />
                  {t('uploadCsv')}
                  <input
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        const text = e.target?.result;
                        if (typeof text === 'string') {
                          setImportCsv(text);
                        }
                      };
                      reader.readAsText(file);
                      event.target.value = '';
                    }}
                  />
                </label>
                <span className="ml-2 text-xs text-[color:var(--muted)]">{t('orPasteCsv')}</span>
              </div>
            </div>
          </div>

          {/* CSV textarea */}
          <textarea
            value={importCsv}
            onChange={(event) => setImportCsv(event.target.value)}
            rows={6}
            placeholder={t('csvPlaceholder')}
            className="w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)]/50 focus:outline-none focus:ring-1 focus:ring-[color:var(--accent)]/30"
          />

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={previewImport}
              className="inline-flex items-center gap-2 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-2 text-xs font-medium text-[color:var(--foreground)] transition-all hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isPreviewing || !importCsv.trim()}
            >
              {isPreviewing ? <Spinner size="xs" variant="grid" /> : <Icon name="Eye" size={14} />}
              {isPreviewing ? t('validating') : t('previewButton')}
            </button>
            <button
              type="button"
              onClick={applyImport}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/20 transition-all hover:bg-emerald-500/20 hover:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isApplying || !importCsv.trim() || (preview !== null && preview.invalidRows > 0)}
            >
              {isApplying ? <Spinner size="xs" variant="pulse" /> : <Icon name="CircleCheck" size={14} />}
              {isApplying ? t('applying') : t('applyButton')}
            </button>
          </div>

          {/* Applying progress */}
          {isApplying ? (
            <ProgressBar value={33} max={100} color="accent" height={4} />
          ) : null}

          {/* Import error */}
          {importError ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="TriangleAlert" size={16} className="text-red-400" />
                  <h4 className="text-sm font-semibold text-red-300">{t('importErrorTitle')}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setImportError(null)}
                  className="text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                >
                  {t('dismiss')}
                </button>
              </div>
              <p className="text-sm text-red-200">{importError}</p>
            </div>
          ) : null}

          {/* Preview results */}
          {preview ? (
            <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 space-y-4">
              {/* Summary header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon name="ChartColumn" size={16} className="text-[color:var(--accent)]" />
                  <h4 className="text-sm font-semibold text-[color:var(--foreground)]">{t('previewResultsTitle')}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => { setPreview(null); setCopiedErrors(false); }}
                  className="text-xs text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                >
                  {t('backToEdit')}
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--muted)]">{t('totalRows')}</p>
                  <p className="text-lg font-bold tabular-nums text-[color:var(--foreground)]">{preview.validRows + preview.invalidRows}</p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 text-center ring-1 ring-emerald-500/10">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{t('validRows')}</p>
                  <p className="text-lg font-bold tabular-nums text-emerald-300">{preview.validRows}</p>
                </div>
                <div className={`rounded-xl border p-3 text-center ${preview.invalidRows > 0 ? 'border-red-500/20 bg-red-500/[0.06] ring-1 ring-red-500/10' : 'border-[color:var(--border)] bg-[color:var(--surface)]'}`}>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${preview.invalidRows > 0 ? 'text-red-400' : 'text-[color:var(--muted)]'}`}>{t('invalidRows')}</p>
                  <p className={`text-lg font-bold tabular-nums ${preview.invalidRows > 0 ? 'text-red-300' : 'text-[color:var(--foreground)]'}`}>{preview.invalidRows}</p>
                </div>
                <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--muted)]">{t('errorCount')}</p>
                  <p className="text-lg font-bold tabular-nums text-[color:var(--foreground)]">{preview.errors.length}</p>
                </div>
              </div>

              {/* Progress bar */}
              <ProgressBar
                value={preview.validRows}
                max={preview.validRows + preview.invalidRows}
                label={t('validRows')}
                showPercent
                height={8}
                color={preview.invalidRows > 0 ? 'amber' : 'green'}
              />

              {/* Success state */}
              {preview.errors.length === 0 ? (
                <div className="rounded-xl border border-emerald-700/30 bg-emerald-500/10 p-4 text-center space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <Icon name="CircleCheck" size={20} className="text-emerald-400" />
                    <p className="text-sm font-medium text-emerald-300">{t('allValid')}</p>
                  </div>
                  <p className="text-xs text-emerald-400">{t('readyToApply')}</p>
                </div>
              ) : null}

              {/* Error table */}
              {preview.errors.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-red-300">
                      {t('issuesFound', { count: preview.errors.length })}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const text = preview.errors
                          .map((err) => `Row ${err.row}: ${err.message}`)
                          .join('\n');
                        navigator.clipboard.writeText(text).then(() => {
                          setCopiedErrors(true);
                          setTimeout(() => setCopiedErrors(false), 3000);
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[color:var(--border)] px-2 py-1 text-[10px] text-[color:var(--muted)] transition-colors hover:text-[color:var(--foreground)]"
                    >
                      <Icon name="Copy" size={10} />
                      {copiedErrors ? t('errorsCopied') : t('copyErrors')}
                    </button>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto rounded-xl border border-red-500/30 bg-red-500/5">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-red-500/10 text-[10px] uppercase text-red-400">
                        <tr>
                          <th className="px-3 py-2 w-16">{t('errorRow')}</th>
                          <th className="px-3 py-2">{t('errorIssue')}</th>
                        </tr>
                      </thead>
                      <tbody className="text-red-200">
                        {preview.errors.map((err, idx) => (
                          <tr key={`${err.row}-${idx}`} className="border-t border-red-500/10">
                            <td className="px-3 py-2 font-mono text-red-300">{err.row}</td>
                            <td className="px-3 py-2">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 4 — Import history
         ══════════════════════════════════════════════════════════════════ */}
      <CollapsibleSection
        title={t('stepHistory')}
        storageKey="imports-history"
        badge={
          importHistory.length > 0 ? (
            <span className="rounded-full bg-[color:var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[color:var(--accent)]">
              {importHistory.length}
            </span>
          ) : undefined
        }
      >
        {importHistory.length ? (
          <div className="space-y-2 text-sm">
            {importHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3"
              >
                <StatusBadge status={entry.type} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[color:var(--foreground)]">
                    {t('historyEntry', {
                      type: entry.type,
                      valid: entry.validRows,
                      invalid: entry.invalidRows,
                      user: entry.user?.name ?? '---',
                      date: formatDateTime(entry.createdAt),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400">{entry.validRows} {t('validRows').toLowerCase()}</span>
                  {entry.invalidRows > 0 ? (
                    <span className="text-red-400">{entry.invalidRows} {t('invalidRows').toLowerCase()}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Icon name="History" size={32} className="text-[color:var(--muted)]" />}
            title={t('historyEmpty')}
          />
        )}
      </CollapsibleSection>
    </section>
  );
}
