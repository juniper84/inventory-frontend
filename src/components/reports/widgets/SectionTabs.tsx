'use client';

/**
 * SectionTabs — Pill-style tab navigation for report sections.
 * Active tab has gold gradient + glowing indicator dot.
 */

export type TabItem = {
  id: string;
  label: string;
  href: string;
};

export type SectionTabsProps = {
  tabs: TabItem[];
  activeId: string;
  onSelect: (tab: TabItem) => void;
};

export function SectionTabs({ tabs, activeId, onSelect }: SectionTabsProps) {
  return (
    <div className="rpt-tabs" role="tablist">
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(tab)}
            className={`rpt-tab ${isActive ? 'rpt-tab--active' : ''}`}
          >
            <span className="rpt-tab__label">{tab.label}</span>
            {isActive && <span className="rpt-tab__indicator" />}
          </button>
        );
      })}
    </div>
  );
}
