'use client';

import { useTranslations } from 'next-intl';
import {
  Ruler,
  Receipt,
  HeadsetIcon,
  AlertTriangle,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/Spinner';
import { UnitHelpPanel } from '@/components/ui/UnitHelpPanel';
import { buildUnitLabel, UNIT_TYPES } from '@/lib/units';
import { useFormatDate } from '@/lib/business-context';
import type { useBusinessSettings } from '../hooks/useBusinessSettings';

type Props = { ctx: ReturnType<typeof useBusinessSettings> };

export function DataAccessTab({ ctx }: Props) {
  const t = useTranslations('businessSettingsPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const { formatDateTime } = useFormatDate();

  return (
    <div className="space-y-4 nvi-stagger">
      {/* ── Units ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-emerald-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Ruler size={18} className="text-emerald-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('unitsTitle')}</h3>
        </div>

        <UnitHelpPanel mode="full" />

        {/* Create form */}
        {ctx.canWrite && (
          <div className="mt-4 grid gap-3 sm:grid-cols-4 items-end">
            <TextInput
              label={t('unitLabelPlaceholder')}
              value={ctx.unitForm.label}
              onChange={(e) => ctx.setUnitForm({ ...ctx.unitForm, label: e.target.value })}
            />
            <TextInput
              label={t('unitCodePlaceholder')}
              value={ctx.unitForm.code}
              onChange={(e) => ctx.setUnitForm({ ...ctx.unitForm, code: e.target.value.toUpperCase() })}
            />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-nvi-text-tertiary">Type</p>
              <select
                value={ctx.unitForm.unitType}
                onChange={(e) => ctx.setUnitForm({ ...ctx.unitForm, unitType: e.target.value as any })}
                className="w-full rounded-xl border border-nvi-border bg-transparent px-3 py-2 text-sm text-nvi-text-primary"
              >
                {UNIT_TYPES.map((ut) => (
                  <option key={ut} value={ut}>{ut}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={ctx.createUnit}
              disabled={ctx.isCreatingUnit || !ctx.unitForm.label || !ctx.unitForm.code}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gold-400 px-4 py-2 text-xs font-semibold text-black disabled:opacity-70 nvi-press"
            >
              {ctx.isCreatingUnit ? <Spinner size="xs" variant="dots" /> : <Plus size={14} />}
              {t('addUnit') || 'Add Unit'}
            </button>
          </div>
        )}

        {/* Unit list */}
        <div className="mt-4 space-y-2">
          {ctx.units.map((unit) => {
            const isSystem = !unit.businessId;
            const isEditing = ctx.editingUnitId === unit.id;
            return (
              <div key={unit.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      value={ctx.editingUnitForm.label}
                      onChange={(e) => ctx.setEditingUnitForm({ ...ctx.editingUnitForm, label: e.target.value })}
                      className="rounded border border-nvi-border bg-transparent px-2 py-1 text-xs text-nvi-text-primary w-32"
                    />
                    <input
                      value={ctx.editingUnitForm.code}
                      onChange={(e) => ctx.setEditingUnitForm({ ...ctx.editingUnitForm, code: e.target.value })}
                      className="rounded border border-nvi-border bg-transparent px-2 py-1 text-xs text-nvi-text-primary w-24"
                    />
                    <button type="button" onClick={() => ctx.updateUnit(unit.id, ctx.editingUnitForm)} className="text-emerald-400 nvi-press"><Check size={14} /></button>
                    <button type="button" onClick={() => ctx.setEditingUnitId(null)} className="text-nvi-text-tertiary nvi-press"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-nvi-text-primary">{buildUnitLabel(unit)}</span>
                      <span className="text-nvi-text-tertiary">{unit.unitType}</span>
                      {isSystem && <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-400">System</span>}
                      {!isSystem && <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400">Custom</span>}
                    </div>
                    {!isSystem && ctx.canWrite && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { ctx.setEditingUnitId(unit.id); ctx.setEditingUnitForm({ label: unit.label, code: unit.code }); }}
                          className="text-nvi-text-tertiary hover:text-nvi-text-primary nvi-press p-1"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => ctx.deleteUnit(unit.id)}
                          className="text-nvi-text-tertiary hover:text-red-400 nvi-press p-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {ctx.units.length === 0 && (
            <EmptyState icon={<Ruler size={24} className="text-nvi-text-tertiary" />} title={t('unitsEmpty') || 'No units yet.'} />
          )}
        </div>
      </Card>

      {/* ── Expense Categories ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-amber-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <Receipt size={18} className="text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('expenseCategoriesTitle')}</h3>
        </div>

        {/* Category list */}
        <div className="space-y-2">
          {ctx.expenseCategories.map((cat) => {
            const isEditing = ctx.editingCatId === cat.id;
            return (
              <div key={cat.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-xs">
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      value={ctx.editingCatForm.code}
                      onChange={(e) => ctx.setEditingCatForm({ ...ctx.editingCatForm, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
                      className="rounded border border-nvi-border bg-transparent px-2 py-1 text-xs font-mono text-nvi-text-primary w-28"
                    />
                    <input
                      value={ctx.editingCatForm.label}
                      onChange={(e) => ctx.setEditingCatForm({ ...ctx.editingCatForm, label: e.target.value })}
                      className="rounded border border-nvi-border bg-transparent px-2 py-1 text-xs text-nvi-text-primary w-40"
                    />
                    <button type="button" onClick={() => ctx.updateExpenseCategory(cat.id, ctx.editingCatForm)} className="text-emerald-400 nvi-press"><Check size={14} /></button>
                    <button type="button" onClick={() => ctx.setEditingCatId(null)} className="text-nvi-text-tertiary nvi-press"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-nvi-text-primary">{cat.code}</span>
                      <span className="text-nvi-text-secondary">{cat.label}</span>
                      {cat.isSystem && <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-400">System</span>}
                    </div>
                    {!cat.isSystem && ctx.canWrite && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => { ctx.setEditingCatId(cat.id); ctx.setEditingCatForm({ label: cat.label, code: cat.code }); }}
                          className="text-nvi-text-tertiary hover:text-nvi-text-primary nvi-press p-1"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => ctx.deleteExpenseCategory(cat.id)}
                          disabled={ctx.isDeletingCat === cat.id}
                          className="text-nvi-text-tertiary hover:text-red-400 nvi-press p-1"
                        >
                          {ctx.isDeletingCat === cat.id ? <Spinner size="xs" variant="dots" /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Create form */}
        {ctx.canWrite && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3 items-end">
            <TextInput
              label={t('categoryCode') || 'Code'}
              value={ctx.newCatCode}
              onChange={(e) => ctx.setNewCatCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
            />
            <TextInput
              label={t('categoryLabel') || 'Label'}
              value={ctx.newCatLabel}
              onChange={(e) => ctx.setNewCatLabel(e.target.value)}
            />
            <button
              type="button"
              onClick={ctx.createExpenseCategory}
              disabled={ctx.isCreatingCat || !ctx.newCatCode || !ctx.newCatLabel}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gold-400 px-4 py-2 text-xs font-semibold text-black disabled:opacity-70 nvi-press"
            >
              {ctx.isCreatingCat ? <Spinner size="xs" variant="dots" /> : <Plus size={14} />}
              {t('addCategory') || 'Add Category'}
            </button>
          </div>
        )}
      </Card>

      {/* ── Support Access Requests ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border-l-2 border-l-blue-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
            <HeadsetIcon size={18} className="text-blue-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('supportRequestsTitle')}</h3>
        </div>

        {ctx.supportRequests.length > 0 ? (
          <div className="space-y-2">
            {ctx.supportRequests.map((req) => (
              <Card key={req.id} padding="sm" glow={false}>
                <p className="text-sm text-nvi-text-primary">{t('requestReasonLabel', { value: req.reason })}</p>
                <p className="text-xs text-nvi-text-tertiary">{t('requestStatus', { value: req.status })}</p>
                {req.scope?.length ? (
                  <p className="text-xs text-nvi-text-tertiary">{t('requestScope', { value: req.scope.join(', ') })}</p>
                ) : (
                  <p className="text-xs text-nvi-text-tertiary">{t('requestScope', { value: t('requestScopeAll') })}</p>
                )}
                {req.durationHours && (
                  <p className="text-xs text-nvi-text-tertiary">{t('requestDuration', { value: req.durationHours })}</p>
                )}
                {req.status === 'PENDING' && ctx.canWrite && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => ctx.resolveSupportRequest(req.id, 'approve')}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400 border border-emerald-500/30 nvi-press"
                    >
                      <Check size={12} />
                      {common('approve') || 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => ctx.resolveSupportRequest(req.id, 'reject')}
                      className="inline-flex items-center gap-1 rounded-xl bg-red-500/10 px-3 py-1 text-xs text-red-400 border border-red-500/30 nvi-press"
                    >
                      <X size={12} />
                      {common('reject') || 'Reject'}
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState icon={<HeadsetIcon size={24} className="text-nvi-text-tertiary" />} title={t('supportRequestsEmpty') || 'No support requests.'} />
        )}
      </Card>

      {/* ── Danger Zone ── */}
      <Card padding="lg" className="nvi-slide-in-bottom border border-red-500/20 bg-red-500/[0.03] border-l-2 border-l-red-400">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle size={18} className="text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-nvi-text-primary">{t('deleteBusinessTitle')}</h3>
        </div>

        <p className="text-sm text-red-300 mb-4">{t('deleteBusinessSubtitle')}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <TextInput
            label={t('deleteBusinessIdPlaceholder')}
            value={ctx.deleteForm.businessId}
            onChange={(e) => ctx.setDeleteForm({ ...ctx.deleteForm, businessId: e.target.value })}
            className="border-red-500/40"
          />
          <TextInput
            label={t('deletePasswordPlaceholder')}
            value={ctx.deleteForm.password}
            onChange={(e) => ctx.setDeleteForm({ ...ctx.deleteForm, password: e.target.value })}
            type="password"
            className="border-red-500/40"
          />
          <TextInput
            label={t('deleteConfirmPlaceholder')}
            value={ctx.deleteForm.confirmText}
            onChange={(e) => ctx.setDeleteForm({ ...ctx.deleteForm, confirmText: e.target.value })}
            className="border-red-500/40"
          />
        </div>
        <p className="mt-2 text-xs text-red-300">{t('deleteBusinessHint')}</p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={ctx.deleteBusiness}
            disabled={!ctx.canDeleteBusiness || ctx.isDeletingBusiness}
            title={!ctx.canDeleteBusiness ? noAccess('title') : undefined}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 disabled:opacity-70 nvi-press"
          >
            {ctx.isDeletingBusiness ? <Spinner variant="dots" size="xs" /> : <Trash2 size={14} />}
            {ctx.isDeletingBusiness ? t('deleting') : t('deleteBusinessAction')}
          </button>
        </div>
      </Card>
    </div>
  );
}
