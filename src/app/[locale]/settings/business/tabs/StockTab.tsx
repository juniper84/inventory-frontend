'use client';

import { useTranslations } from 'next-intl';
import { Package, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { SmartSelect } from '@/components/SmartSelect';
import { AnalogToggle } from '@/components/analog';
import { useFormatDate } from '@/lib/business-context';
import type { useBusinessSettings } from '../hooks/useBusinessSettings';

type Props = { ctx: ReturnType<typeof useBusinessSettings> };

export function StockTab({ ctx }: Props) {
  const t = useTranslations('businessSettingsPage');
  const { formatDateTime } = useFormatDate();
  const d = ctx.draftSettings;
  if (!d) return null;

  const update = (field: string, value: unknown) => {
    ctx.setDraftSettings({
      ...d,
      stockPolicies: { ...d.stockPolicies, [field]: value },
    });
  };

  return (
    <div className="space-y-4">
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-cyan-400">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10">
              <Package size={18} className="text-cyan-400" />
            </div>
            <h3 className="text-base font-semibold text-nvi-text-primary">{t('stockPoliciesTitle')}</h3>
            {ctx.sectionTimestamp('stock') && (
              <span className="text-[10px] text-nvi-text-tertiary">{t('lastUpdated', { date: formatDateTime(ctx.sectionTimestamp('stock')!) })}</span>
            )}
          </div>
          {ctx.isEditing && (
            <button
              type="button"
              onClick={() => ctx.resetSection('stock')}
              className="inline-flex items-center gap-1 rounded-xl border border-nvi-border px-2 py-0.5 text-[10px] text-nvi-text-tertiary hover:text-nvi-text-primary nvi-press"
            >
              <RotateCcw size={10} />
              {t('resetDefaults')}
            </button>
          )}
        </div>

        <p className="mb-4 text-xs text-nvi-text-tertiary">{t('stockPoliciesHint')}</p>

        <div className="grid gap-4 text-sm text-nvi-text-secondary">
          {/* Toggle rows */}
          <label className="flex items-center gap-2">
            <AnalogToggle checked={d.stockPolicies.negativeStockAllowed} disabled={!ctx.isEditing} onChange={(checked) => update('negativeStockAllowed', checked)} />
            {t('allowNegativeStock')}
          </label>
          <label className="flex items-center gap-2">
            <AnalogToggle checked={d.stockPolicies.batchTrackingEnabled} disabled={!ctx.isEditing} onChange={(checked) => update('batchTrackingEnabled', checked)} />
            {t('enableBatchTracking')}
          </label>

          {/* Selects */}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('fifoFefo')}</p>
              <SmartSelect
                instanceId="stock-fifo"
                value={d.stockPolicies.fifoMode}
                onChange={(value) => update('fifoMode', value)}
                options={[{ value: 'FIFO', label: 'FIFO' }, { value: 'FEFO', label: 'FEFO' }]}
                isDisabled={!ctx.isEditing}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('valuationMethod')}</p>
              <SmartSelect
                instanceId="stock-valuation"
                value={d.stockPolicies.valuationMethod}
                onChange={(value) => update('valuationMethod', value)}
                options={[{ value: 'FIFO', label: 'FIFO' }, { value: 'LIFO', label: 'LIFO' }, { value: 'AVERAGE', label: 'Average' }]}
                isDisabled={!ctx.isEditing}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('expiryPolicy')}</p>
              <SmartSelect
                instanceId="stock-expiry"
                value={d.stockPolicies.expiryPolicy}
                onChange={(value) => update('expiryPolicy', value)}
                options={[{ value: 'ALLOW', label: 'Allow' }, { value: 'WARN', label: 'Warn' }, { value: 'BLOCK', label: 'Block' }]}
                isDisabled={!ctx.isEditing}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('transferBatchPolicy')}</p>
              <SmartSelect
                instanceId="stock-transfer-batch"
                value={d.stockPolicies.transferBatchPolicy}
                onChange={(value) => update('transferBatchPolicy', value)}
                options={[{ value: 'PRESERVE', label: 'Preserve' }, { value: 'RECREATE', label: 'Recreate' }]}
                isDisabled={!ctx.isEditing}
              />
            </div>
          </div>

          {/* Number inputs */}
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput
              label={t('expiryAlertDays')}
              type="number"
              value={String(d.stockPolicies.expiryAlertDays)}
              disabled={!ctx.isEditing}
              onChange={(e) => update('expiryAlertDays', Math.max(1, parseInt(e.target.value) || 1))}
            />
            <TextInput
              label={t('lowStockThreshold')}
              type="number"
              value={String(d.stockPolicies.lowStockThreshold)}
              disabled={!ctx.isEditing}
              onChange={(e) => update('lowStockThreshold', Math.max(0, parseInt(e.target.value) || 0))}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
