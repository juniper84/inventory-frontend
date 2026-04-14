import { useCallback, useEffect, useRef, useState } from 'react';
import { notify } from '@/components/notifications/NotificationProvider';

/**
 * Deprecation shim — forwards to the new `notify` API.
 *
 * These exports are preserved so existing call sites continue to work:
 *   - pushToast / useToastState / confirmAction / promptAction
 *   - ToastPayload / ActionNotice / ConfirmPayload / PromptPayload types
 *
 * New code should import from '@/components/notifications/NotificationProvider'
 * and use `notify.success()`, `notify.confirm()`, `useNotify()`, etc.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';
export type ToastChannel = 'toast' | 'banner' | 'modal';

export type ToastPayload = {
  title?: string;
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

export type ActionOutcome = 'success' | 'failure' | 'warning' | 'info';
export type ActionKind =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'export'
  | 'import'
  | 'sync'
  | 'auth'
  | 'load'
  | 'save';

export type ActionNotice = {
  action: ActionKind;
  outcome: ActionOutcome;
  message: string;
  title?: string;
  channel?: ToastChannel;
  durationMs?: number;
};

export type ToastInput = string | ToastPayload | ActionNotice;

export type ConfirmPayload = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

export type PromptPayload = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
};

const ACTION_VARIANTS: Record<ActionOutcome, ToastVariant> = {
  success: 'success',
  failure: 'error',
  warning: 'warning',
  info: 'info',
};

function inferVariant(message: string): ToastVariant {
  const normalized = message.toLowerCase();
  if (
    normalized.startsWith('failed') ||
    normalized.startsWith('error') ||
    normalized.startsWith('imeshindwa') ||
    normalized.startsWith('hitilafu') ||
    normalized.startsWith('kosa') ||
    normalized.includes('invalid') ||
    normalized.includes('denied') ||
    normalized.includes('batili') ||
    normalized.includes('imezuiwa') ||
    normalized.includes('imekataliwa kwa sababu')
  ) {
    return 'error';
  }
  if (
    normalized.includes('requires') ||
    normalized.includes('required') ||
    normalized.includes('missing') ||
    normalized.includes('must') ||
    normalized.includes('blocked') ||
    normalized.includes('needs approval') ||
    normalized.includes('inahitaji') ||
    normalized.includes('inakosekana') ||
    normalized.includes('lazima') ||
    normalized.includes('imezuiliwa') ||
    normalized.includes('inahitaji idhini')
  ) {
    return 'warning';
  }
  if (
    normalized.includes('queued') ||
    normalized.includes('completed') ||
    normalized.includes('saved') ||
    normalized.includes('created') ||
    normalized.includes('updated') ||
    normalized.includes('removed') ||
    normalized.includes('approved') ||
    normalized.includes('rejected') ||
    normalized.includes('recorded') ||
    normalized.includes('verified') ||
    normalized.includes('sent') ||
    normalized.includes('synced') ||
    normalized.includes('opened') ||
    normalized.includes('closed') ||
    normalized.includes('imehifadhiwa') ||
    normalized.includes('imeundwa') ||
    normalized.includes('imesasishwa') ||
    normalized.includes('imetumwa') ||
    normalized.includes('imefanikiwa') ||
    normalized.includes('imefungwa') ||
    normalized.includes('imesawazishwa') ||
    normalized.includes('imefutwa') ||
    normalized.includes('imeidhinishwa') ||
    normalized.includes('imekataliwa') ||
    normalized.includes('imerekodiwa') ||
    normalized.includes('imethibitishwa') ||
    normalized.includes('imepangwa foleni') ||
    normalized.includes('imekamilika')
  ) {
    return 'success';
  }
  return 'info';
}

export function getVariantFromMessage(message: string): ToastVariant {
  return inferVariant(message);
}

function normalizeToastInput(input: ToastInput): ToastPayload {
  if (typeof input === 'string') {
    return { message: input };
  }
  if ('action' in input) {
    return {
      title: input.title,
      message: input.message,
      variant: ACTION_VARIANTS[input.outcome],
      durationMs: input.durationMs,
    };
  }
  return input;
}

/** @deprecated Use `notify.success/error/warning/info()` from NotificationProvider. */
export function pushToast(payload: ToastPayload) {
  const variant = payload.variant ?? inferVariant(payload.message);
  notify[variant](payload.message, {
    title: payload.title,
    duration: payload.durationMs,
  });
}

/** @deprecated Use `notify.{success|error|warning|info}()` directly. */
export function notifyAction(payload: ActionNotice) {
  const toast = normalizeToastInput(payload);
  pushToast(toast);
}

/** @deprecated Use `notify.confirm()`. */
export function confirmAction(payload: ConfirmPayload): Promise<boolean> {
  return notify.confirm({
    title: payload.title,
    message: payload.message,
    confirmText: payload.confirmText,
    cancelText: payload.cancelText,
  });
}

/** @deprecated Use `notify.prompt()`. */
export function promptAction(payload: PromptPayload): Promise<string | null> {
  return notify.prompt({
    title: payload.title,
    message: payload.message,
    confirmText: payload.confirmText,
    cancelText: payload.cancelText,
    placeholder: payload.placeholder,
  });
}

/**
 * @deprecated Use `notify.*()` directly — no need for local state.
 * Preserved for pages that render a StatusBanner with the message.
 */
export function useToastState() {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const setToast = useCallback((next: ToastInput | null) => {
    if (!next) {
      setMessage(null);
      return;
    }
    const toast = normalizeToastInput(next);
    const variant = toast.variant ?? inferVariant(toast.message);
    notify[variant](toast.message, {
      title: toast.title,
      duration: toast.durationMs,
    });
    setMessage(toast.message);
    if (typeof window !== 'undefined') {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      const duration = toast.durationMs ?? 5000;
      timeoutRef.current = window.setTimeout(() => {
        setMessage(null);
      }, duration);
    }
  }, []);

  return [message, setToast] as const;
}
