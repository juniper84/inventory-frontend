'use client';

import type { ReactNode } from 'react';

export type TabItem = {
  id: string;
  label: ReactNode;
};

type TabsProps = {
  tabs: TabItem[];
  activeId: string;
  onSelect: (tab: TabItem) => void;
  className?: string;
};

/**
 * Pill-style tab navigation. Generalized from reports SectionTabs.
 * Uses `.nvi-tabs` / `.nvi-tab` CSS (token-based).
 *
 * Usage:
 *   <Tabs
 *     tabs={[{ id: 'overview', label: 'Overview' }, { id: 'details', label: 'Details' }]}
 *     activeId={activeTab}
 *     onSelect={(tab) => setActiveTab(tab.id)}
 *   />
 */
export function Tabs({ tabs, activeId, onSelect, className = '' }: TabsProps) {
  return (
    <div className={`nvi-tabs ${className}`} role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab)}
            className={`nvi-tab ${isActive ? 'nvi-tab--active' : ''}`}
          >
            <span>{tab.label}</span>
            {isActive && <span className="nvi-tab__dot" />}
          </button>
        );
      })}
    </div>
  );
}
