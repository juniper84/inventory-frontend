type NotificationLike = {
  message: string;
  metadata?: Record<string, unknown> | null;
};

type Replacement = { id: string; label: string };

const shortId = (value: string) => value.slice(0, 6);

const buildReplacements = (metadata?: Record<string, unknown> | null) => {
  const replacements: Replacement[] = [];
  if (!metadata) {
    return replacements;
  }
  const variantId =
    typeof metadata.variantId === 'string' ? metadata.variantId : '';
  const variantName =
    typeof metadata.variantName === 'string' ? metadata.variantName : '';
  const productName =
    typeof metadata.productName === 'string' ? metadata.productName : '';
  const variantLabel =
    productName && variantName ? `${productName} - ${variantName}` : variantName;
  if (variantId && variantLabel) {
    replacements.push({ id: variantId, label: variantLabel });
  }
  if (variantName && variantLabel && variantName !== variantLabel) {
    replacements.push({ id: variantName, label: variantLabel });
  }
  const productId =
    typeof metadata.productId === 'string' ? metadata.productId : '';
  if (productId && productName) {
    replacements.push({ id: productId, label: productName });
  }
  const resourceId = typeof metadata.resourceId === 'string' ? metadata.resourceId : '';
  const resourceName =
    typeof metadata.resourceName === 'string' ? metadata.resourceName : '';
  if (resourceId && resourceName) {
    replacements.push({ id: resourceId, label: resourceName });
  }
  return replacements;
};

export const formatNotificationMessage = (notification: NotificationLike) => {
  let message = notification.message;
  const replacements = buildReplacements(notification.metadata);
  for (const replacement of replacements) {
    if (replacement.id && message.includes(replacement.id)) {
      message = message.split(replacement.id).join(replacement.label);
    }
    const shortToken = `#${shortId(replacement.id)}`;
    if (replacement.label && message.includes(shortToken)) {
      message = message.split(shortToken).join(replacement.label);
    }
  }
  return message;
};
