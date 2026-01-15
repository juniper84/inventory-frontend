'use client';

import { getVariantFromMessage, ToastVariant } from '@/lib/app-notifications';

type StatusBannerProps = {
  message: string;
  title?: string;
  variant?: ToastVariant;
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-500/40 bg-emerald-950/40 text-emerald-100',
  error: 'border-red-500/40 bg-red-950/40 text-red-100',
  warning: 'border-amber-500/40 bg-amber-950/40 text-amber-100',
  info: 'border-gold-600/40 bg-black/50 text-gold-100',
};

export function StatusBanner({ message, title, variant }: StatusBannerProps) {
  const resolved = variant ?? getVariantFromMessage(message);
  return (
    <div className={`rounded border px-4 py-3 text-sm ${VARIANT_STYLES[resolved]}`}>
      {title ? <p className="text-xs uppercase tracking-[0.3em]">{title}</p> : null}
      <p>{message}</p>
    </div>
  );
}
