export type DisplayableEntity = {
  name?: string | null;
  code?: string | null;
  id?: string | null;
};

export type VariantLabelInput = {
  id?: string | null;
  name?: string | null;
  productName?: string | null;
  product?: { name?: string | null } | null;
};

export function shortId(id: string, length = 6) {
  if (!id) {
    return '';
  }
  return id.slice(0, length);
}

export function formatEntityLabel(
  entity: DisplayableEntity,
  fallback = '—',
  options?: { idPrefix?: string; shortLength?: number },
) {
  const label = entity.name?.trim() || entity.code?.trim();
  if (label) {
    return label;
  }
  const id = entity.id?.trim();
  if (!id) {
    return fallback;
  }
  const prefix = options?.idPrefix ?? '#';
  const length = options?.shortLength ?? 6;
  return `${prefix}${shortId(id, length)}`;
}

export function formatVariantLabel(
  variant: VariantLabelInput,
  fallback = '—',
  options?: { separator?: string },
) {
  const separator = options?.separator ?? ' - ';
  const variantName = formatEntityLabel(
    { name: variant.name ?? null, id: variant.id ?? null },
    fallback,
  );
  const productName =
    variant.productName?.trim() || variant.product?.name?.trim();
  return productName ? `${productName}${separator}${variantName}` : variantName;
}
