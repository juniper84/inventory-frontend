'use client';

import type { ReactNode } from 'react';
import { PageHeader } from './PageHeader';
import { EmptyState } from './EmptyState';
import { PageSkeleton } from '@/components/PageSkeleton';

type ViewMode = 'cards' | 'table' | 'timeline';

type ListPageProps = {
  /* ─── Header ─── */
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badges?: ReactNode;
  headerActions?: ReactNode;

  /* ─── Banner (message/error banners below header) ─── */
  banner?: ReactNode;

  /* ─── KPI strip (optional — metric cards below header) ─── */
  kpis?: ReactNode;

  /* ─── Filters (pass <ListFilters> or custom filter bar) ─── */
  filters?: ReactNode;

  /* ─── Extra sections between filters and content (create forms, action bars) ─── */
  beforeContent?: ReactNode;

  /* ─── Content ─── */
  viewMode: ViewMode;
  table: ReactNode;
  cards: ReactNode;
  timeline?: ReactNode;

  /* ─── Empty state ─── */
  isEmpty: boolean;
  emptyIcon?: ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;

  /* ─── Pagination (pass <PaginationControls>) ─── */
  pagination?: ReactNode;

  /* ─── Loading ─── */
  isLoading: boolean;
  loadingTitle?: string;
};

/**
 * Standard list page layout. The "frame" that every list page shares.
 * Pages plug in their own card designs, table columns, and KPIs.
 *
 * Layout order:
 *   PageHeader → Banner → KPI strip → Filters → Before Content → Content (table or cards) → Pagination
 *
 * Usage:
 *   <ListPage
 *     title="Products" subtitle="Manage your catalog"
 *     isLoading={loading} isEmpty={!products.length}
 *     viewMode={view} headerActions={<ViewToggle ... />}
 *     banner={message ? <Banner message={message} /> : null}
 *     kpis={<div className="grid grid-cols-4 gap-3">...</div>}
 *     filters={<ListFilters ... />}
 *     beforeContent={<CollapsibleSection title="Create">...</CollapsibleSection>}
 *     table={<table>...</table>}
 *     cards={<div className="grid gap-4 md:grid-cols-2">...</div>}
 *     pagination={<PaginationControls ... />}
 *     emptyTitle="No products yet"
 *     emptyDescription="Create your first product to get started."
 *   />
 */
export function ListPage({
  title,
  subtitle,
  eyebrow,
  badges,
  headerActions,
  banner,
  kpis,
  filters,
  beforeContent,
  viewMode,
  table,
  cards,
  timeline,
  isEmpty,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyAction,
  pagination,
  isLoading,
  loadingTitle,
}: ListPageProps) {
  if (isLoading) {
    return <PageSkeleton title={loadingTitle ?? title} />;
  }

  return (
    <div className="nvi-page">
      <PageHeader
        title={title}
        subtitle={subtitle}
        eyebrow={eyebrow}
        badges={badges}
        actions={headerActions}
      />

      {banner}

      {kpis && <div className="nvi-reveal">{kpis}</div>}

      {filters && <div>{filters}</div>}

      {beforeContent}

      {isEmpty ? (
        <EmptyState
          icon={emptyIcon}
          title={emptyTitle ?? 'No results'}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <>
          {viewMode === 'table' && (
            <div className="overflow-x-auto nvi-reveal">{table}</div>
          )}
          {viewMode === 'cards' && (
            <div className="nvi-reveal">{cards}</div>
          )}
          {viewMode === 'timeline' && timeline && (
            <div className="nvi-reveal">{timeline}</div>
          )}
          {pagination && <div>{pagination}</div>}
        </>
      )}
    </div>
  );
}

export type { ViewMode };
