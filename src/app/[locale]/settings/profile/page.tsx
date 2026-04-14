'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken, getStoredUser } from '@/lib/auth';
import { useToastState, getVariantFromMessage, messageText } from '@/lib/app-notifications';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { getPermissionSet } from '@/lib/permissions';
import {
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  PermissionCatalogEntry,
} from '@/lib/permission-catalog';
import {
  AvatarInitials,
  Card,
  Icon,
  PageHeader,
  ProgressBar,
  StatusBadge,
  TextInput,
} from '@/components/ui';
import { Banner } from '@/components/notifications/Banner';
import { NotificationPreferences } from '@/components/notifications/NotificationPreferences';
import { FontScaleSelector } from '@/components/ui/FontScaleSelector';
import { useFormatDate } from '@/lib/business-context';

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
    role: { id: string; name: string; approvalTier?: number };
    branch: { id: string; name: string } | null;
  }>;
};

export default function ProfilePage() {
  const locale = useLocale();
  const { formatDate, formatDateTime } = useFormatDate();
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
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [loginHistory, setLoginHistory] = useState<Array<{ createdAt: string; metadata?: Record<string, unknown> }>>([]);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
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
        total: number;
        items: Array<{ code: string; label: string; risk?: string }>;
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
        const totalInModule = PERMISSION_CATALOG.filter(
          (e) => (e.module ?? e.code.split('.')[0]) === moduleKey,
        ).length;
        groups[moduleKey] = { moduleLabel, total: totalInModule || 1, items: [] };
      }
      if (!groups[moduleKey].items.some((item) => item.code === code)) {
        groups[moduleKey].items.push({ code, label, risk: meta?.risk });
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
        if (data?.user.id) {
          try {
            const history = await apiFetch<Array<{ createdAt: string; metadata?: Record<string, unknown> }>>(
              `/users/${data.user.id}/login-history`,
              { token },
            );
            setLoginHistory((history ?? []).slice(0, 5));
          } catch {
            setLoginHistory([]);
          }
        }
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

  const startEditProfile = () => {
    setEditForm({
      name: profile?.user.name || '',
      phone: profile?.user.phone || '',
    });
    setEditMode(true);
  };

  const saveProfile = async () => {
    const token = getAccessToken();
    if (!token) return;
    setIsSavingProfile(true);
    setMessage(null);
    try {
      const updated = await apiFetch<ProfileResponse['user']>('/users/me', {
        token,
        method: 'PUT',
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || null,
        }),
      });
      setProfile((prev) =>
        prev ? { ...prev, user: { ...prev.user, name: updated.name, phone: updated.phone } } : prev,
      );
      setEditMode(false);
      setMessage({ action: 'update', outcome: 'success', message: t('profileUpdated') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('profileUpdateFailed')),
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const toggleModule = (moduleKey: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleKey)) {
        next.delete(moduleKey);
      } else {
        next.add(moduleKey);
      }
      return next;
    });
  };

  const membershipDays = useMemo(() => {
    if (!profile?.membership.createdAt) return null;
    const diff = Date.now() - new Date(profile.membership.createdAt).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }, [profile?.membership.createdAt]);

  if (isLoading) {
    return <PageSkeleton />;
  }

  const storedUser = getStoredUser();
  const displayName = profile?.user.name || storedUser?.name || common('unknown');
  const displayEmail = profile?.user.email || storedUser?.email || '';
  const displayPhone = profile?.user.phone ?? '';

  const tierLabel = (tier?: number) =>
    tier === 3
      ? 'SYSTEM OWNER'
      : tier === 2
        ? 'MANAGEMENT'
        : tier === 1
          ? 'STAFF'
          : 'NONE';

  const riskColor = (risk?: string) =>
    risk === 'high'
      ? 'text-red-400'
      : risk === 'medium'
        ? 'text-amber-400'
        : 'text-emerald-400';

  const riskIcon = (risk?: string): 'TriangleAlert' | 'CircleAlert' | 'Shield' =>
    risk === 'high'
      ? 'TriangleAlert'
      : risk === 'medium'
        ? 'CircleAlert'
        : 'Shield';

  return (
    <section className="nvi-page space-y-6">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">{t('badgeRoleMapped')}</span>
            <span className="nvi-badge">{t('badgeAccessRequests')}</span>
          </>
        }
        actions={
          <div className="flex gap-2">
            <Link
              href={`/${locale}/settings/change-password`}
              className="nvi-btn nvi-btn--outline rounded-xl px-3 py-1.5 text-xs nvi-press inline-flex items-center gap-1.5"
            >
              <Icon name="Lock" size={14} className="text-[color:var(--nvi-muted)]" />
              {t('changePassword')}
            </Link>
          </div>
        }
      />

      {/* Profile hero */}
      <Card padding="lg" className="nvi-card-hover">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <AvatarInitials name={displayName} size="xl" />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold text-[color:var(--nvi-foreground)]">{displayName}</h2>
            {displayEmail ? (
              <p className="mt-0.5 flex items-center justify-center gap-1.5 text-sm text-[color:var(--nvi-muted)] sm:justify-start">
                <Icon name="Mail" size={14} />
                {displayEmail}
              </p>
            ) : null}
            {displayPhone ? (
              <p className="mt-0.5 flex items-center justify-center gap-1.5 text-sm text-[color:var(--nvi-muted)] sm:justify-start">
                <Icon name="Phone" size={14} />
                {displayPhone}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <StatusBadge status={profile?.user.status ?? 'UNKNOWN'} size="sm" />
              {profile?.roles.map((entry) => (
                <span
                  key={`${entry.role.id}-${entry.branch?.id ?? 'all'}`}
                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--nvi-border)] px-2.5 py-0.5 text-[11px] font-semibold text-[color:var(--nvi-foreground)]"
                >
                  <Icon name="Shield" size={12} className="text-[color:var(--nvi-muted)]" />
                  {entry.role.name}
                </span>
              ))}
            </div>
          </div>
          {!editMode ? (
            <button
              type="button"
              onClick={startEditProfile}
              className="nvi-btn nvi-btn--outline rounded-xl px-3 py-1.5 text-xs nvi-press inline-flex items-center gap-1.5 shrink-0"
            >
              <Icon name="Pencil" size={14} />
              {common('edit')}
            </button>
          ) : null}
        </div>
      </Card>

      {message ? (
        <Banner
          message={messageText(message)}
          severity={getVariantFromMessage(messageText(message))}
        />
      ) : null}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card as="article" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--nvi-surface)]">
              <Icon name="Shield" size={20} className="text-[color:var(--nvi-foreground)]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('kpiRoles')}</p>
              <p className="mt-1 text-2xl font-bold text-[color:var(--nvi-foreground)]">{profile?.roles.length ?? 0}</p>
            </div>
          </div>
        </Card>
        <Card as="article" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--nvi-surface)]">
              <Icon name="Key" size={20} className="text-[color:var(--nvi-foreground)]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('kpiPermissions')}</p>
              <p className="mt-1 text-2xl font-bold text-[color:var(--nvi-foreground)]">{permissionList.length}</p>
            </div>
          </div>
        </Card>
        <Card as="article" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--nvi-surface)]">
              <Icon name="UserCheck" size={20} className="text-[color:var(--nvi-foreground)]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('kpiStatus')}</p>
              <p className="mt-1 text-lg font-bold text-[color:var(--nvi-foreground)]">
                <StatusBadge status={profile?.user.status ?? 'UNKNOWN'} size="sm" />
              </p>
            </div>
          </div>
        </Card>
        <Card as="article" className="nvi-card-hover">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[color:var(--nvi-surface)]">
              <Icon name="Calendar" size={20} className="text-[color:var(--nvi-foreground)]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('kpiMembership')}</p>
              <p className="mt-1 text-lg font-bold text-[color:var(--nvi-foreground)]">
                <StatusBadge status={profile?.membership.status ?? 'UNKNOWN'} size="sm" />
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Edit profile panel — slides in */}
      {editMode ? (
        <Card padding="lg" className="nvi-slide-in-bottom space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="Pencil" size={18} className="text-[color:var(--nvi-foreground)]" />
            <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">{t('editProfileTitle')}</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label={t('nameLabel')}
              value={editForm.name}
              onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <div>
              <TextInput
                label={t('phoneLabel')}
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder={t('phonePlaceholder')}
                type="tel"
              />
              <p className="mt-1 text-[10px] text-[color:var(--nvi-muted)] px-1">{t('phoneCountryCodeHint')}</p>
            </div>
            <div className="sm:col-span-2">
              <TextInput
                label={t('emailLabel')}
                value={displayEmail}
                disabled
                type="email"
              />
              <p className="mt-1 text-[10px] text-[color:var(--nvi-muted)] px-1">{t('emailReadOnlyHint')}</p>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={saveProfile}
              disabled={isSavingProfile || !editForm.name.trim()}
              className="nvi-cta rounded-xl px-4 py-2 text-sm font-semibold text-black nvi-press inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Icon name="Check" size={16} />
              {isSavingProfile ? actions('saving') : common('save')}
            </button>
            <button
              type="button"
              onClick={() => setEditMode(false)}
              className="nvi-btn nvi-btn--outline rounded-xl px-4 py-2 text-sm nvi-press inline-flex items-center gap-1.5"
            >
              <Icon name="X" size={16} />
              {common('cancel')}
            </button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Personal info */}
        <Card padding="lg" className="nvi-card-hover space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="User" size={18} className="text-[color:var(--nvi-foreground)]" />
            <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">{t('personalInfoTitle')}</h3>
          </div>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3">
              <Icon name="User" size={16} className="text-[color:var(--nvi-muted)] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('nameLabel')}</p>
                <p className="font-medium text-[color:var(--nvi-foreground)]">{displayName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3">
              <Icon name="Mail" size={16} className="text-[color:var(--nvi-muted)] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('emailLabel')}</p>
                <p className="font-medium text-[color:var(--nvi-foreground)]">{displayEmail || '\u2014'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3">
              <Icon name="Phone" size={16} className="text-[color:var(--nvi-muted)] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('phoneLabel')}</p>
                <p className="font-medium text-[color:var(--nvi-foreground)]">{displayPhone || '\u2014'}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Membership */}
        <Card padding="lg" className="nvi-card-hover space-y-4">
          <div className="flex items-center gap-2">
            <Icon name="Building2" size={18} className="text-[color:var(--nvi-foreground)]" />
            <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">{t('membershipTitle')}</h3>
          </div>
          <div className="grid gap-3 text-sm">
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3">
              <Icon name="Calendar" size={16} className="text-[color:var(--nvi-muted)] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('memberSince')}</p>
                <p className="font-medium text-[color:var(--nvi-foreground)]">
                  {profile?.membership.createdAt
                    ? formatDate(profile.membership.createdAt)
                    : '\u2014'}
                  {membershipDays !== null ? (
                    <span className="ml-2 text-xs text-[color:var(--nvi-muted)]">
                      ({t('daysAgo', { count: membershipDays })})
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3">
              <Icon name="UserCheck" size={16} className="text-[color:var(--nvi-muted)] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('membershipStatus')}</p>
                <StatusBadge status={profile?.membership.status ?? 'UNKNOWN'} size="sm" />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3">
              <Icon name="Clock" size={16} className="text-[color:var(--nvi-muted)] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('lastLogin')}</p>
                <p className="font-medium text-[color:var(--nvi-foreground)]">
                  {profile?.user.lastLoginAt
                    ? formatDateTime(profile.user.lastLoginAt)
                    : '\u2014'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3">
              <Icon name="Calendar" size={16} className="text-[color:var(--nvi-muted)] shrink-0" />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[color:var(--nvi-muted)]">{t('createdAt')}</p>
                <p className="font-medium text-[color:var(--nvi-foreground)]">
                  {profile?.user.createdAt
                    ? formatDate(profile.user.createdAt)
                    : '\u2014'}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Roles & permissions section */}
      <Card padding="lg" className="nvi-card-hover space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="Shield" size={18} className="text-[color:var(--nvi-foreground)]" />
          <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">{t('rolesTitle')}</h3>
        </div>
        {profile?.roles.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 nvi-stagger">
            {profile.roles.map((entry) => (
              <div
                key={`${entry.role.id}-${entry.branch?.id ?? 'all'}`}
                className="flex items-start gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--nvi-surface)]">
                  <Icon name="Shield" size={18} className="text-[color:var(--nvi-foreground)]" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[color:var(--nvi-foreground)] truncate">{entry.role.name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={tierLabel(entry.role.approvalTier)} size="xs" />
                    <span className="text-[11px] text-[color:var(--nvi-muted)]">
                      {entry.branch?.name ?? t('allBranches')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[color:var(--nvi-muted)]">{t('noRoles')}</p>
        )}
      </Card>

      {/* Permissions dashboard */}
      <Card padding="lg" className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="Key" size={18} className="text-[color:var(--nvi-foreground)]" />
            <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">{t('permissionsTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-[color:var(--nvi-muted)]">{t('permissionsSubtitle')}</p>
        </div>
        {permissionList.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 nvi-stagger">
            {groupedPermissions.map(([moduleKey, group]) => {
              const isExpanded = expandedModules.has(moduleKey);
              const granted = group.items.length;
              const total = group.total;
              return (
                <Card
                  key={moduleKey}
                  padding="sm"
                  glow={false}
                  className="nvi-card-hover"
                >
                  <button
                    type="button"
                    onClick={() => toggleModule(moduleKey)}
                    className="flex w-full items-center justify-between text-left nvi-press rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--nvi-foreground)] truncate">
                        {group.moduleLabel}
                      </p>
                      <p className="text-[11px] text-[color:var(--nvi-muted)]">
                        {t('permissionCount', { granted, total })}
                      </p>
                    </div>
                    <span
                      className={`text-[color:var(--nvi-muted)] transition-transform duration-200 shrink-0 ml-2 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      <Icon name="ChevronDown" size={16} />
                    </span>
                  </button>
                  <ProgressBar
                    value={granted}
                    max={total}
                    color="accent"
                    height={4}
                    className="mt-2"
                  />
                  {isExpanded ? (
                    <div className="mt-3 flex flex-wrap gap-1.5 nvi-expand">
                      {group.items.map((item) => (
                        <span
                          key={`${moduleKey}-${item.code}`}
                          title={item.code}
                          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--nvi-border)] px-2 py-1 text-[11px] text-[color:var(--nvi-foreground)]"
                        >
                          <Icon
                            name={riskIcon(item.risk)}
                            size={12}
                            className={riskColor(item.risk)}
                          />
                          {item.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[color:var(--nvi-muted)]">{t('noPermissions')}</p>
        )}
      </Card>

      {/* Request access */}
      <Card padding="lg" className="nvi-card-hover space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon name="Lock" size={18} className="text-[color:var(--nvi-foreground)]" />
            <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">{t('requestAccessTitle')}</h3>
          </div>
          <p className="mt-1 text-xs text-[color:var(--nvi-muted)]">{t('requestAccessHint')}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SmartSelect
            instanceId="profile-request-permission"
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
          <TextInput
            value={requestForm.reason}
            onChange={(event) =>
              setRequestForm((prev) => ({ ...prev, reason: event.target.value }))
            }
            placeholder={t('requestReason')}
          />
        </div>
        <button
          type="button"
          onClick={requestAccess}
          disabled={!requestForm.permission || isRequesting}
          className="nvi-cta rounded-xl px-4 py-2 text-sm font-semibold text-black nvi-press inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          <Icon name="Send" size={16} />
          {isRequesting ? actions('sending') : t('requestAccessAction')}
        </button>
      </Card>

      {/* Display preferences */}
      <Card padding="md" className="nvi-card-hover">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
            <Icon name="Type" size={18} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">{t('displaySize') || 'Display size'}</h3>
            <p className="text-[11px] text-white/40">{t('displaySizeHint') || 'Adjust the text size across the entire system'}</p>
          </div>
        </div>
        <FontScaleSelector showPreview showHint />
      </Card>

      {/* Notification preferences */}
      <NotificationPreferences />

      {/* Login history */}
      <Card padding="lg" className="nvi-card-hover space-y-4">
        <div className="flex items-center gap-2">
          <Icon name="Clock" size={18} className="text-[color:var(--nvi-foreground)]" />
          <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">{t('loginHistoryTitle')}</h3>
        </div>
        {loginHistory.length === 0 ? (
          <p className="text-sm text-[color:var(--nvi-muted)]">{t('loginHistoryEmpty')}</p>
        ) : (
          <div className="space-y-2 nvi-stagger">
            {loginHistory.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-xl border border-[color:var(--nvi-border)] p-3 text-sm"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color:var(--nvi-surface)]">
                  <Icon name="Clock" size={16} className="text-[color:var(--nvi-muted)]" />
                </div>
                <div>
                  <p className="text-[color:var(--nvi-foreground)]">
                    {t('loginHistoryEntry', { date: formatDateTime(entry.createdAt) })}
                  </p>
                  {entry.metadata?.ip ? (
                    <p className="text-[11px] text-[color:var(--nvi-muted)]">
                      {t('loginDevice', {
                        ip: String(entry.metadata.ip),
                        device: entry.metadata.userAgent ? String(entry.metadata.userAgent).split(' ')[0] : t('unknownDevice'),
                      })}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
