import type { PlatformView } from '@/components/platform/types';

export function usePlatformConsoleViewFlags(
  view: PlatformView,
  focusBusinessId?: string,
) {
  const showOverview = view === 'overview';
  const showHealth = view === 'health';
  const showBusinesses = view === 'businesses';
  const showSupport = view === 'support';
  const showExports = view === 'exports';
  const showAnnouncements = view === 'announcements';
  const showAudit = view === 'audit';
  const showIncidents = view === 'incidents';
  const showBusinessDetailPage = showBusinesses && Boolean(focusBusinessId);

  return {
    showOverview,
    showHealth,
    showBusinesses,
    showSupport,
    showExports,
    showAnnouncements,
    showAudit,
    showIncidents,
    showBusinessDetailPage,
  };
}
