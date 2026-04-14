'use client';

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { ToastSurface } from './ToastSurface';
import { ConfirmModal } from './ConfirmModal';
import { PromptModal } from './PromptModal';
import { AlertModal } from './AlertModal';
import {
  preloadSounds,
  playNotificationSound,
  isPosMuteEnabled,
} from '@/lib/notification-sounds';
import type {
  ToastItem,
  ToastOptions,
  NotifySeverity,
  ConfirmOptions,
  PromptOptions,
  AlertOptions,
} from './types';

const DEFAULT_DURATIONS: Record<NotifySeverity, number> = {
  success: 5000,
  info: 5000,
  warning: 6000,
  error: 8000,
};

type ConfirmState = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

type PromptState = {
  options: PromptOptions;
  resolve: (value: string | null) => void;
};

type AlertState = {
  options: AlertOptions;
  resolve: () => void;
};

type NotifyApi = {
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  alert: (options: AlertOptions) => Promise<void>;
};

const NotificationContext = createContext<NotifyApi | null>(null);

// Global reference for imperative calls from non-component code
let globalApi: NotifyApi | null = null;

/** Imperative API usable anywhere (including outside React components). */
export const notify: NotifyApi = {
  success: (message, options) => globalApi?.success(message, options) ?? '',
  error: (message, options) => globalApi?.error(message, options) ?? '',
  warning: (message, options) => globalApi?.warning(message, options) ?? '',
  info: (message, options) => globalApi?.info(message, options) ?? '',
  dismiss: (id) => globalApi?.dismiss(id),
  dismissAll: () => globalApi?.dismissAll(),
  confirm: (options) => globalApi?.confirm(options) ?? Promise.resolve(false),
  prompt: (options) => globalApi?.prompt(options) ?? Promise.resolve(null),
  alert: (options) => globalApi?.alert(options) ?? Promise.resolve(),
};

export function useNotify(): NotifyApi {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotify must be used within NotificationProvider');
  }
  return ctx;
}

function randomId(): string {
  return `t-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const common = useTranslations('common');
  const dialogs = useTranslations('dialogs');
  const actions = useTranslations('actions');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState, setPromptState] = useState<PromptState | null>(null);
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const toastIdsRef = useRef(new Set<string>());
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    preloadSounds();
  }, []);

  const addToast = useCallback(
    (severity: NotifySeverity, message: string, options?: ToastOptions) => {
      // POS mute: suppress non-critical toasts while on /pos route
      const currentPath = pathnameRef.current ?? '';
      // Matches /<locale>/pos or /<locale>/pos/*, but not /pos-returns etc.
      const onPos = /\/pos(\/|$)/.test(currentPath);
      const effectiveSeverity = options?.severity ?? severity;
      const isNonCritical =
        effectiveSeverity === 'success' || effectiveSeverity === 'info';
      if (onPos && isNonCritical && isPosMuteEnabled()) {
        return '';
      }
      const id = options?.id ?? randomId();
      if (toastIdsRef.current.has(id)) {
        // Update existing toast
        setToasts((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  message,
                  title: options?.title,
                  severity: options?.severity ?? severity,
                  duration:
                    options?.duration ??
                    DEFAULT_DURATIONS[options?.severity ?? severity],
                  action: options?.action,
                }
              : t,
          ),
        );
        return id;
      }
      const item: ToastItem = {
        id,
        message,
        title: options?.title,
        severity: options?.severity ?? severity,
        duration: options?.duration ?? DEFAULT_DURATIONS[severity],
        action: options?.action,
        createdAt: Date.now(),
      };
      toastIdsRef.current.add(id);
      setToasts((prev) => [...prev, item]);
      playNotificationSound(item.severity);
      return id;
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    toastIdsRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    toastIdsRef.current.clear();
    setToasts([]);
  }, []);

  const api = useMemo<NotifyApi>(
    () => ({
      success: (msg, opts) => addToast('success', msg, opts),
      error: (msg, opts) => addToast('error', msg, opts),
      warning: (msg, opts) => addToast('warning', msg, opts),
      info: (msg, opts) => addToast('info', msg, opts),
      dismiss: dismissToast,
      dismissAll,
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          setConfirmState({ options, resolve });
        }),
      prompt: (options) =>
        new Promise<string | null>((resolve) => {
          setPromptState({ options, resolve });
        }),
      alert: (options) =>
        new Promise<void>((resolve) => {
          setAlertState({ options, resolve });
        }),
    }),
    [addToast, dismissToast, dismissAll],
  );

  useEffect(() => {
    globalApi = api;
    return () => {
      if (globalApi === api) globalApi = null;
    };
  }, [api]);

  const confirmLabel = common('confirm');
  const cancelLabel = common('cancel');
  const okLabel = common('close');
  const submitLabel = actions('submit');

  return (
    <NotificationContext.Provider value={api}>
      {children}
      <ToastSurface toasts={toasts} onDismiss={dismissToast} />
      {confirmState ? (
        <ConfirmModal
          open
          options={{
            ...confirmState.options,
            title: confirmState.options.title ?? dialogs('confirmActionTitle'),
          }}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          onConfirm={() => {
            confirmState.resolve(true);
            setConfirmState(null);
          }}
          onCancel={() => {
            confirmState.resolve(false);
            setConfirmState(null);
          }}
        />
      ) : null}
      {promptState ? (
        <PromptModal
          open
          options={{
            ...promptState.options,
            title: promptState.options.title ?? dialogs('provideDetails'),
          }}
          confirmLabel={submitLabel}
          cancelLabel={cancelLabel}
          onSubmit={(value) => {
            promptState.resolve(value);
            setPromptState(null);
          }}
          onCancel={() => {
            promptState.resolve(null);
            setPromptState(null);
          }}
        />
      ) : null}
      {alertState ? (
        <AlertModal
          open
          options={alertState.options}
          okLabel={okLabel}
          onClose={() => {
            alertState.resolve();
            setAlertState(null);
          }}
        />
      ) : null}
    </NotificationContext.Provider>
  );
}
