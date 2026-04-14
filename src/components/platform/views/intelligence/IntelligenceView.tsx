'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Activity, FileSearch, UserCog } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { HealthMatrixTab } from './tabs/HealthMatrixTab';
import { AuditInvestigationsTab } from './tabs/AuditInvestigationsTab';
import { AdminActivityTab } from './tabs/AdminActivityTab';

type TabKey = 'health' | 'investigations' | 'activity';

export function IntelligenceView() {
  const t = useTranslations('platformConsole');
  const [activeTab, setActiveTab] = useState<TabKey>('health');

  return (
    <div className="space-y-4 nvi-stagger">
      <PageHeader
        title={t('intelligenceTitle')}
        subtitle={t('intelligenceSubtitle')}
      />

      {/* Tab nav */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1 w-fit">
        {(
          [
            { key: 'health' as const, label: t('intelligenceTabHealth'), icon: Activity },
            {
              key: 'investigations' as const,
              label: t('intelligenceTabInvestigations'),
              icon: FileSearch,
            },
            {
              key: 'activity' as const,
              label: t('intelligenceTabActivity'),
              icon: UserCog,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-[var(--pt-accent)] text-black'
                  : 'text-[var(--pt-text-2)] hover:text-[var(--pt-text-1)]'
              }`}
            >
              <Icon size={12} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'health' && <HealthMatrixTab />}
      {activeTab === 'investigations' && <AuditInvestigationsTab />}
      {activeTab === 'activity' && <AdminActivityTab />}
    </div>
  );
}
