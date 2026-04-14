'use client';

/**
 * SectionSkeleton — Shimmer placeholders matching a report section's layout.
 * Replaces the generic spinner with structure-aware placeholders.
 */

export function SectionSkeleton() {
  return (
    <div className="rpt-section rpt-skeleton" aria-busy="true" aria-live="polite">
      {/* Narrative bar */}
      <div className="rpt-skel-block rpt-skel-block--narrative" />

      {/* 4 KPI rings */}
      <div className="rpt-grid rpt-grid--4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rpt-skel-block rpt-skel-block--ring" />
        ))}
      </div>

      {/* 2-column grid */}
      <div className="rpt-grid rpt-grid--2">
        <div className="rpt-skel-block rpt-skel-block--panel" />
        <div className="rpt-skel-block rpt-skel-block--panel" />
      </div>

      {/* Another 2-column grid */}
      <div className="rpt-grid rpt-grid--2">
        <div className="rpt-skel-block rpt-skel-block--panel" />
        <div className="rpt-skel-block rpt-skel-block--panel" />
      </div>
    </div>
  );
}
