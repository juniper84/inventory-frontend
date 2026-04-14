import type { PlatformView } from '@/components/platform/types';

export function usePlatformConsoleViewFlags(
  view: PlatformView,
  focusBusinessId?: string,
) {
  const showOverview = view === 'overview';
  const showBusinesses = view === 'businesses';
  const showOperations = view === 'operations';
  const showAccess = view === 'access';
  const showAnnouncements = view === 'announcements';
  const showAnalytics = view === 'analytics';
  const showIntelligence = view === 'intelligence';
  const showBusinessDetailPage = showBusinesses && Boolean(focusBusinessId);

  return {
    showOverview,
    showBusinesses,
    showOperations,
    showAccess,
    showAnnouncements,
    showAnalytics,
    showIntelligence,
    showBusinessDetailPage,
  };
}
