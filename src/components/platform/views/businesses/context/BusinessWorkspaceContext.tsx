'use client';

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { Business, BusinessWorkspace } from '@/components/platform/types';

/**
 * BusinessWorkspaceContext — replaces the 90-prop drilling chain from the
 * old PlatformBusinessesCommandSurface. Holds the selected business, its
 * workspace data, edit states, and shared mutation handlers.
 *
 * Edit state lives here separately from data — when business data reloads,
 * edit drafts are NOT wiped (fixes bug #3 from the audit).
 */

export type EditField =
  | 'subscription'
  | 'readOnly'
  | 'status'
  | 'review'
  | 'rateLimit';

export type BusinessEditState = Record<string, Record<string, unknown>>;

export type BusinessWorkspaceContextValue = {
  // Selection
  selectedBusinessId: string | null;
  setSelectedBusinessId: (id: string | null) => void;

  // Workspace data (loaded per-business)
  workspaceData: BusinessWorkspace | null;
  setWorkspaceData: (data: BusinessWorkspace | null) => void;

  // Edit state — keyed by businessId, then by field type
  editState: BusinessEditState;
  setEditDraft: (businessId: string, field: EditField, value: unknown) => void;
  clearEditDraft: (businessId: string, field?: EditField) => void;

  // Pinned businesses (localStorage-backed)
  pinnedIds: string[];
  togglePin: (id: string) => void;
  isPinned: (id: string) => boolean;

  // Banner / toast messages
  banner: { text: string; severity: 'success' | 'error' | 'info' | 'warning' } | null;
  setBanner: (msg: { text: string; severity: 'success' | 'error' | 'info' | 'warning' } | null) => void;
};

const BusinessWorkspaceContext = createContext<BusinessWorkspaceContextValue | null>(null);

const PIN_STORAGE_KEY = 'nvi.platformPinnedBusinesses';

export function BusinessWorkspaceProvider({ children }: { children: ReactNode }) {
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [workspaceData, setWorkspaceData] = useState<BusinessWorkspace | null>(null);
  const [editState, setEditState] = useState<BusinessEditState>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [banner, setBanner] = useState<BusinessWorkspaceContextValue['banner']>(null);

  const setEditDraft = useCallback((businessId: string, field: EditField, value: unknown) => {
    setEditState((prev) => ({
      ...prev,
      [businessId]: { ...(prev[businessId] ?? {}), [field]: value },
    }));
  }, []);

  const clearEditDraft = useCallback((businessId: string, field?: EditField) => {
    setEditState((prev) => {
      const next = { ...prev };
      if (!field) {
        delete next[businessId];
      } else if (next[businessId]) {
        const fields = { ...next[businessId] };
        delete fields[field];
        next[businessId] = fields;
      }
      return next;
    });
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore quota errors
        }
      }
      return next;
    });
  }, []);

  const isPinned = useCallback((id: string) => pinnedIds.includes(id), [pinnedIds]);

  const value = useMemo<BusinessWorkspaceContextValue>(
    () => ({
      selectedBusinessId,
      setSelectedBusinessId,
      workspaceData,
      setWorkspaceData,
      editState,
      setEditDraft,
      clearEditDraft,
      pinnedIds,
      togglePin,
      isPinned,
      banner,
      setBanner,
    }),
    [
      selectedBusinessId,
      workspaceData,
      editState,
      setEditDraft,
      clearEditDraft,
      pinnedIds,
      togglePin,
      isPinned,
      banner,
    ],
  );

  return (
    <BusinessWorkspaceContext.Provider value={value}>
      {children}
    </BusinessWorkspaceContext.Provider>
  );
}

export function useBusinessWorkspaceContext(): BusinessWorkspaceContextValue {
  const ctx = useContext(BusinessWorkspaceContext);
  if (!ctx) {
    throw new Error('useBusinessWorkspaceContext must be used within BusinessWorkspaceProvider');
  }
  return ctx;
}
