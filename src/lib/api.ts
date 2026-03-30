import {
  clearSession,
  decodeJwt,
  getAccessToken,
  getOrCreateDeviceId,
  getOrCreateSessionId,
  getPlatformRefreshToken,
  getRefreshToken,
  setPlatformSession,
  setTokens,
} from './auth';
import { resolveApiErrorMessage } from './api-error-messages';
import { getActiveBranch } from './branch-context';
import {
  pushSupportChatRecentError,
  isSupportChatLatestErrorRelevant,
  readSupportChatRecentErrors,
  setSupportChatRecentErrors,
} from './support-chat-error-context';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

if (
  typeof window !== 'undefined' &&
  !process.env.NEXT_PUBLIC_API_BASE_URL
) {
  console.warn(
    '[api] NEXT_PUBLIC_API_BASE_URL is not set — falling back to http://localhost:3000/api/v1. ' +
    'Set this environment variable in production.',
  );
}

const FETCH_TIMEOUT_MS = 30_000;

type ApiOptions = RequestInit & {
  token?: string;
  _retried?: boolean;
};

type ApiErrorPayload = {
  message?: string | string[];
  error?: string;
  errorCode?: string;
  statusCode?: number;
  details?: unknown;
};

export class ApiError extends Error {
  status: number;
  payload?: ApiErrorPayload;

