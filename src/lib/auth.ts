const ACCESS_TOKEN_KEY = 'nvi.accessToken';
const REFRESH_TOKEN_KEY = 'nvi.refreshToken';
const USER_KEY = 'nvi.user';
const PLATFORM_ACCESS_TOKEN_KEY = 'nvi.platformAccessToken';
const DEVICE_ID_KEY = 'nvi.deviceId';
const SESSION_ID_KEY = 'nvi.sessionId';
const LAST_BUSINESS_KEY = 'nvi.lastBusinessId';

export type StoredUser = {
  id: string;
  email: string;
  name: string;
  mustResetPassword?: boolean;
};

export function setSession(accessToken: string, refreshToken: string, user: StoredUser) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearSession() {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getOrCreateDeviceId() {
  if (typeof window === 'undefined') {
    return 'server-device';
  }
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

export function getOrCreateSessionId() {
  if (typeof window === 'undefined') {
    return 'server-session';
  }
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) {
    return existing;
  }
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(SESSION_ID_KEY, id);
  return id;
}

export function setLastBusinessId(businessId: string) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(LAST_BUSINESS_KEY, businessId);
}

export function getLastBusinessId() {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(LAST_BUSINESS_KEY);
}

export function clearLastBusinessId() {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(LAST_BUSINESS_KEY);
}

export function getStoredUser(): StoredUser | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function setPlatformSession(accessToken: string) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(PLATFORM_ACCESS_TOKEN_KEY, accessToken);
}

export function clearPlatformSession() {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(PLATFORM_ACCESS_TOKEN_KEY);
}

export function getPlatformAccessToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(PLATFORM_ACCESS_TOKEN_KEY);
}

export function decodeJwt<T = Record<string, unknown>>(token: string) {
  try {
    const payload = token.split('.')[1];
    if (!payload) {
      return null;
    }
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized);
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}
