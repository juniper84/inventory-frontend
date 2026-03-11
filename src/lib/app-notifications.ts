import { useCallback, useEffect, useRef, useState } from 'react';

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

const TOAST_DURATION_MS: Record<ToastVariant, number> = {
  success: 4200,
  info: 4200,
  warning: 4200,
  error: 7000,
};

function defaultDurationMs(variant: ToastVariant): number {
  return TOAST_DURATION_MS[variant];
}

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

export function pushToast(payload: ToastPayload) {
  if (typeof window === 'undefined') {
    return;
  }
  const resolvedVariant = payload.variant ?? inferVariant(payload.message);
  const detail: ToastPayload = {
    title: payload.title,
    message: payload.message,
    variant: resolvedVariant,
    durationMs: payload.durationMs ?? defaultDurationMs(resolvedVariant),
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
    const resolvedVariant = toast.variant ?? inferVariant(toast.message);
    pushToast({
      ...toast,
      variant: resolvedVariant,
    });
    setMessage(toast.message);
    if (typeof window !== 'undefined') {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      const duration = toast.durationMs ?? defaultDurationMs(resolvedVariant);
      timeoutRef.current = window.setTimeout(() => {
        setMessage(null);
      }, duration);
    }
  }, []);

  return [message, setToast] as const;
}
