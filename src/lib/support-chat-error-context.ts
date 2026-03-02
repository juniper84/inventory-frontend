'use client';

import { useEffect, useState } from 'react';

export type SupportChatLatestError = {
  id: string;
  error_code: string | null;
  error_message: string | null;
  error_source: 'backend' | 'frontend' | 'network' | 'unknown' | string;
  error_time: string | null;
  error_route: string | null;
  business_id?: string | null;
  branch_id?: string | null;
};

const RECENT_ERRORS_KEY = 'nvi.supportChat.recentErrors.v1';
const RECENT_ERRORS_EVENT = 'nvi.supportChat.recentErrorsChanged';
const MAX_RECENT_ERRORS = 12;
export const SUPPORT_CHAT_ERROR_MAX_AGE_MS = 5 * 60 * 1000;

function createErrorId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `err-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeError(input: Partial<SupportChatLatestError>): SupportChatLatestError {
  const fallbackRoute =
    typeof window !== 'undefined' ? window.location.pathname : null;
  return {
    id: input.id ?? createErrorId(),
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    error_source: input.error_source ?? 'unknown',
    error_time: input.error_time ?? new Date().toISOString(),
    error_route: input.error_route ?? fallbackRoute,
    business_id: input.business_id ?? null,
    branch_id: input.branch_id ?? null,
  };
}

export function readSupportChatRecentErrors(): SupportChatLatestError[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = window.localStorage.getItem(RECENT_ERRORS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as SupportChatLatestError[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => normalizeError(item))
      .slice(0, MAX_RECENT_ERRORS);
  } catch {
    return [];
  }
}

export function setSupportChatRecentErrors(values: SupportChatLatestError[]) {
  if (typeof window === 'undefined') {
    return;
  }
  const sanitized = (values ?? [])
    .map((item) => normalizeError(item))
    .slice(0, MAX_RECENT_ERRORS);
  if (sanitized.length) {
    window.localStorage.setItem(RECENT_ERRORS_KEY, JSON.stringify(sanitized));
  } else {
    window.localStorage.removeItem(RECENT_ERRORS_KEY);
  }
  window.dispatchEvent(
    new CustomEvent(RECENT_ERRORS_EVENT, { detail: sanitized }),
  );
}

export function pushSupportChatRecentError(input: {
  error_code?: string | null;
  error_message?: string | null;
  error_source?: 'backend' | 'frontend' | 'network' | 'unknown' | string;
  error_route?: string | null;
  business_id?: string | null;
  branch_id?: string | null;
}) {
  const next = normalizeError({
    error_code: input.error_code ?? null,
    error_message: input.error_message ?? null,
    error_source: input.error_source ?? 'unknown',
    error_route: input.error_route ?? null,
    business_id: input.business_id ?? null,
    branch_id: input.branch_id ?? null,
  });
  const current = readSupportChatRecentErrors();
  const deduped = current.filter((item) => {
    const sameCode = (item.error_code ?? '') === (next.error_code ?? '');
    const sameMessage = (item.error_message ?? '') === (next.error_message ?? '');
    const sameRoute =
      normalizeSupportChatRoute(item.error_route) ===
      normalizeSupportChatRoute(next.error_route);
    const sameBusiness = (item.business_id ?? null) === (next.business_id ?? null);
    const sameBranch = (item.branch_id ?? null) === (next.branch_id ?? null);
    return !(sameCode && sameMessage && sameRoute && sameBusiness && sameBranch);
  });
  setSupportChatRecentErrors([next, ...deduped]);
}

export function clearSupportChatRecentErrors() {
  setSupportChatRecentErrors([]);
}

export function removeSupportChatRecentError(errorId: string) {
  if (!errorId) {
    return;
  }
  const next = readSupportChatRecentErrors().filter((item) => item.id !== errorId);
  setSupportChatRecentErrors(next);
}

export function readSupportChatLatestError(): SupportChatLatestError | null {
  return readSupportChatRecentErrors()[0] ?? null;
}

export function setSupportChatLatestError(value: SupportChatLatestError | null) {
  if (!value) {
    clearSupportChatRecentErrors();
    return;
  }
  setSupportChatRecentErrors([normalizeError(value), ...readSupportChatRecentErrors()]);
}

export function clearSupportChatLatestError() {
  const current = readSupportChatRecentErrors();
  if (!current.length) {
    return;
  }
  setSupportChatRecentErrors(current.slice(1));
}

export function normalizeSupportChatRoute(route: string | null | undefined) {
  if (!route) {
    return null;
  }
  const clean = route.split('?')[0].split('#')[0].trim();
  if (!clean) {
    return null;
  }
  return clean.replace(/^\/(en|sw)(?=\/|$)/, '/{locale}');
}

export function isSupportChatLatestErrorRelevant(
  latestError: SupportChatLatestError | null,
  input: {
    route?: string | null;
    businessId?: string | null;
    branchId?: string | null;
    nowMs?: number;
    maxAgeMs?: number;
  } = {},
) {
  if (!latestError) {
    return false;
  }
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? SUPPORT_CHAT_ERROR_MAX_AGE_MS;
  const errorTimeMs = latestError.error_time
    ? Date.parse(latestError.error_time)
    : Number.NaN;
  if (!Number.isFinite(errorTimeMs)) {
    return false;
  }
  if (nowMs - errorTimeMs > maxAgeMs) {
    return false;
  }

  const currentRoute = normalizeSupportChatRoute(input.route ?? null);
  const errorRoute = normalizeSupportChatRoute(latestError.error_route ?? null);
  if (errorRoute && currentRoute && errorRoute !== currentRoute) {
    return false;
  }

  if (
    latestError.business_id &&
    input.businessId &&
    latestError.business_id !== input.businessId
  ) {
    return false;
  }
  if (
    latestError.branch_id &&
    input.branchId &&
    latestError.branch_id !== input.branchId
  ) {
    return false;
  }
  return true;
}

export function captureSupportChatLatestError(input: {
  error_code?: string | null;
  error_message?: string | null;
  error_source?: 'backend' | 'frontend' | 'network' | 'unknown' | string;
  error_route?: string | null;
  business_id?: string | null;
  branch_id?: string | null;
}) {
  pushSupportChatRecentError(input);
}

export function useSupportChatRecentErrors() {
  const [errors, setErrors] = useState<SupportChatLatestError[]>(() =>
    readSupportChatRecentErrors(),
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<SupportChatLatestError[]>;
      setErrors(Array.isArray(custom.detail) ? custom.detail : []);
    };
    window.addEventListener(RECENT_ERRORS_EVENT, handler);
    return () => window.removeEventListener(RECENT_ERRORS_EVENT, handler);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = readSupportChatRecentErrors();
      const relevant = current.filter((item) =>
        isSupportChatLatestErrorRelevant(item, {
          nowMs: Date.now(),
        }),
      );
      if (relevant.length !== current.length) {
        setSupportChatRecentErrors(relevant);
      }
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  return errors;
}

export function useSupportChatLatestError() {
  const [latestError, setLatestError] = useState<SupportChatLatestError | null>(
    () => readSupportChatLatestError(),
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<SupportChatLatestError[]>;
      const next = Array.isArray(custom.detail) ? custom.detail[0] ?? null : null;
      setLatestError(next);
    };
    window.addEventListener(RECENT_ERRORS_EVENT, handler);
    return () => window.removeEventListener(RECENT_ERRORS_EVENT, handler);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = readSupportChatLatestError();
      if (
        current &&
        !isSupportChatLatestErrorRelevant(current, {
          nowMs: Date.now(),
        })
      ) {
        clearSupportChatLatestError();
      }
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  return latestError;
}
