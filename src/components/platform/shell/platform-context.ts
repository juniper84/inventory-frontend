type DockAction = {
  labelKey: string;
  href: string;
};

type DockContent = {
  titleKey: string;
  descriptionKey: string;
  tagKeys: string[];
  actions: DockAction[];
};

export function resolvePlatformDockContent(basePath: string, path: string): DockContent {
  const defaults: DockContent = {
    titleKey: 'dockDefaultTitle',
    descriptionKey: 'dockDefaultDescription',
    tagKeys: ['dockTagGlobal', 'dockTagOperational'],
    actions: [
      { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
      { labelKey: 'dockActionOpenOperations', href: `${basePath}/operations` },
    ],
  };

  const byPath: Record<string, DockContent> = {
    overview: {
      titleKey: 'dockOverviewTitle',
      descriptionKey: 'dockOverviewDescription',
      tagKeys: ['dockTagKpis', 'dockTagSecurity'],
      actions: [
        { labelKey: 'dockActionOpenIntelligence', href: `${basePath}/intelligence` },
        { labelKey: 'dockActionOpenOperations', href: `${basePath}/operations` },
      ],
    },
    businesses: {
      titleKey: 'dockBusinessesTitle',
      descriptionKey: 'dockBusinessesDescription',
      tagKeys: ['dockTagRegistry', 'dockTagLifecycle'],
      actions: [
        { labelKey: 'dockActionOpenAccess', href: `${basePath}/access` },
        { labelKey: 'dockActionOpenOperations', href: `${basePath}/operations` },
      ],
    },
    operations: {
      titleKey: 'dockOperationsTitle',
      descriptionKey: 'dockOperationsDescription',
      tagKeys: ['dockTagOperations', 'dockTagQueue'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenIntelligence', href: `${basePath}/intelligence` },
      ],
    },
    access: {
      titleKey: 'dockAccessTitle',
      descriptionKey: 'dockAccessDescription',
      tagKeys: ['dockTagQueue', 'dockTagAccess'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenIntelligence', href: `${basePath}/intelligence` },
      ],
    },
    announcements: {
      titleKey: 'dockAnnouncementsTitle',
      descriptionKey: 'dockAnnouncementsDescription',
      tagKeys: ['dockTagBroadcast', 'dockTagTargeting'],
      actions: [
        { labelKey: 'dockActionOpenOverview', href: `${basePath}/overview` },
        { labelKey: 'dockActionOpenIntelligence', href: `${basePath}/intelligence` },
      ],
    },
    analytics: {
      titleKey: 'dockAnalyticsTitle',
      descriptionKey: 'dockAnalyticsDescription',
      tagKeys: ['dockTagAnalytics', 'dockTagMetrics'],
      actions: [
        { labelKey: 'dockActionOpenOverview', href: `${basePath}/overview` },
        { labelKey: 'dockActionOpenIntelligence', href: `${basePath}/intelligence` },
      ],
    },
    intelligence: {
      titleKey: 'dockIntelligenceTitle',
      descriptionKey: 'dockIntelligenceDescription',
      tagKeys: ['dockTagIntelligence', 'dockTagForensics'],
      actions: [
        { labelKey: 'dockActionOpenOperations', href: `${basePath}/operations` },
        { labelKey: 'dockActionOpenOverview', href: `${basePath}/overview` },
      ],
    },
    // Legacy paths kept for backwards compat
    health: {
      titleKey: 'dockIntelligenceTitle',
      descriptionKey: 'dockIntelligenceDescription',
      tagKeys: ['dockTagRisk', 'dockTagDevices'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenOperations', href: `${basePath}/operations` },
      ],
    },
    support: {
      titleKey: 'dockAccessTitle',
      descriptionKey: 'dockAccessDescription',
      tagKeys: ['dockTagQueue', 'dockTagAccess'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenIntelligence', href: `${basePath}/intelligence` },
      ],
    },
    exports: {
      titleKey: 'dockOperationsTitle',
      descriptionKey: 'dockOperationsDescription',
      tagKeys: ['dockTagQueue', 'dockTagDelivery'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenOperations', href: `${basePath}/operations` },
      ],
    },
    audit: {
      titleKey: 'dockIntelligenceTitle',
      descriptionKey: 'dockIntelligenceDescription',
      tagKeys: ['dockTagForensics', 'dockTagCompliance'],
      actions: [
        { labelKey: 'dockActionOpenOperations', href: `${basePath}/operations` },
        { labelKey: 'dockActionOpenOverview', href: `${basePath}/overview` },
      ],
    },
    incidents: {
      titleKey: 'dockOperationsTitle',
      descriptionKey: 'dockOperationsDescription',
      tagKeys: ['dockTagTriage', 'dockTagRisk'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenIntelligence', href: `${basePath}/intelligence` },
      ],
    },
  };

  return byPath[path] ?? defaults;
}
