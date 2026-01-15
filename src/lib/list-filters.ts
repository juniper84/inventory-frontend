import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type FilterState = Record<string, string>;

const toValue = (value: string | null | undefined, fallback: string) =>
  value === null || value === undefined ? fallback : value;

const normalize = (input: FilterState) => {
  const next: FilterState = {};
  Object.entries(input).forEach(([key, value]) => {
    next[key] = value ?? '';
  });
  return next;
};

const serializeDefaults = (input: FilterState) =>
  Object.keys(input)
    .sort()
    .map((key) => `${key}:${toValue(input[key], '')}`)
    .join('|');

export function useListFilters<T extends FilterState>(defaults: T) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const paramsString = params.toString();

  const defaultsKey = useMemo(() => serializeDefaults(defaults), [defaults]);
  const resolvedDefaults = useMemo(() => normalize(defaults), [defaultsKey]);
  const resolveFromParams = useCallback(() => {
    const searchParams = new URLSearchParams(paramsString);
    const next: FilterState = { ...resolvedDefaults };
    Object.keys(resolvedDefaults).forEach((key) => {
      next[key] = toValue(searchParams.get(key), resolvedDefaults[key]);
    });
    return next as T;
  }, [paramsString, resolvedDefaults]);

  const [filters, setFilters] = useState<T>(() => resolveFromParams());

  useEffect(() => {
    setFilters(resolveFromParams());
  }, [resolveFromParams]);

  const pushFilters = useCallback(
    (updates: Partial<T>) => {
      const nextState = { ...filters, ...updates };
      const nextParams = new URLSearchParams(paramsString);
      Object.entries(nextState).forEach(([key, value]) => {
        if (!value) {
          nextParams.delete(key);
        } else {
          nextParams.set(key, value);
        }
      });
      const query = nextParams.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      router.replace(url, { scroll: false });
      setFilters(nextState as T);
    },
    [filters, paramsString, pathname, router],
  );

  const resetFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
    setFilters(resolvedDefaults as T);
  }, [pathname, resolvedDefaults, router]);

  return { filters, pushFilters, resetFilters, setFilters };
}
