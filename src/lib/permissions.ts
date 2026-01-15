import { decodeJwt, getAccessToken } from '@/lib/auth';

export function getPermissionSet(): Set<string> {
  const token = typeof window !== 'undefined' ? getAccessToken() : null;
  const payload = token
    ? decodeJwt<{ permissions?: string[] }>(token)
    : null;
  return new Set(payload?.permissions ?? []);
}

export function hasPermission(permissions: Set<string>, code: string) {
  return permissions.has(code);
}
