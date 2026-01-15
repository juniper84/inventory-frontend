import { useCallback, useRef, useState } from 'react';

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

const TOAST_EVENT = 'nvi-toast';
const CONFIRM_EVENT = 'nvi-confirm';
const PROMPT_EVENT = 'nvi-prompt';

const ACTION_VARIANTS: Record<ActionOutcome, ToastVariant> = {
  success: 'success',
  failure: 'error',
  warning: 'warning',
  info: 'info',
};

const ACTION_CHANNELS: Record<ActionKind, ToastChannel> = {
  create: 'toast',
  update: 'toast',
  delete: 'toast',
  approve: 'toast',
  reject: 'toast',
  export: 'toast',
  import: 'toast',
  sync: 'toast',
  auth: 'toast',
  load: 'toast',
  save: 'toast',
};

function inferVariant(message: string): ToastVariant {
  const normalized = message.toLowerCase();
  if (
    normalized.startsWith('failed') ||
    normalized.startsWith('error') ||
    normalized.includes('invalid') ||
    normalized.includes('denied')
  ) {
    return 'error';
  }
  if (
    normalized.includes('requires') ||
    normalized.includes('required') ||
    normalized.includes('missing') ||
    normalized.includes('must') ||
    normalized.includes('blocked') ||
    normalized.includes('needs approval')
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
    normalized.includes('closed')
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
    const channel = input.channel ?? ACTION_CHANNELS[input.action];
    return {
      title: input.title,
      message: input.message,
      variant: ACTION_VARIANTS[input.outcome],
      durationMs: input.durationMs,
      ...(channel === 'toast' ? {} : {}),
    };
  }
  return input;
}

export function pushToast(payload: ToastPayload) {
  if (typeof window === 'undefined') {
    return;
  }
  const detail: ToastPayload = {
    title: payload.title,
    message: payload.message,
    variant: payload.variant ?? inferVariant(payload.message),
    durationMs: payload.durationMs ?? 4200,
  };
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export function notifyAction(payload: ActionNotice) {
  const toast = normalizeToastInput(payload);
  pushToast(toast);
}

export function confirmAction(payload: ConfirmPayload): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(CONFIRM_EVENT, {
        detail: {
          ...payload,
          resolver: resolve,
        },
      }),
    );
  });
}

export function promptAction(payload: PromptPayload): Promise<string | null> {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(PROMPT_EVENT, {
        detail: {
          ...payload,
          resolver: resolve,
        },
      }),
    );
  });
}

export function useToastState() {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const setToast = useCallback((next: ToastInput | null) => {
    if (!next) {
      setMessage(null);
      return;
    }
    const toast = normalizeToastInput(next);
    pushToast({
      ...toast,
      variant: toast.variant ?? inferVariant(toast.message),
    });
    setMessage(toast.message);
    if (typeof window !== 'undefined') {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      const duration = toast.durationMs ?? 4200;
      timeoutRef.current = window.setTimeout(() => {
        setMessage(null);
      }, duration);
    }
  }, []);

  return [message, setToast] as const;
}