  constructor(message: string, status: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export function getApiErrorMessage(
  err: unknown,
  fallback: string,
): string {
  if (err instanceof ApiError && err.message) {
    const locale = getLocale();
    const explicitCode = err.payload?.errorCode;
    const derivedCode = explicitCode ? null : deriveErrorCode(err.message);
    const localized = resolveApiErrorMessage(
      explicitCode ?? derivedCode ?? '',
      locale,
      err.message,
    );
    if (localized) {
      return localized;
    }
    return err.message;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}

const getLocale = () => {
  if (typeof window === 'undefined') {
    return 'en' as const;
  }
  const match = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/i);
  const locale = match?.[1]?.toLowerCase();
  return locale === 'sw' ? 'sw' : 'en';
};

const deriveErrorCode = (message: string) =>
  message
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_') || 'UNKNOWN_ERROR';

export async function getApiErrorMessageFromResponse(
  response: Response,
  fallback: string,
): Promise<string> {
  let message = fallback;
  let errorCode: string | undefined;
  try {
    const text = await response.text();
    if (text) {
      try {
        const data = JSON.parse(text) as ApiErrorPayload;
        if (typeof data?.errorCode === 'string') {
          errorCode = data.errorCode;
        }
        if (typeof data?.message === 'string') {
          message = data.message;
        } else if (Array.isArray(data?.message)) {
          message = data.message.filter(Boolean).join(' • ');
        } else if (typeof data?.error === 'string') {
          message = data.error;
        } else {
          message = text;
        }
      } catch {
        message = text;
      }
    }
  } catch {
    message = fallback;
  }
  if (errorCode) {
    const localized = resolveApiErrorMessage(errorCode, getLocale(), message);
    if (localized) {
      return localized;
    }
  }
  if (message) {
    const derivedCode = deriveErrorCode(message);
    const localized = resolveApiErrorMessage(derivedCode, getLocale(), message);
    if (localized) {
      return localized;
    }
  }
  return message;
}

const REFRESH_WINDOW_SECONDS = 120;
let refreshPromise: Promise<string | null> | null = null;

const getTokenExpiry = (token?: string) => {
  if (!token) {
    return null;
  }
  const payload = decodeJwt<{ exp?: number }>(token);
  return typeof payload?.exp === 'number' ? payload.exp : null;
};

const refreshAccessToken = async (token?: string) => {
  if (refreshPromise) {
    return refreshPromise;
  }
  const refreshToken = getRefreshToken();
  const payload = token ? decodeJwt<{ businessId?: string }>(token) : null;
  if (!refreshToken || !payload?.businessId) {
    return null;
  }
  const deviceId = getOrCreateDeviceId();
  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken,
      businessId: payload.businessId,
      deviceId,
    }),
  })
    .then(async (response) => {
      if (!response.ok) {
        // A 401/403 means the server definitively rejected the refresh token
        // (e.g. revoked by a platform force-logout). Clear the session so the
        // user is redirected to login rather than stuck with a dead session.
        if (response.status === 401 || response.status === 403) {
          clearSession();
        }
        return null;
      }
      const refreshed = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      setTokens(refreshed.accessToken, refreshed.refreshToken);
      return refreshed.accessToken;
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
};

export const refreshSessionToken = async () =>
  refreshAccessToken(getAccessToken() ?? undefined);

export const refreshPlatformAdminToken = async (): Promise<string | null> => {
  const refreshToken = getPlatformRefreshToken();
  if (!refreshToken) {
    return null;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/platform/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { accessToken: string; refreshToken: string };
    setPlatformSession(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
};

export const buildRequestHeaders = (
  token?: string,
  extraHeaders?: HeadersInit,
) => {
  const deviceId = getOrCreateDeviceId();
  const sessionId = getOrCreateSessionId();
  const requestId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const roleId = token
    ? decodeJwt<{ roleIds?: string[] }>(token)?.roleIds?.[0]
    : undefined;
  return {
    requestId,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'x-device-id': deviceId,
      'x-session-id': sessionId,
      'x-request-id': requestId,
      'x-correlation-id': requestId,
      ...(roleId ? { 'x-role-id': roleId } : {}),
      ...(extraHeaders ?? {}),
    },
  };
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}) {
  const { token, headers, _retried, ...rest } = options;
  let resolvedToken = token;
  const expiry = getTokenExpiry(resolvedToken);
  if (expiry) {
    const now = Math.floor(Date.now() / 1000);
    if (expiry - now <= REFRESH_WINDOW_SECONDS) {
      const refreshed = await refreshAccessToken(resolvedToken);
      if (refreshed) {
        resolvedToken = refreshed;
      }
    }
  }

  const { headers: requestHeaders } = buildRequestHeaders(
    resolvedToken,
    headers,
  );
  let response: Response;
  const activeBranchId = getActiveBranch()?.id ?? null;
  const tokenBusinessId =
    resolvedToken
      ? decodeJwt<{ businessId?: string }>(resolvedToken)?.businessId ?? null
      : null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      cache: rest.cache ?? 'no-store',
      headers: requestHeaders,
      signal: rest.signal ?? controller.signal,
    });
  } catch (err) {
    const isTimeout = controller.signal.aborted;
    const errorCode = isTimeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR';
    const rawMessage = err instanceof Error ? err.message : 'Network request failed.';
    pushSupportChatRecentError({
      error_code: errorCode,
      error_message: rawMessage,
      error_source: 'network',
      business_id: tokenBusinessId,
      branch_id: activeBranchId,
    });
    throw new ApiError(
      isTimeout ? 'Request timed out. Please try again.' : 'Network error. Please check your connection.',
      0,
      { errorCode },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 401 && resolvedToken && !_retried) {
      const tokenScope = decodeJwt<{ scope?: string }>(resolvedToken)?.scope;
      const refreshed =
        tokenScope === 'platform'
          ? await refreshPlatformAdminToken()
          : await refreshAccessToken(resolvedToken);
      if (refreshed) {
        return apiFetch<T>(path, {
          ...options,
          token: refreshed,
          _retried: true,
        });
      }
    }
    const fallback = `Request failed with status ${response.status}`;
    let message = fallback;
    let payload: ApiErrorPayload | undefined;
    try {
      const text = await response.text();
      if (text) {
        try {
          const data = JSON.parse(text) as ApiErrorPayload;
          payload = data;
          if (typeof data?.message === 'string') {
            message = data.message;
          } else if (Array.isArray(data?.message)) {
            message = data.message.filter(Boolean).join(' • ');
          } else if (typeof data?.error === 'string') {
            message = data.error;
          } else {
            message = fallback;
          }
        } catch {
          message = text;
        }
      }
    } catch {
      message = fallback;
    }
    if (
      response.status === 403 &&
      payload?.errorCode === 'BUSINESS_SUSPENDED' &&
      typeof window !== 'undefined'
    ) {
      const locale = window.location.pathname.split('/')[1] || 'en';
      window.location.replace(`/${locale}/suspended`);
      return new Promise<T>(() => undefined);
    }
    pushSupportChatRecentError({
      error_code: payload?.errorCode ?? deriveErrorCode(message),
      error_message: message,
      error_source: 'backend',
      business_id: tokenBusinessId,
      branch_id: activeBranchId,
    });
    throw new ApiError(message, response.status, payload);
  }

  const method = (rest.method ?? 'GET').toUpperCase();
  const normalizedPath = path.trim().toLowerCase();
  const isSupportChatEndpoint =
    normalizedPath === '/support/chat' ||
    normalizedPath.startsWith('/support/chat/');
  const isMutating =
    method === 'POST' ||
    method === 'PUT' ||
    method === 'PATCH' ||
    method === 'DELETE';
  if (isMutating && !isSupportChatEndpoint && typeof window !== 'undefined') {
    const current = readSupportChatRecentErrors();
    const currentRoute = window.location.pathname;
    if (current.length) {
      const filtered = current.filter(
        (item) =>
          !isSupportChatLatestErrorRelevant(item, {
            route: currentRoute,
            businessId: tokenBusinessId,
            branchId: activeBranchId,
          }),
      );
      if (filtered.length !== current.length) {
        setSupportChatRecentErrors(filtered);
      }
    }
  }

  if (response.status === 204) {
    return null as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    if (!text) {
      return null as T;
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  const text = await response.text();
  if (!text) {
    return null as T;
  }
  return JSON.parse(text) as T;
}
