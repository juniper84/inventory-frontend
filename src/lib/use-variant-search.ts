import { useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { formatVariantLabel } from '@/lib/display';
import { getAccessToken } from '@/lib/auth';
import type { SmartSelectOption } from '@/components/SmartSelect';

export type VariantSearchResult = {
  id: string;
  name: string;
  baseUnitId?: string | null;
  sellUnitId?: string | null;
  defaultCost?: number | string | null;
  product?: { name?: string | null } | null;
};

/**
 * Provides server-side variant search for async dropdowns.
 * Results are cached in a ref so unit auto-fill and cost defaults
 * can be looked up after the user selects a variant.
 */
export function useVariantSearch() {
  const cacheRef = useRef<Map<string, VariantSearchResult>>(new Map());

  const loadOptions = useCallback(
    async (inputValue: string): Promise<SmartSelectOption[]> => {
      const token = getAccessToken();
      if (!token) return [];
      try {
        const data = await apiFetch<
          PaginatedResponse<VariantSearchResult> | VariantSearchResult[]
        >(
          `/variants?search=${encodeURIComponent(inputValue)}&limit=25`,
          { token },
        );
        const items = normalizePaginated(data).items;
        items.forEach((v) => cacheRef.current.set(v.id, v));
        return items.map((v) => ({
          value: v.id,
          label: formatVariantLabel({
            id: v.id,
            name: v.name,
            productName: v.product?.name ?? null,
          }),
        }));
      } catch {
        return [];
      }
    },
    [],
  );

  /** Returns cached data for a variant ID — available after the user has searched and selected it. */
  const getVariantData = useCallback(
    (id: string): VariantSearchResult | null =>
      cacheRef.current.get(id) ?? null,
    [],
  );

  /** Pre-populate the cache (e.g. from a local variants array already fetched). */
  const seedCache = useCallback((variants: VariantSearchResult[]) => {
    variants.forEach((v) => cacheRef.current.set(v.id, v));
  }, []);

  /**
   * Build a SmartSelectOption for a variant ID using cached data.
   * If the variant is not yet cached, returns a bare { value, label: id } so
   * the select still shows something rather than going blank.
   */
  const getVariantOption = useCallback(
    (id: string): SmartSelectOption | null => {
      if (!id) return null;
      const v = cacheRef.current.get(id);
      if (!v) return { value: id, label: id };
      return {
        value: id,
        label: formatVariantLabel({
          id,
          name: v.name,
          productName: v.product?.name ?? null,
        }),
      };
    },
    [],
  );

  return { loadOptions, getVariantData, seedCache, getVariantOption };
}
