/**
 * Shared types for the notification system.
 */

export type NotifySeverity = 'success' | 'error' | 'warning' | 'info';

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  title?: string;
  severity?: NotifySeverity;
  duration?: number; // milliseconds; 0 = sticky (no auto-dismiss)
  action?: ToastAction;
  id?: string; // for deduplication / updates
};

export type ToastItem = {
  id: string;
  message: string;
  title?: string;
  severity: NotifySeverity;
  duration: number;
  action?: ToastAction;
  createdAt: number;
};

export type BannerAction = {
  label: string;
  onClick: () => void;
};

export type ConfirmOptions = {
  title?: string;
  message: string;
  severity?: NotifySeverity | 'danger';
  confirmText?: string;
  cancelText?: string;
};

export type PromptOptions = {
  title?: string;
  message: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  severity?: NotifySeverity;
};

export type AlertOptions = {
  title?: string;
  message: string;
  severity?: NotifySeverity;
  confirmText?: string;
};
