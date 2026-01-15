import {
  decodeJwt,
  getOrCreateDeviceId,
  getOrCreateSessionId,
  getRefreshToken,
  getStoredUser,
  setTokens,
} from './auth';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000/api/v1';

type ApiOptions = RequestInit & {
  token?: string;
};

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
    throw new Error(`Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
