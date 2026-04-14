'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  CreditCard,
  CheckSquare,
  Package,
  ShoppingCart,
  Bell,
  Settings,
  Pencil,
  X,
  Check,
  Shield,
  Users,
} from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Banner } from '@/components/notifications/Banner';
import { useBusinessSettings } from './hooks/useBusinessSettings';
import { GeneralTab } from './tabs/GeneralTab';
import { SubscriptionTab } from './tabs/SubscriptionTab';
import { ApprovalsTab } from './tabs/ApprovalsTab';
import { StockTab } from './tabs/StockTab';
import { PosTab } from './tabs/PosTab';
import { NotificationsTab } from './tabs/NotificationsTab';
import { DataAccessTab } from './tabs/DataAccessTab';

type TabKey = 'general' | 'subscription' | 'approvals' | 'stock' | 'pos' | 'notifications' | 'data';

const TABS: { key: TabKey; icon: React.ReactNode; labelKey: string }[] = [
  { key: 'general', icon: <Building2 size={16} />, labelKey: 'tabGeneral' },
  { key: 'subscription', icon: <CreditCard size={16} />, labelKey: 'tabSubscription' },
  { key: 'approvals', icon: <CheckSquare size={16} />, labelKey: 'tabApprovals' },
  { key: 'stock', icon: <Package size={16} />, labelKey: 'tabStock' },
  { key: 'pos', icon: <ShoppingCart size={16} />, labelKey: 'tabPos' },
  { key: 'notifications', icon: <Bell size={16} />, labelKey: 'tabNotifications' },
  { key: 'data', icon: <Settings size={16} />, labelKey: 'tabData' },
];

// Tabs that participate in the global edit/save flow
const EDITABLE_TABS = new Set<TabKey>(['general', 'approvals', 'stock', 'pos', 'notifications']);

/* ---------- Tier badge colours ---------- */
const tierBadgeClass = (tier: string) => {
  switch (tier) {
    case 'STARTER': return 'border-amber-500/50 bg-amber-500/10 text-amber-300';
    case 'BUSINESS': return 'border-blue-500/50 bg-blue-500/10 text-blue-300';
    case 'ENTERPRISE': return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-200';
    default: return 'border-nvi-border bg-nvi-surface-alt text-nvi-text-secondary';
  }
};

