'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SmartSelect } from '@/components/SmartSelect';
import { StatusBanner } from '@/components/StatusBanner';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import {
  NOTIFICATION_EVENTS,
  NotificationEventKey,
} from '@/lib/notification-settings';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';

type Role = { id: string; name: string };
type Branch = { id: string; name: string };
type User = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  notificationPreferences?: Record<string, unknown> | null;
  status: string;
  mustResetPassword?: boolean;
};
type UserRole = {
  id: string;
  roleId: string;
  branchId: string | null;
  role: Role;
  branch?: Branch | null;
};

export default function UsersPage() {
  const t = useTranslations('usersPage');
  const eventLabels = useTranslations('notificationsEvents');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canInvite = permissions.has('users.create');
  const canEdit = permissions.has('users.update');
  const canDeactivate = permissions.has('users.deactivate');
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [message, setMessage] = useToastState();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'ACTIVE',
    notificationPreferences: {
      events: {} as Record<NotificationEventKey, boolean>,
    } as Record<string, unknown>,
  });
  const [roleTargetUserId, setRoleTargetUserId] = useState<string | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<UserRole[]>([]);
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignBranchId, setAssignBranchId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const eventPreferences = editingUser.notificationPreferences.events as Record<
    string,
    boolean
  >;
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    roleId: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  const statusOptions = useMemo(
    () => [
      { value: '', label: common('allStatuses') },
      { value: 'ACTIVE', label: common('statusActive') },
      { value: 'SUSPENDED', label: common('statusSuspended') },
      { value: 'DEACTIVATED', label: common('statusDeactivated') },
      { value: 'PENDING', label: common('statusPending') },
    ],
    [common],
  );

  const roleOptions = useMemo(
    () => [
      { value: '', label: common('allRoles') },
      ...roles.map((role) => ({ value: role.id, label: role.name })),
    ],
    [roles, common],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

  const assignableRoles = roles.filter((role) => role.name !== 'System Owner');

  const load = async (cursor?: string, append = false) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    const usersQuery = buildCursorQuery({
      limit: 25,
      cursor,
      search: filters.search || undefined,
      status: filters.status || undefined,
      roleId: filters.roleId || undefined,
    });
    const [roleData, userData, branchData] = await Promise.all([
      apiFetch<PaginatedResponse<Role> | Role[]>(`/roles?limit=200`, { token }),
      apiFetch<PaginatedResponse<User> | User[]>(`/users${usersQuery}`, { token }),
      apiFetch<PaginatedResponse<Branch> | Branch[]>(`/branches?limit=200`, { token }),
    ]);
    const rolesResult = normalizePaginated(roleData);
    const usersResult = normalizePaginated(userData);
    const branchesResult = normalizePaginated(branchData);
    const filteredRoles = rolesResult.items.filter(
      (role) => role.name !== 'System Owner',
    );
    setRoles(rolesResult.items);
    setBranches(branchesResult.items);
    setUsers((prev) => (append ? [...prev, ...usersResult.items] : usersResult.items));
    setNextCursor(usersResult.nextCursor);
    setRoleId(filteredRoles[0]?.id ?? '');
    setAssignRoleId(filteredRoles[0]?.id ?? '');
    if (append) {
      setIsLoadingMore(false);
    } else {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load().catch((err) => setMessage(getApiErrorMessage(err, t('loadFailed'))));
  }, [filters.search, filters.status, filters.roleId]);

  const invite = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    setIsInviting(true);
    try {
      const response = await apiFetch<{ token: string }>('/users/invite', {
        method: 'POST',
        token,
        body: JSON.stringify({ email, roleId }),
      });
      setMessage({
        action: 'create',
        outcome: 'success',
        message: t('inviteSent', { token: response.token }),
      });
      setEmail('');
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('inviteFailed')),
      });
    } finally {
      setIsInviting(false);
    }
  };

  const buildEventPreferences = (
    preferences?: Record<string, unknown> | null,
  ): Record<NotificationEventKey, boolean> => {
    const defaults = NOTIFICATION_EVENTS.reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {} as Record<NotificationEventKey, boolean>);
    if (!preferences || typeof preferences !== 'object') {
      return defaults;
    }
    const events =
      typeof preferences.events === 'object' && preferences.events !== null
        ? (preferences.events as Record<string, boolean>)
        : {};
    const merged = { ...defaults };
    for (const key of Object.keys(events)) {
      if (key in merged && typeof events[key] === 'boolean') {
        merged[key as NotificationEventKey] = events[key];
      }
    }
    return merged;
  };

  const startEdit = (user: User) => {
    setEditingUserId(user.id);
    setEditingUser({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      status: user.status,
      notificationPreferences: {
        events: buildEventPreferences(user.notificationPreferences ?? null),
      },
    });
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editingUserId) {
      return;
    }
    setMessage(null);
    setIsSaving(true);
    try {
      await apiFetch(`/users/${editingUserId}`, {
        method: 'PUT',
        token,
        body: JSON.stringify(editingUser),
      });
      setEditingUserId(null);
      setMessage({ action: 'update', outcome: 'success', message: t('updated') });
      await load();
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('updateFailed')),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deactivate = async (userId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    try {
      await apiFetch(`/users/${userId}/deactivate`, { method: 'POST', token });
      setMessage({ action: 'update', outcome: 'success', message: t('deactivated') });
      await load();
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('deactivateFailed')),
      });
    }
  };

  const openRoleManager = async (user: User) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setRoleTargetUserId(user.id);
    const data = await apiFetch<UserRole[]>(`/users/${user.id}/roles`, { token });
    setRoleAssignments(data);
  };

  const assignRole = async () => {
    const token = getAccessToken();
    if (!token || !roleTargetUserId || !assignRoleId) {
      return;
    }
    setIsAssigning(true);
    try {
      await apiFetch(`/users/${roleTargetUserId}/roles`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          roleId: assignRoleId,
          branchId: assignBranchId || null,
        }),
      });
      setMessage({ action: 'update', outcome: 'success', message: t('roleAssigned') });
      await openRoleManager(
        users.find((user) => user.id === roleTargetUserId) as User,
      );
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('roleAssignFailed')),
      });
    } finally {
      setIsAssigning(false);
    }
  };

  const removeRole = async (roleIdToRemove: string, branchId: string | null) => {
    const token = getAccessToken();
    if (!token || !roleTargetUserId) {
      return;
    }
    setIsAssigning(true);
    try {
      await apiFetch(`/users/${roleTargetUserId}/roles/remove`, {
        method: 'POST',
        token,
        body: JSON.stringify({ roleId: roleIdToRemove, branchId }),
      });
      setMessage({ action: 'delete', outcome: 'success', message: t('roleRemoved') });
      await openRoleManager(
        users.find((user) => user.id === roleTargetUserId) as User,
      );
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('roleRemoveFailed')),
      });
    } finally {
      setIsAssigning(false);
    }
  };

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold text-[color:var(--foreground)]">
          {t('title')}
        </h2>
        <p className="text-sm text-[color:var(--muted)]">{t('subtitle')}</p>
      </div>
      {message ? <StatusBanner message={message} /> : null}
      <ListFilters
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onSearchSubmit={() => pushFilters({ search: searchDraft })}
        onReset={() => resetFilters()}
        isLoading={isLoading}
        showAdvanced={showAdvanced}
        onToggleAdvanced={() => setShowAdvanced((prev) => !prev)}
      >
        <SmartSelect
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.roleId}
          onChange={(value) => pushFilters({ roleId: value })}
          options={roleOptions}
          placeholder={common('role')}
          className="nvi-select-container"
        />
      </ListFilters>

      <div className="command-card p-6 space-y-4 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('inviteTitle')}</h3>
        <div className="flex flex-col gap-3 md:flex-row">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('emailPlaceholder')}
            className="flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={roleId}
            onChange={setRoleId}
            options={assignableRoles.map((role) => ({
              value: role.id,
              label: role.name,
            }))}
            className="nvi-select-container"
          />
          <button
            type="button"
            onClick={invite}
            disabled={isInviting || !canInvite}
            title={!canInvite ? noAccess('title') : undefined}
            className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isInviting ? <Spinner variant="dots" size="xs" /> : null}
              {isInviting ? t('sending') : t('sendInvite')}
            </span>
          </button>
        </div>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('currentUsers')}</h3>
        {!users.length ? <StatusBanner message={t('empty')} /> : null}
        <div className="space-y-3 nvi-stagger">
          {users.map((user) => (
            <div
              key={user.id}
              className="rounded border border-gold-700/30 bg-black/40 p-3 space-y-2"
            >
              {editingUserId === user.id ? (
                <div className="space-y-2">
                  <div className="grid gap-2 md:grid-cols-4">
                    <input
                      value={editingUser.name}
                      onChange={(event) =>
                        setEditingUser({ ...editingUser, name: event.target.value })
                      }
                      className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                    />
                    <input
                      value={editingUser.email}
                      onChange={(event) =>
                        setEditingUser({ ...editingUser, email: event.target.value })
                      }
                      className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                    />
                    <input
                      value={editingUser.phone}
                      onChange={(event) =>
                        setEditingUser({ ...editingUser, phone: event.target.value })
                      }
                      placeholder={t('phoneOptional')}
                      className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
                    />
                    <SmartSelect
                      value={editingUser.status}
                      onChange={(value) =>
                        setEditingUser({
                          ...editingUser,
                          status: value,
                        })
                      }
                      options={[
                        { value: 'ACTIVE', label: t('statusActive') },
                        { value: 'DEACTIVATED', label: t('statusDeactivated') },
                      ]}
                      className="nvi-select-container"
                    />
                  </div>
                  <div className="space-y-2 text-xs text-gold-300">
                    <span className="text-gold-400">{t('notificationPrefs')}</span>
                    <div className="grid gap-2 md:grid-cols-2">
                      {NOTIFICATION_EVENTS.map((key) => (
                        <label key={key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={eventPreferences[key]}
                            onChange={(event) =>
                              setEditingUser({
                                ...editingUser,
                                notificationPreferences: {
                                  ...editingUser.notificationPreferences,
                                  events: {
                                    ...eventPreferences,
                                    [key]: event.target.checked,
                                  },
                                },
                              })
                            }
                          />
                          {eventLabels(key)}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-gold-100">
                      {user.name} — {user.email}
                    </p>
                    {user.phone ? (
                      <p className="text-xs text-gold-400">
                        {t('phoneLabel', { value: user.phone })}
                      </p>
                    ) : null}
                    <p className="text-xs text-gold-400">{user.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(user)}
                      disabled={!canEdit}
                      title={!canEdit ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                    >
                      {common('edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deactivate(user.id)}
                      disabled={!canDeactivate}
                      title={!canDeactivate ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                    >
                      {t('deactivate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openRoleManager(user)}
                      disabled={!canEdit}
                      title={!canEdit ? noAccess('title') : undefined}
                      className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                    >
                      {t('roles')}
                    </button>
                  </div>
                </div>
              )}
              {editingUserId === user.id ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={isSaving || !canEdit}
                    title={!canEdit ? noAccess('title') : undefined}
                    className="rounded bg-gold-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-70"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isSaving ? <Spinner variant="grid" size="xs" /> : null}
                      {isSaving ? t('saving') : common('save')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingUserId(null)}
                    className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                  >
                    {common('cancel')}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {nextCursor ? (
          <button
            type="button"
            onClick={() => load(nextCursor, true)}
            disabled={isLoadingMore}
            className="rounded border border-gold-500/60 px-4 py-2 text-sm text-gold-200 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {isLoadingMore ? <Spinner variant="orbit" size="xs" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </span>
          </button>
        ) : null}
      </div>

      {roleTargetUserId ? (
        <div className="command-card p-6 space-y-3 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('roleAssignments')}
            </h3>
            <button
              type="button"
              onClick={() => setRoleTargetUserId(null)}
              className="text-xs text-gold-400"
            >
              {common('close')}
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <SmartSelect
              value={assignRoleId}
              onChange={setAssignRoleId}
              options={assignableRoles.map((role) => ({
                value: role.id,
                label: role.name,
              }))}
              className="nvi-select-container"
            />
            <SmartSelect
              value={assignBranchId}
              onChange={setAssignBranchId}
              options={branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
              placeholder={t('allBranches')}
              isClearable
              className="nvi-select-container"
            />
            <button
              type="button"
              onClick={assignRole}
              disabled={isAssigning || !canEdit}
              title={!canEdit ? noAccess('title') : undefined}
              className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
            >
              <span className="inline-flex items-center gap-2">
                {isAssigning ? <Spinner variant="pulse" size="xs" /> : null}
                {isAssigning ? t('assigning') : t('assignRole')}
              </span>
            </button>
          </div>

          <div className="space-y-2 text-sm text-gold-200 nvi-stagger">
            {roleAssignments.length === 0 ? (
              <p className="text-gold-400">{t('rolesEmpty')}</p>
            ) : (
              roleAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between rounded border border-gold-700/30 px-3 py-2"
                >
                  <div>
                    <p>{assignment.role.name}</p>
                    <p className="text-xs text-gold-400">
                      {assignment.branch?.name || t('allBranches')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      removeRole(assignment.roleId, assignment.branchId)
                    }
                    disabled={!canEdit}
                    title={!canEdit ? noAccess('title') : undefined}
                    className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                  >
                    {actions('remove')}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
