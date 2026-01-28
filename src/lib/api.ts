import {
  decodeJwt,
  getAccessToken,
  getOrCreateDeviceId,
  getOrCreateSessionId,
  getRefreshToken,
  getStoredUser,
  setTokens,
} from './auth';
import { resolveApiErrorMessage } from './api-error-messages';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

type ApiOptions = RequestInit & {
  token?: string;
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
          message = data.message.join(' ');
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
  const user = getStoredUser();
  const payload = token ? decodeJwt<{ businessId?: string }>(token) : null;
  if (!refreshToken || !user?.id || !payload?.businessId) {
    return null;
  }
  const deviceId = getOrCreateDeviceId();
  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: user.id,
      refreshToken,
      businessId: payload.businessId,
      deviceId,
    }),
  })
    .then(async (response) => {
      if (!response.ok) {
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
  const { token, headers, ...rest } = options;
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    cache: rest.cache ?? 'no-store',
    headers: requestHeaders,
  });

  if (!response.ok) {
    if (response.status === 401 && resolvedToken) {
      const refreshed = await refreshAccessToken(resolvedToken);
      if (refreshed) {
        return apiFetch<T>(path, {
          ...options,
          token: refreshed,
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
            message = data.message.join(' ');
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
    throw new ApiError(message, response.status, payload);
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
