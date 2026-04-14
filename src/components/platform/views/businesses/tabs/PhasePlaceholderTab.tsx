'use client';

import { useTranslations } from 'next-intl';
import { Construction } from 'lucide-react';
import { Card } from '@/components/ui/Card';

type Props = {
  tabKey: 'subscription' | 'status' | 'exports';
};

/**
 * Temporary placeholder for tabs that will be built in Phase 3c.
 * Shows a "coming soon" message instead of empty/broken UI.
 */
export function PhasePlaceholderTab({ tabKey }: Props) {
  const t = useTranslations('platformConsole');

  return (
    <Card padding="lg" className="nvi-slide-in-bottom">
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--pt-accent-dim)]">
          <Construction size={20} className="text-[var(--pt-accent)]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--pt-text-1)]">
            {t(`workspaceTab.${tabKey}.title`)}
          </p>
          <p className="mt-1 text-xs text-[var(--pt-text-muted)] max-w-sm">
            {t('workspacePhase3cPending')}
          </p>
        </div>
      </div>
    </Card>
  );
}
