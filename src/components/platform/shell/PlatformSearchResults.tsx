'use client';

import { forwardRef, useEffect, useState } from 'react';
import { Building2, AlertTriangle, Megaphone, SearchX } from 'lucide-react';
import type { SearchResult, SearchResultsPayload } from './PlatformShell';

type Props = {
  results: SearchResultsPayload;
  query: string;
  onNavigate: (result: SearchResult) => void;
  t: (key: string) => string;
};

const ICONS: Record<SearchResult['type'], typeof Building2> = {
  business: Building2,
  incident: AlertTriangle,
  announcement: Megaphone,
};

export const PlatformSearchResults = forwardRef<HTMLDivElement, Props>(
  function PlatformSearchResults({ results, query, onNavigate, t }, ref) {
    const flat: SearchResult[] = [
      ...results.businesses,
      ...results.incidents,
      ...results.announcements,
    ];

    const [focusIndex, setFocusIndex] = useState(-1);

    // Keyboard nav — arrow keys + Enter
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (flat.length === 0) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusIndex((i) => (i + 1) % flat.length);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusIndex((i) => (i <= 0 ? flat.length - 1 : i - 1));
        } else if (e.key === 'Enter' && focusIndex >= 0) {
          e.preventDefault();
          onNavigate(flat[focusIndex]);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [flat, focusIndex, onNavigate]);

    // Reset focus when result set changes
    useEffect(() => {
      setFocusIndex(-1);
    }, [results.query]);

    if (flat.length === 0) {
      return (
        <div ref={ref} className="p-search-results">
          <div className="p-search-empty">
            <SearchX
              size={16}
              style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: '-2px' }}
            />
            {t('searchNoResults')} "{query}"
          </div>
        </div>
      );
    }

    let runningIndex = 0;

    const renderGroup = (
      groupKey: string,
      groupResults: SearchResult[],
      groupLabel: string,
    ) => {
      if (groupResults.length === 0) return null;
      return (
        <div key={groupKey}>
          <p className="p-search-group-title">{groupLabel}</p>
          {groupResults.map((r) => {
            const index = runningIndex++;
            const Icon = ICONS[r.type];
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onNavigate(r)}
                onMouseEnter={() => setFocusIndex(index)}
                data-focus={focusIndex === index}
                className="p-search-result"
              >
                <Icon size={12} className="p-search-result-icon" />
                <span className="p-search-result-label">{r.label}</span>
                <span className="p-search-result-meta">{r.meta}</span>
              </button>
            );
          })}
        </div>
      );
    };

    return (
      <div ref={ref} className="p-search-results">
        {renderGroup('businesses', results.businesses, t('searchGroupBusinesses'))}
        {renderGroup('incidents', results.incidents, t('searchGroupIncidents'))}
        {renderGroup(
          'announcements',
          results.announcements,
          t('searchGroupAnnouncements'),
        )}
      </div>
    );
  },
);
