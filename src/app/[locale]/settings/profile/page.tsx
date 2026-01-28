'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken, getStoredUser } from '@/lib/auth';
import { useToastState } from '@/lib/app-notifications';
import { PageSkeleton } from '@/components/PageSkeleton';
import { StatusBanner } from '@/components/StatusBanner';
import { SmartSelect } from '@/components/SmartSelect';
import { getPermissionSet } from '@/lib/permissions';

type ProfileResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    status: string;
    lastLoginAt?: string | null;
    createdAt?: string | null;
  };
  membership: {
    status: string;
    createdAt: string;
  };
  roles: Array<{
    role: { id: string; name: string };
    branch: { id: string; name: string } | null;
  }>;
};

export default function ProfilePage() {
  const t = useTranslations('profilePage');
  const common = useTranslations('common');
  const actions = useTranslations('actions');
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [requestForm, setRequestForm] = useState({
    permission: '',
    reason: '',
  });
  const [isRequesting, setIsRequesting] = useState(false);
  const permissionSet = getPermissionSet();
  const permissionList = useMemo(
    () => Array.from(permissionSet).sort(),
    [permissionSet],
  );

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, string[]> = {};
    permissionList.forEach((code) => {
      const [moduleName, action] = code.split('.');
      const key = moduleName || 'other';
      if (!groups[key]) {
        groups[key] = [];
      }
      const value = action || code;
      if (!groups[key].includes(value)) {
        groups[key].push(value);
      }
    });
    return groups;
  }, [permissionList]);

  const permissionOptions = [
    'users.read',
    'users.update',
    'roles.read',
    'roles.update',
    'catalog.read',
    'catalog.write',
    'stock.read',
    'stock.write',
    'sales.read',
    'sales.write',
    'purchases.read',
    'purchases.write',
    'reports.read',
    'expenses.write',
    'exports.read',
  ].map((code) => ({ value: code, label: code }));

  useEffect(() => {
    const load = async () => {
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const data = await apiFetch<ProfileResponse | null>('/users/me', {
          token,
        });
        setProfile(data);
      } catch (err) {
        setMessage({
          action: 'load',
          outcome: 'failure',
          message: getApiErrorMessage(err, t('loadFailed')),
        });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const requestAccess = async () => {
    const token = getAccessToken();
    if (!token || !requestForm.permission.trim()) {
      return;
    }
    setIsRequesting(true);
    setMessage(null);
    try {
      await apiFetch('/access-requests', {
        token,
        method: 'POST',
        body: JSON.stringify({
          permission: requestForm.permission.trim(),
          reason: requestForm.reason.trim() || undefined,
          path: '/settings/profile',
        }),
      });
      setRequestForm({ permission: '', reason: '' });
      setMessage({ action: 'create', outcome: 'success', message: t('requestSent') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('requestFailed')),
      });
    } finally {
      setIsRequesting(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  const storedUser = getStoredUser();
  const displayName = profile?.user.name || storedUser?.name || common('unknown');
  const displayEmail = profile?.user.email || storedUser?.email || '—';
  const displayPhone = profile?.user.phone ?? '—';

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
          {t('title')}
        </h2>
        <p className="text-sm text-[color:var(--muted)]">{t('subtitle')}</p>
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="command-card p-4 space-y-2 lg:col-span-2 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('profileTitle')}</h3>
          <div className="text-sm text-gold-200">
            <p className="font-semibold text-gold-100">{displayName}</p>
            <p>{displayEmail}</p>
            <p>{displayPhone}</p>
          </div>
          <div className="grid gap-2 text-xs text-gold-300 md:grid-cols-2">
            <div>
              <span className="text-gold-500">{t('status')}:</span>{' '}
              {profile?.user.status ?? '—'}
            </div>
            <div>
              <span className="text-gold-500">{t('membership')}:</span>{' '}
              {profile?.membership.status ?? '—'}
            </div>
            <div>
              <span className="text-gold-500">{t('lastLogin')}:</span>{' '}
              {profile?.user.lastLoginAt
                ? new Date(profile.user.lastLoginAt).toLocaleString()
                : '—'}
            </div>
            <div>
              <span className="text-gold-500">{t('createdAt')}:</span>{' '}
              {profile?.user.createdAt
                ? new Date(profile.user.createdAt).toLocaleDateString()
                : '—'}
            </div>
          </div>
        </div>
        <div className="command-card p-4 space-y-3 nvi-reveal">
          <h3 className="text-lg font-semibold text-gold-100">{t('rolesTitle')}</h3>
          {profile?.roles.length ? (
            <div className="space-y-2 text-sm text-gold-200 nvi-stagger">
              {profile.roles.map((entry) => (
                <div key={`${entry.role.id}-${entry.branch?.id ?? 'all'}`}>
                  <p className="font-semibold text-gold-100">{entry.role.name}</p>
                  <p className="text-xs text-gold-400">
                    {entry.branch?.name ?? t('allBranches')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gold-400">{t('noRoles')}</p>
          )}
        </div>
      </div>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <div>
          <h3 className="text-lg font-semibold text-gold-100">{t('permissionsTitle')}</h3>
          <p className="text-xs text-gold-400">{t('permissionsSubtitle')}</p>
        </div>
        {permissionList.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 nvi-stagger">
            {Object.entries(groupedPermissions).map(([moduleKey, actionsList]) => (
              <div key={moduleKey} className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                  {t('moduleLabel', { module: moduleKey.replace(/-/g, ' ') })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gold-200">
                  {actionsList.map((action) => (
                    <span
                      key={`${moduleKey}-${action}`}
                      className="rounded-full border border-gold-700/50 px-2 py-1"
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gold-400">{t('noPermissions')}</p>
        )}
      </div>

      <div className="command-card p-4 space-y-3 nvi-reveal">
        <div>
          <h3 className="text-lg font-semibold text-gold-100">{t('requestAccessTitle')}</h3>
          <p className="text-xs text-gold-400">{t('requestAccessHint')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            value={requestForm.permission}
            onChange={(value) =>
              setRequestForm((prev) => ({ ...prev, permission: value }))
            }
            options={permissionOptions}
            placeholder={t('requestPermission')}
            isClearable
            className="nvi-select-container"
          />
          <input
            value={requestForm.reason}
            onChange={(event) =>
              setRequestForm((prev) => ({ ...prev, reason: event.target.value }))
            }
            placeholder={t('requestReason')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
          />
        </div>
        <button
          type="button"
          onClick={requestAccess}
          disabled={!requestForm.permission || isRequesting}
          className="rounded bg-gold-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {isRequesting ? actions('sending') : t('requestAccessAction')}
        </button>
      </div>
    </section>
  );
}
