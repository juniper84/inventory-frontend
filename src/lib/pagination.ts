export type PaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  total?: number;
};

export function normalizePaginated<T>(
  data: PaginatedResponse<T> | T[],
): PaginatedResponse<T> {
  if (Array.isArray(data)) {
    return { items: data, nextCursor: null };
  }
  return data;
}

export function buildCursorQuery(
  params: Record<string, string | number | null | undefined>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}
