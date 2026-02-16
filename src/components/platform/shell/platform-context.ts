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
      { labelKey: 'dockActionOpenIncidents', href: `${basePath}/incidents` },
    ],
  };

  const byPath: Record<string, DockContent> = {
    overview: {
      titleKey: 'dockOverviewTitle',
      descriptionKey: 'dockOverviewDescription',
      tagKeys: ['dockTagKpis', 'dockTagSecurity'],
      actions: [
        { labelKey: 'dockActionOpenHealth', href: `${basePath}/health` },
        { labelKey: 'dockActionOpenAudit', href: `${basePath}/audit` },
      ],
    },
    health: {
      titleKey: 'dockHealthTitle',
      descriptionKey: 'dockHealthDescription',
      tagKeys: ['dockTagRisk', 'dockTagDevices'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenIncidents', href: `${basePath}/incidents` },
      ],
    },
    businesses: {
      titleKey: 'dockBusinessesTitle',
      descriptionKey: 'dockBusinessesDescription',
      tagKeys: ['dockTagRegistry', 'dockTagLifecycle'],
      actions: [
        { labelKey: 'dockActionOpenSupport', href: `${basePath}/support` },
        { labelKey: 'dockActionOpenExports', href: `${basePath}/exports` },
      ],
    },
    support: {
      titleKey: 'dockSupportTitle',
      descriptionKey: 'dockSupportDescription',
      tagKeys: ['dockTagQueue', 'dockTagAccess'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenAudit', href: `${basePath}/audit` },
      ],
    },
    exports: {
      titleKey: 'dockExportsTitle',
      descriptionKey: 'dockExportsDescription',
      tagKeys: ['dockTagQueue', 'dockTagDelivery'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenSupport', href: `${basePath}/support` },
      ],
    },
    announcements: {
      titleKey: 'dockAnnouncementsTitle',
      descriptionKey: 'dockAnnouncementsDescription',
      tagKeys: ['dockTagBroadcast', 'dockTagTargeting'],
      actions: [
        { labelKey: 'dockActionOpenOverview', href: `${basePath}/overview` },
        { labelKey: 'dockActionOpenAudit', href: `${basePath}/audit` },
      ],
    },
    audit: {
      titleKey: 'dockAuditTitle',
      descriptionKey: 'dockAuditDescription',
      tagKeys: ['dockTagForensics', 'dockTagCompliance'],
      actions: [
        { labelKey: 'dockActionOpenIncidents', href: `${basePath}/incidents` },
        { labelKey: 'dockActionOpenOverview', href: `${basePath}/overview` },
      ],
    },
    incidents: {
      titleKey: 'dockIncidentsTitle',
      descriptionKey: 'dockIncidentsDescription',
      tagKeys: ['dockTagTriage', 'dockTagRisk'],
      actions: [
        { labelKey: 'dockActionOpenBusinesses', href: `${basePath}/businesses` },
        { labelKey: 'dockActionOpenHealth', href: `${basePath}/health` },
      ],
    },
  };

  return byPath[path] ?? defaults;
}
