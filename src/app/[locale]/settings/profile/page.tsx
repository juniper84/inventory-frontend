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
import {
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  PermissionCatalogEntry,
} from '@/lib/permission-catalog';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

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
  const permissionCatalog = useTranslations('permissions');
  const moduleLabels = useTranslations('permissionModules');
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

  const catalogByCode = useMemo(
    () =>
      new Map<string, PermissionCatalogEntry>(
        PERMISSION_CATALOG.map((entry) => [entry.code, entry]),
      ),
    [],
  );

  const groupedPermissions = useMemo(() => {
    const moduleKeys = new Set(PERMISSION_MODULES.map((module) => module.key));
    const groups: Record<
      string,
      {
        moduleLabel: string;
        items: Array<{ code: string; label: string }>;
      }
    > = {};

    permissionList.forEach((code) => {
      const meta = catalogByCode.get(code);
      const fallbackModule = code.split('.')[0] || 'system';
      const moduleKey = meta?.module ?? fallbackModule;
      const isKnownModule = moduleKeys.has(
        moduleKey as PermissionCatalogEntry['module'],
      );
      const moduleLabel = isKnownModule
        ? moduleLabels(moduleKey)
        : moduleKey.replace(/[-_]/g, ' ');
      const label = meta ? permissionCatalog(`${meta.labelKey}.title`) : code;
      if (!groups[moduleKey]) {
        groups[moduleKey] = { moduleLabel, items: [] };
      }
      if (!groups[moduleKey].items.some((item) => item.code === code)) {
        groups[moduleKey].items.push({ code, label });
      }
    });

    Object.values(groups).forEach((group) => {
      group.items.sort((a, b) => a.label.localeCompare(b.label));
    });

    return Object.entries(groups).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [catalogByCode, moduleLabels, permissionCatalog, permissionList]);

  const permissionOptions = useMemo(
    () =>
      PERMISSION_CATALOG.filter((entry) => !permissionSet.has(entry.code))
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((entry) => ({
          value: entry.code,
          label: `${permissionCatalog(`${entry.labelKey}.title`)} (${entry.code})`,
        })),
    [permissionCatalog, permissionSet],
  );

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
      <PremiumPageHeader
        eyebrow="ACCOUNT CONTROL"
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">ROLE MAPPED</span>
            <span className="nvi-badge">ACCESS REQUESTS</span>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">ROLES</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{profile?.roles.length ?? 0}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">PERMISSIONS</p>
          <p className="mt-2 text-3xl font-semibold text-gold-100">{permissionList.length}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">STATUS</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">{profile?.user.status ?? '—'}</p>
        </article>
        <article className="command-card nvi-panel p-4 nvi-reveal">
          <p className="text-[11px] uppercase tracking-[0.24em] text-gold-400">MEMBERSHIP</p>
          <p className="mt-2 text-lg font-semibold text-gold-100">{profile?.membership.status ?? '—'}</p>
        </article>
      </div>
      {message ? <StatusBanner message={message} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="command-card nvi-panel p-4 space-y-2 lg:col-span-2 nvi-reveal">
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
        <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
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

      <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
        <div>
          <h3 className="text-lg font-semibold text-gold-100">{t('permissionsTitle')}</h3>
          <p className="text-xs text-gold-400">{t('permissionsSubtitle')}</p>
        </div>
        {permissionList.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 nvi-stagger">
            {groupedPermissions.map(([moduleKey, group]) => (
              <div key={moduleKey} className="rounded border border-gold-700/40 bg-black/40 p-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                  {t('moduleLabel', { module: group.moduleLabel })}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gold-200">
                  {group.items.map((item) => (
                    <span
                      key={`${moduleKey}-${item.code}`}
                      title={item.code}
                      className="rounded-full border border-gold-700/50 px-2 py-1"
                    >
                      {item.label}
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

      <div className="command-card nvi-panel p-4 space-y-3 nvi-reveal">
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
            noOptionsMessage={() => t('allPermissionsGranted')}
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
          className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {isRequesting ? actions('sending') : t('requestAccessAction')}
        </button>
      </div>
    </section>
  );
}
