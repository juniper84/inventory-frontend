import { useMemo } from 'react';

type Business = {
  id: string;
  name: string;
  status: string;
  underReview?: boolean | null;
};

type BusinessWorkspace = {
  business: { id: string; name: string; status: string };
};

type StatusFilter = 'ACTIVE' | 'UNDER_REVIEW' | 'ARCHIVED' | 'DELETED';

export function usePlatformBusinessDerived({
  businesses,
  businessSearch,
  pinnedBusinessIds,
  businessStatusFilter,
  showBusinessDetailPage,
  focusBusinessId,
  openedBusinessId,
  businessWorkspaceMap,
}: {
  businesses: Business[];
  businessSearch: string;
  pinnedBusinessIds: string[];
  businessStatusFilter: StatusFilter;
  showBusinessDetailPage: boolean;
  focusBusinessId?: string;
  openedBusinessId: string;
  businessWorkspaceMap: Record<string, BusinessWorkspace>;
}) {
  const businessOptions = useMemo(
    () =>
      businesses.map((biz) => ({
        id: biz.id,
        label: `${biz.name} · ${biz.id.slice(0, 6)}`,
      })),
    [businesses],
  );

  const businessLookup = useMemo(
    () => new Map(businesses.map((biz) => [biz.id, biz])),
    [businesses],
  );

  const resolvedBusinessId =
    showBusinessDetailPage && focusBusinessId ? focusBusinessId : openedBusinessId;

  const openedBusiness = resolvedBusinessId
    ? businessLookup.get(resolvedBusinessId) ?? null
    : null;

  const openedBusinessWorkspace =
    resolvedBusinessId && businessWorkspaceMap[resolvedBusinessId]
      ? businessWorkspaceMap[resolvedBusinessId]
      : null;

  const businessSelectOptions = useMemo(
    () =>
      businesses.map((biz) => ({
        value: biz.id,
        label: biz.name,
      })),
    [businesses],
  );

  const filteredBusinesses = useMemo(() => {
    const query = businessSearch.trim().toLowerCase();
    const pinned = new Set(pinnedBusinessIds);
    const byStatus =
      businessStatusFilter === 'ACTIVE'
        ? businesses.filter(
            (biz) =>
              !['ARCHIVED', 'DELETED'].includes(biz.status) &&
              biz.status !== 'SUSPENDED',
          )
        : businessStatusFilter === 'UNDER_REVIEW'
          ? businesses.filter((biz) => Boolean(biz.underReview))
          : businesses.filter((biz) => biz.status === businessStatusFilter);
    const base = query
      ? byStatus.filter((biz) => `${biz.name} ${biz.id}`.toLowerCase().includes(query))
      : byStatus;
    return [...base].sort((a, b) => {
      const aPinned = pinned.has(a.id);
      const bPinned = pinned.has(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [businessSearch, businesses, pinnedBusinessIds, businessStatusFilter]);

  const filteredBusinessIds = useMemo(
    () => new Set(filteredBusinesses.map((biz) => biz.id)),
    [filteredBusinesses],
  );

  return {
    businessOptions,
    businessLookup,
    resolvedBusinessId,
    openedBusiness,
    openedBusinessWorkspace,
    businessSelectOptions,
    filteredBusinesses,
    filteredBusinessIds,
  };
}
