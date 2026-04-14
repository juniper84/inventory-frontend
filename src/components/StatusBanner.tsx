'use client';

import {
  getVariantFromMessage,
  type ToastVariant,
} from '@/lib/app-notifications';
import { Banner } from '@/components/notifications/Banner';

type StatusBannerProps = {
  message: string;
  title?: string;
  variant?: ToastVariant;
};

/**
 * @deprecated Use `<Banner>` from '@/components/notifications/Banner' directly.
 * This is a thin shim that forwards to the new Banner component.
 */
export function StatusBanner({ message, title, variant }: StatusBannerProps) {
  const resolved = variant ?? getVariantFromMessage(message);
  return <Banner message={message} title={title} severity={resolved} />;
}