export default function BusinessSettingsPage() {
  const t = useTranslations('businessSettingsPage');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const ctx = useBusinessSettings();
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  const showEditBar = EDITABLE_TABS.has(activeTab);

  if (ctx.isLoading) {
    return <PageSkeleton />;
  }

  return (
    <section className="nvi-page space-y-6">
      {/* ── Page header ── */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">{t('badgePolicyEngine')}</span>
            <span className="nvi-badge">{t('badgeSubscriptionWatch')}</span>
          </>
        }
      />

      {/* ── Banner ── */}
      {ctx.bannerMsg && (
        <Banner
          message={ctx.bannerMsg.text}
          severity={ctx.bannerMsg.severity}
          onDismiss={() => ctx.setBannerMsg(null)}
        />
      )}

      {/* ── KPI strip ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Building2 size={18} className="text-blue-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiBusiness')}</p>
              <p className="text-base font-bold text-blue-400">{ctx.business?.name ?? '—'}</p>
            </div>
          </div>
        </Card>
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ctx.subscription?.tier === 'ENTERPRISE' ? 'bg-yellow-500/10' : ctx.subscription?.tier === 'BUSINESS' ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}>
              <CreditCard size={18} className={ctx.subscription?.tier === 'ENTERPRISE' ? 'text-yellow-400' : ctx.subscription?.tier === 'BUSINESS' ? 'text-blue-400' : 'text-amber-400'} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiSubscription')}</p>
              <p className="text-base font-bold">
                {ctx.subscription ? (
                  <span className={`inline-flex items-center gap-1.5 rounded-xl border px-2 py-0.5 text-xs font-semibold nvi-status-fade ${tierBadgeClass(ctx.subscription.tier)}`}>
                    {ctx.subscription.tier} / {ctx.subscription.status}
                  </span>
                ) : '—'}
              </p>
            </div>
          </div>
        </Card>
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/10">
              <Icon name="Shield" size={18} className="text-purple-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiRoles')}</p>
              <p className="text-2xl font-bold text-purple-400">{ctx.roles.length}</p>
            </div>
          </div>
        </Card>
        <Card padding="md" className="nvi-card-hover">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Icon name="Users" size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">{t('kpiUsers')}</p>
              <p className="text-2xl font-bold text-emerald-400">{ctx.users.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Main layout: sidebar + content ── */}
      <div className="flex gap-6">
        {/* Sidebar — desktop */}
        <nav className="hidden w-[200px] shrink-0 md:block">
          <div className="sticky top-24 space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors nvi-press ${
                  activeTab === tab.key
                    ? 'bg-gold-400/10 text-gold-400 border border-gold-400/20 font-semibold'
                    : 'text-nvi-text-secondary hover:text-nvi-text-primary hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                {tab.icon}
                <span>{t(tab.labelKey) || tab.key}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile tab bar */}
        <div className="mb-4 flex gap-1 overflow-x-auto md:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs transition-colors nvi-press ${
                activeTab === tab.key
                  ? 'bg-gold-400/10 text-gold-400 border border-gold-400/20 font-semibold'
                  : 'text-nvi-text-secondary border border-transparent'
              }`}
            >
              {tab.icon}
              <span>{t(tab.labelKey) || tab.key}</span>
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Edit bar — only for editable tabs */}
          {showEditBar && (
            <div className="sticky top-16 z-10 flex items-center justify-between rounded-xl border border-white/[0.06] bg-[var(--nvi-bg)]/95 px-4 py-2.5 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                {ctx.isEditing && (
                  <span className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
                    {t('editingBadge') || 'Editing'}
                  </span>
                )}
                {ctx.isDirty && (
                  <span className="text-[10px] text-amber-400 nvi-status-fade">
                    {t('unsavedChanges')}
                  </span>
                )}
                {!ctx.isEditing && !ctx.isDirty && (
                  <span className="text-[10px] text-nvi-text-tertiary">
                    {t('readOnlyHint')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {ctx.isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={ctx.cancelEditing}
                      disabled={!ctx.canWrite}
                      title={!ctx.canWrite ? noAccess('title') : undefined}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-1.5 text-xs text-nvi-text-primary nvi-press"
                    >
                      <X size={14} />
                      {common('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={ctx.updateSettings}
                      disabled={ctx.isSaving || !ctx.isDirty || !ctx.canWrite}
                      title={!ctx.canWrite ? noAccess('title') : undefined}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gold-400 px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-70 nvi-press"
                    >
                      {ctx.isSaving ? <Spinner variant="grid" size="xs" /> : <Check size={14} />}
                      {ctx.isSaving ? t('saving') : t('saveSettings')}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => ctx.setIsEditing(true)}
                    disabled={!ctx.canWrite}
                    title={!ctx.canWrite ? noAccess('title') : undefined}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-nvi-border px-3 py-1.5 text-xs text-nvi-text-primary nvi-press"
                  >
                    <Pencil size={14} />
                    {t('editSettings')}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab content */}
          {activeTab === 'general' && <GeneralTab ctx={ctx} />}
          {activeTab === 'subscription' && <SubscriptionTab ctx={ctx} />}
          {activeTab === 'approvals' && <ApprovalsTab ctx={ctx} />}
          {activeTab === 'stock' && <StockTab ctx={ctx} />}
          {activeTab === 'pos' && <PosTab ctx={ctx} />}
          {activeTab === 'notifications' && <NotificationsTab ctx={ctx} />}
          {activeTab === 'data' && <DataAccessTab ctx={ctx} />}
        </div>
      </div>
    </section>
  );
}
