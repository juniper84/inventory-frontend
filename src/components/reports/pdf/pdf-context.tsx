'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type PdfTable = {
  title: string;
  headers: string[];
  rows: string[][];
  emptyMessage?: string;
};

export type PdfKpi = { label: string; value: string; sub?: string };

export type PdfBreakdownRow = { label: string; value: string; sub?: string };

export type PdfBreakdown = {
  title: string;
  rows: PdfBreakdownRow[];
  emptyMessage?: string;
};

export type SectionPdfPayload = {
  headline?: string;
  subline?: string;
  kpis?: PdfKpi[];
  breakdowns?: PdfBreakdown[];
  tables?: PdfTable[];
};

type Registry = Map<string, SectionPdfPayload>;

type PdfRegistryValue = {
  register: (id: string, payload: SectionPdfPayload | null) => void;
  snapshot: () => Registry;
};

const PdfRegistryContext = createContext<PdfRegistryValue | null>(null);

export function PdfRegistryProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Registry>(new Map());

  const register = useCallback(
    (id: string, payload: SectionPdfPayload | null) => {
      if (payload === null) {
        ref.current.delete(id);
      } else {
        ref.current.set(id, payload);
      }
    },
    [],
  );

  const snapshot = useCallback(() => new Map(ref.current), []);

  const value = useMemo(() => ({ register, snapshot }), [register, snapshot]);

  return (
    <PdfRegistryContext.Provider value={value}>
      {children}
    </PdfRegistryContext.Provider>
  );
}

export function usePdfRegistry(): PdfRegistryValue {
  const ctx = useContext(PdfRegistryContext);
  if (!ctx) {
    throw new Error('usePdfRegistry must be used inside PdfRegistryProvider');
  }
  return ctx;
}

/**
 * Sections call this to publish their current data into the PDF registry.
 * Pass `null` to clear (e.g. when switching away from the section).
 */
export function useRegisterPdfSection(
  id: string,
  payload: SectionPdfPayload | null,
) {
  const { register } = usePdfRegistry();
  // Stable string key avoids re-registering on every render.
  const key = useMemo(() => JSON.stringify(payload), [payload]);
  useEffect(() => {
    register(id, payload);
    return () => register(id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key, register]);
}

export function useExportPdfStatus() {
  const [isExporting, setExporting] = useState(false);
  return { isExporting, setExporting };
}
