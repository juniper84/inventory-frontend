'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ToastPayload,
  ToastVariant,
  ConfirmPayload,
  PromptPayload,
} from '@/lib/app-notifications';

type ToastItem = ToastPayload & { id: string; createdAt: number };

const TOAST_EVENT = 'nvi-toast';
const CONFIRM_EVENT = 'nvi-confirm';
const PROMPT_EVENT = 'nvi-prompt';

type ConfirmState = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  resolver?: (value: boolean) => void;
};

type PromptState = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  placeholder?: string;
  resolver?: (value: string | null) => void;
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-500/40 text-emerald-100',
  error: 'border-red-500/40 text-red-100',
  warning: 'border-amber-500/40 text-amber-100',
  info: 'border-blue-500/40 text-blue-100',
};

export function LocalToastSurface() {
  const statusT = useTranslations('status');
  const common = useTranslations('common');
  const actions = useTranslations('actions');
  const dialogs = useTranslations('dialogs');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent).detail as ToastPayload | undefined;
      if (!detail?.message) {
        return;
      }
      const item: ToastItem = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: Date.now(),
        message: detail.message,
        title: detail.title,
        variant: detail.variant ?? 'info',
        durationMs: detail.durationMs ?? 6000,
      };
      setToasts((prev) => [...prev, item]);
      const timeout = window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== item.id));
      }, item.durationMs);
      return () => window.clearTimeout(timeout);
    };

    const handleConfirm = (event: Event) => {
      const detail = (event as CustomEvent).detail as ConfirmPayload & {
        resolver?: (value: boolean) => void;
      };
      if (!detail?.message) {
        return;
      }
      setConfirm({
        title: detail.title,
        message: detail.message,
        confirmText: detail.confirmText,
        cancelText: detail.cancelText,
        resolver: detail.resolver,
      });
    };

    const handlePrompt = (event: Event) => {
      const detail = (event as CustomEvent).detail as PromptPayload & {
        resolver?: (value: string | null) => void;
      };
      if (!detail?.message) {
        return;
      }
      setPromptValue('');
      setPrompt({
        title: detail.title,
        message: detail.message,
        confirmText: detail.confirmText,
        cancelText: detail.cancelText,
        placeholder: detail.placeholder,
        resolver: detail.resolver,
      });
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    window.addEventListener(CONFIRM_EVENT, handleConfirm);
    window.addEventListener(PROMPT_EVENT, handlePrompt);
    return () => {
      window.removeEventListener(TOAST_EVENT, handleToast);
      window.removeEventListener(CONFIRM_EVENT, handleConfirm);
      window.removeEventListener(PROMPT_EVENT, handlePrompt);
    };
  }, []);

  return (
    <>
      {toasts.length ? (
        <div className="fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-3">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl border bg-black/80 px-4 py-3 text-xs shadow-xl ${VARIANT_STYLES[toast.variant ?? 'info']}`}
            >
              <p className="text-[10px] uppercase tracking-[0.25em] opacity-70">
                {statusT(toast.variant ?? 'info')}
              </p>
              {toast.title ? (
                <p className="mt-2 text-sm font-semibold text-gold-100">
                  {toast.title}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-gold-100">{toast.message}</p>
            </div>
          ))}
        </div>
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gold-700/40 bg-black p-6 text-gold-100 shadow-2xl">
            <p className="text-[10px] uppercase tracking-[0.35em] text-gold-400">
              {dialogs('confirmation')}
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              {confirm.title ?? dialogs('confirmActionTitle')}
            </h3>
            <p className="mt-3 text-sm text-gold-300">{confirm.message}</p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  confirm.resolver?.(false);
                  setConfirm(null);
                }}
                className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-200"
              >
                {confirm.cancelText ?? common('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirm.resolver?.(true);
                  setConfirm(null);
                }}
                className="rounded bg-gold-500 px-4 py-2 text-xs font-semibold text-black"
              >
                {confirm.confirmText ?? common('confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {prompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gold-700/40 bg-black p-6 text-gold-100 shadow-2xl">
            <p className="text-[10px] uppercase tracking-[0.35em] text-gold-400">
              {dialogs('inputRequired')}
            </p>
            <h3 className="mt-2 text-xl font-semibold">
              {prompt.title ?? dialogs('provideDetails')}
            </h3>
            <p className="mt-3 text-sm text-gold-300">{prompt.message}</p>
            <input
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={prompt.placeholder ?? dialogs('enterValue')}
              className="mt-4 w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
            />
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  prompt.resolver?.(null);
                  setPrompt(null);
                }}
                className="rounded border border-gold-700/60 px-3 py-2 text-xs text-gold-200"
              >
                {prompt.cancelText ?? common('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  prompt.resolver?.(promptValue);
                  setPrompt(null);
                }}
                className="rounded bg-gold-500 px-4 py-2 text-xs font-semibold text-black"
              >
                {prompt.confirmText ?? actions('submit')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
