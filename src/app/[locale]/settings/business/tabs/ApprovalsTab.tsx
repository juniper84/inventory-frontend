'use client';

import { useTranslations } from 'next-intl';
import { CheckSquare, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { AnalogToggle } from '@/components/analog';
import { useFormatDate } from '@/lib/business-context';
import type { useBusinessSettings } from '../hooks/useBusinessSettings';

type Props = { ctx: ReturnType<typeof useBusinessSettings> };

export function ApprovalsTab({ ctx }: Props) {
  const t = useTranslations('businessSettingsPage');
  const { formatDateTime } = useFormatDate();
  const d = ctx.draftSettings;
  if (!d) return null;

  const update = (field: string, value: unknown) => {
    ctx.setDraftSettings({
      ...d,
      approvalDefaults: { ...d.approvalDefaults, [field]: value },
    });
  };

  const toggleRow = (label: string, field: string, thresholdField: string) => (
    <div className="grid items-center gap-4 md:grid-cols-2">
      <label className="flex items-center gap-2 text-sm text-nvi-text-secondary">
        <AnalogToggle
          checked={d.approvalDefaults[field as keyof typeof d.approvalDefaults] as boolean}
          disabled={!ctx.isEditing}
          onChange={(checked) => update(field, checked)}
        />
        {t(label)}
      </label>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t(`${thresholdField}`)}</p>
        <CurrencyInput
          value={d.approvalDefaults[thresholdField as keyof typeof d.approvalDefaults] as number | null}
          disabled={!ctx.isEditing || !(d.approvalDefaults[field as keyof typeof d.approvalDefaults] as boolean)}
          onChange={(value) => update(thresholdField, value)}
          placeholder="0"
          className="w-full rounded-xl border border-nvi-border bg-transparent px-3 py-2 text-sm text-nvi-text-primary placeholder:text-nvi-text-tertiary disabled:opacity-50"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-emerald-400">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <CheckSquare size={18} className="text-emerald-400" />
            </div>
            <h3 className="text-base font-semibold text-nvi-text-primary">{t('approvalDefaultsTitle')}</h3>
            {ctx.sectionTimestamp('approval') && (
              <span className="text-[10px] text-nvi-text-tertiary">{t('lastUpdated', { date: formatDateTime(ctx.sectionTimestamp('approval')!) })}</span>
            )}
          </div>
          {ctx.isEditing && (
            <button
              type="button"
              onClick={() => ctx.resetSection('approval')}
              className="inline-flex items-center gap-1 rounded-xl border border-nvi-border px-2 py-0.5 text-[10px] text-nvi-text-tertiary hover:text-nvi-text-primary nvi-press"
            >
              <RotateCcw size={10} />
              {t('resetDefaults')}
            </button>
          )}
        </div>

        <div className="grid gap-4 text-sm text-nvi-text-secondary">
          {toggleRow('approvalStockAdjust', 'stockAdjust', 'stockAdjustThresholdAmount')}
          {toggleRow('approvalRefund', 'refund', 'refundThresholdAmount')}
          {toggleRow('approvalPurchase', 'purchase', 'purchaseThresholdAmount')}
          {toggleRow('approvalTransfer', 'transfer', 'transferThresholdAmount')}
          {toggleRow('approvalExpense', 'expense', 'expenseThresholdAmount')}

          {/* Discount approval threshold — improved label */}
          <div className="mt-2 border-t border-white/[0.06] pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">
              {t('approvalDiscountTitle') || 'Require approval above'}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                label={t('discountThresholdPercent')}
                type="number"
                value={String(d.approvalDefaults.discountThresholdPercent ?? 0)}
                disabled={!ctx.isEditing}
                onChange={(e) => update('discountThresholdPercent', parseFloat(e.target.value) || 0)}
              />
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">{t('discountThresholdAmount')}</p>
                <CurrencyInput
                  value={d.approvalDefaults.discountThresholdAmount}
                  disabled={!ctx.isEditing}
                  onChange={(value) => update('discountThresholdAmount', value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-nvi-border bg-transparent px-3 py-2 text-sm text-nvi-text-primary placeholder:text-nvi-text-tertiary disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
