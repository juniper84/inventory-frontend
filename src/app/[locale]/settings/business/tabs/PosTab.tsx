'use client';

import { useTranslations } from 'next-intl';
import { ShoppingCart, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { SmartSelect } from '@/components/SmartSelect';
import { AnalogToggle } from '@/components/analog';
import { Banner } from '@/components/notifications/Banner';
import { useFormatDate } from '@/lib/business-context';
import type { useBusinessSettings } from '../hooks/useBusinessSettings';

type Props = { ctx: ReturnType<typeof useBusinessSettings> };

export function PosTab({ ctx }: Props) {
  const t = useTranslations('businessSettingsPage');
  const { formatDateTime } = useFormatDate();
  const d = ctx.draftSettings;
  if (!d) return null;

  const updatePos = (field: string, value: unknown) => {
    ctx.setDraftSettings({
      ...d,
      posPolicies: { ...d.posPolicies, [field]: value },
    });
  };

  const updateOffline = (field: string, value: unknown) => {
    ctx.setDraftSettings({
      ...d,
      posPolicies: {
        ...d.posPolicies,
        offlineLimits: { ...d.posPolicies.offlineLimits, [field]: value },
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Receipt settings ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
              <ShoppingCart size={18} className="text-amber-400" />
            </div>
            <h3 className="text-base font-semibold text-nvi-text-primary">{t('posPoliciesTitle')}</h3>
            {ctx.sectionTimestamp('pos') && (
              <span className="text-[10px] text-nvi-text-tertiary">{t('lastUpdated', { date: formatDateTime(ctx.sectionTimestamp('pos')!) })}</span>
            )}
          </div>
          {ctx.isEditing && (
            <button
              type="button"
              onClick={() => ctx.resetSection('pos')}
              className="inline-flex items-center gap-1 rounded-xl border border-nvi-border px-2 py-0.5 text-[10px] text-nvi-text-tertiary hover:text-nvi-text-primary nvi-press"
            >
              <RotateCcw size={10} />
              {t('resetDefaults')}
            </button>
          )}
        </div>

        {/* Receipt template + branch contact */}
        <div className="grid gap-4 text-sm text-nvi-text-secondary">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('receiptTemplate')}</p>
              <SmartSelect
                instanceId="pos-receipt-template"
                value={d.posPolicies.receiptTemplate}
                onChange={(value) => updatePos('receiptTemplate', value)}
                options={[{ value: 'THERMAL', label: 'Thermal' }, { value: 'A4', label: 'A4' }]}
                isDisabled={!ctx.isEditing}
              />
            </div>
            <label className="flex items-center gap-2 self-end">
              <AnalogToggle checked={d.posPolicies.showBranchContact} disabled={!ctx.isEditing} onChange={(checked) => updatePos('showBranchContact', checked)} />
              {t('showBranchContact')}
            </label>
          </div>

          {/* Header / Footer */}
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label={t('receiptHeader')} value={d.posPolicies.receiptHeader} disabled={!ctx.isEditing} onChange={(e) => updatePos('receiptHeader', e.target.value)} />
            <TextInput label={t('receiptFooter')} value={d.posPolicies.receiptFooter} disabled={!ctx.isEditing} onChange={(e) => updatePos('receiptFooter', e.target.value)} />
          </div>
        </div>
      </Card>

      {/* ── Sales controls ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('salesControls') || 'Sales controls'}</p>
        <div className="grid gap-4 text-sm text-nvi-text-secondary">
          <label className="flex items-center gap-2">
            <AnalogToggle checked={d.posPolicies.creditEnabled} disabled={!ctx.isEditing} onChange={(checked) => updatePos('creditEnabled', checked)} />
            {t('allowCredit')}
          </label>
          <label className="flex items-center gap-2">
            <AnalogToggle checked={d.posPolicies.priceEditEnabled} disabled={!ctx.isEditing} onChange={(checked) => updatePos('priceEditEnabled', checked)} />
            {t('allowPriceEdit')}
          </label>
          <label className="flex items-center gap-2">
            <AnalogToggle checked={d.posPolicies.shiftTrackingEnabled} disabled={!ctx.isEditing} onChange={(checked) => updatePos('shiftTrackingEnabled', checked)} />
            {t('requireShift')}
          </label>
          <label className="flex items-center gap-2">
            <AnalogToggle checked={d.posPolicies.refundReturnToStockDefault} disabled={!ctx.isEditing} onChange={(checked) => updatePos('refundReturnToStockDefault', checked)} />
            {t('refundReturnStock')}
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <TextInput label={t('shiftVariance')} type="number" value={String(d.posPolicies.shiftVarianceThreshold)} disabled={!ctx.isEditing} onChange={(e) => updatePos('shiftVarianceThreshold', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </Card>

      {/* ── Maximum discount allowed (POS threshold — bug fix: improved label) ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
          {t('posDiscountTitle') || 'Maximum discount allowed'}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput
            label={t('discountThresholdPercent')}
            type="number"
            value={String(d.posPolicies.discountThresholdPercent ?? 0)}
            disabled={!ctx.isEditing}
            onChange={(e) => updatePos('discountThresholdPercent', parseFloat(e.target.value) || 0)}
          />
          <TextInput
            label={t('discountThresholdAmount')}
            type="number"
            value={String(d.posPolicies.discountThresholdAmount ?? 0)}
            disabled={!ctx.isEditing}
            onChange={(e) => updatePos('discountThresholdAmount', parseFloat(e.target.value) || 0)}
          />
        </div>
      </Card>

      {/* ── Offline limits (bug fix: includes offlinePriceVariance, moved from Localization) ── */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
          {t('offlineLimitsTitle') || 'Offline limits'}
        </p>
        {!ctx.offlineEnabled && (
          <Banner message={t('offlineNotAvailable')} severity="info" />
        )}
        <div className="grid gap-3 md:grid-cols-2 mt-3">
          <TextInput
            label={t('offlineDuration')}
            type="number"
            value={String(d.posPolicies.offlineLimits.maxDurationHours)}
            disabled={!ctx.isEditing || !ctx.offlineEnabled}
            onChange={(e) => updateOffline('maxDurationHours', Math.min(ctx.offlineTierCap.maxDurationHours, Math.max(0, parseInt(e.target.value) || 0)))}
          />
          <TextInput
            label={t('offlineMaxSales')}
            type="number"
            value={String(d.posPolicies.offlineLimits.maxSalesCount)}
            disabled={!ctx.isEditing || !ctx.offlineEnabled}
            onChange={(e) => updateOffline('maxSalesCount', Math.min(ctx.offlineTierCap.maxSalesCount, Math.max(0, parseInt(e.target.value) || 0)))}
          />
          <TextInput
            label={t('offlineMaxTotal')}
            type="number"
            value={String(d.posPolicies.offlineLimits.maxTotalValue)}
            disabled={!ctx.isEditing || !ctx.offlineEnabled}
            onChange={(e) => updateOffline('maxTotalValue', Math.min(ctx.offlineTierCap.maxTotalValue, Math.max(0, parseInt(e.target.value) || 0)))}
          />
          {/* Bug fix: Offline price variance moved here from Localization tab */}
          <TextInput
            label={t('offlinePriceVariance')}
            type="number"
            value={String(d.posPolicies.offlinePriceVariancePercent ?? 3)}
            disabled={!ctx.isEditing || !ctx.offlineEnabled}
            onChange={(e) => updatePos('offlinePriceVariancePercent', Math.max(0, parseFloat(e.target.value) || 0))}
          />
        </div>
        {ctx.offlineEnabled && (
          <p className="mt-2 text-[10px] text-nvi-text-tertiary">
            {t('offlineMaxHint', {
              hours: ctx.offlineTierCap.maxDurationHours,
              sales: ctx.offlineTierCap.maxSalesCount,
            })}
          </p>
        )}
      </Card>
    </div>
  );
}
