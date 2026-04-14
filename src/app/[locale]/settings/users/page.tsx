'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { Banner } from '@/components/notifications/Banner';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import {
  ListPage,
  Card,
  Icon,
  TextInput,
  StatusBadge,
  CollapsibleSection,
  SortableTableHeader,
  AvatarInitials,
  EmptyState,
} from '@/components/ui';
import type { SortDirection } from '@/components/ui';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import {
  NOTIFICATION_EVENTS,
  NotificationEventKey,
  EVENT_PERMISSION_MAP,
  NotificationSettings,
  normalizeNotificationSettings,
  isEventDisabledByBusiness,
} from '@/lib/notification-settings';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { PaginationControls } from '@/components/PaginationControls';

// ─── Types ──────────────────────────────────────────────────────────────────

type Role = { id: string; name: string };
type Branch = { id: string; name: string };
type UserRoleSummary = { id: string; name: string; approvalTier?: number };
type User = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  notificationPreferences?: Record<string, unknown> | null;
  status: string;
  mustResetPassword?: boolean;
  roles?: UserRoleSummary[];
  isOnline?: boolean;
};
type UserActivity = {
  salesCount: number;
  lastAction: string;
  lastActionAt: string;
};
type NotificationLocale = 'en' | 'sw';
type RoleWithPermissions = Role & {
  rolePermissions?: { permission: { code: string } }[];
};
type UserRole = {
  id: string;
  roleId: string;
  branchId: string | null;
  role: RoleWithPermissions;
  branch?: Branch | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function statusDotColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-400';
    case 'SUSPENDED':
      return 'bg-red-400';
    case 'PENDING':
      return 'bg-amber-400';
    default:
      return 'bg-gray-400';
  }
}

function statusGlowShadow(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'shadow-[0_0_6px_rgba(16,185,129,0.5)]';
    case 'SUSPENDED':
      return 'shadow-[0_0_6px_rgba(248,113,113,0.5)]';
    case 'PENDING':
      return 'shadow-[0_0_6px_rgba(251,191,36,0.5)]';
    default:
      return '';
  }
}

function countActiveNotifEvents(prefs?: Record<string, unknown> | null): number {
  if (!prefs || typeof prefs !== 'object') return 0;
  const events = prefs.events;
  if (!events || typeof events !== 'object') return 0;
  return Object.values(events as Record<string, boolean>).filter(Boolean).length;
}

// ─── Component ──────────────────────────────────────────────────────────────

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
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteBranchIds, setInviteBranchIds] = useState<string[]>([]);
  const [message, setMessage] = useToastState();
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState({
    name: '',
    email: '',
    phone: '',
    status: 'ACTIVE',
    notificationPreferences: {
      locale: 'en' as NotificationLocale,
      events: {} as Record<NotificationEventKey, boolean>,
    } as Record<string, unknown>,
  });
  const [roleTargetUserId, setRoleTargetUserId] = useState<string | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<UserRole[]>([]);
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignBranchId, setAssignBranchId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [tableSortKey, setTableSortKey] = useState<string | null>(null);
  const [tableSortDir, setTableSortDir] = useState<SortDirection>(null);
  const [bizNotifSettings, setBizNotifSettings] = useState<NotificationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLoadingRoles, setIsLoadingRoles] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isResending, setIsResending] = useState<string | null>(null);
  const [activityUserId, setActivityUserId] = useState<string | null>(null);
  const [activityData, setActivityData] = useState<UserActivity | null>(null);
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const eventPreferences = editingUser.notificationPreferences.events as Record<
    string,
    boolean
  >;

  // Derive the edited user's effective permission codes from their role assignments
  const editedUserPermissions = useMemo(() => {
    const perms = new Set<string>();
    for (const assignment of roleAssignments) {
      for (const rp of assignment.role.rolePermissions ?? []) {
        perms.add(rp.permission.code);
      }
    }
    return perms;
  }, [roleAssignments]);

  // Filter notification events to only those the user's roles grant access to (Fix #2)
  const availableNotificationEvents = useMemo(
    () =>
      NOTIFICATION_EVENTS.filter((event) => {
        const requiredPerm = EVENT_PERMISSION_MAP[event];
        if (!requiredPerm) return true;
        return editedUserPermissions.has(requiredPerm);
      }),
    [editedUserPermissions],
  );

  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    status: '',
    roleId: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const handleSort = (key: string, direction: SortDirection) => {
    setTableSortKey(direction ? key : null);
    setTableSortDir(direction);
  };

  const sortedUsers = useMemo(() => {
    if (!tableSortKey || !tableSortDir) return users;
    const sorted = [...users].sort((a, b) => {
      let av = '';
      let bv = '';
      if (tableSortKey === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (tableSortKey === 'email') { av = a.email.toLowerCase(); bv = b.email.toLowerCase(); }
      else if (tableSortKey === 'status') { av = a.status; bv = b.status; }
      if (av < bv) return tableSortDir === 'asc' ? -1 : 1;
      if (av > bv) return tableSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [users, tableSortKey, tableSortDir]);

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



  const assignableRoles = roles.filter((role) => role.name !== 'System Owner');

  // ─── Data loading ────────────────────────────────────────────────────────

  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [roleData, branchData, settingsData] = await Promise.all([
        apiFetch<PaginatedResponse<Role> | Role[]>(`/roles?limit=200`, { token }),
        apiFetch<PaginatedResponse<Branch> | Branch[]>(`/branches?limit=200`, { token }),
        apiFetch<{ notificationDefaults?: Record<string, unknown> | null }>(`/settings`, { token }),
      ]);
      const rolesResult = normalizePaginated(roleData);
      const filteredRoles = rolesResult.items.filter(
        (role) => role.name !== 'System Owner',
      );
      setRoles(rolesResult.items);
      setBranches(normalizePaginated(branchData).items);
      setRoleId(filteredRoles[0]?.id ?? '');
      setAssignRoleId(filteredRoles[0]?.id ?? '');
      setBizNotifSettings(
        normalizeNotificationSettings(
          (settingsData.notificationDefaults as Record<string, unknown>) ?? null,
        ),
      );
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    setIsLoading(true);
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    try {
      const effectivePageSize = nextPageSize ?? pageSize;
      const cursor =
        targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
      const usersQuery = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        status: filters.status || undefined,
        roleId: filters.roleId || undefined,
      });
      const userData = await apiFetch<PaginatedResponse<User> | User[]>(
        `/users${usersQuery}`,
        { token },
      );
      const usersResult = normalizePaginated(userData);
      setUsers(usersResult.items);
      setNextCursor(usersResult.nextCursor);
      if (typeof usersResult.total === 'number') {
        setTotal(usersResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (usersResult.nextCursor) {
          nextState[targetPage + 1] = usersResult.nextCursor;
        }
        return nextState;
      });
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('loadFailed')) });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, filters.search, filters.status, filters.roleId, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  // ─── Actions ─────────────────────────────────────────────────────────────

  const invite = async () => {
    const token = getAccessToken();
    if (!token) return;
    setMessage(null);
    setIsInviting(true);
    try {
      await apiFetch<{ token: string }>('/users/invite', {
        method: 'POST',
        token,
        body: JSON.stringify({
          email,
          roleId,
          branchIds: inviteBranchIds.length > 0 ? inviteBranchIds : undefined,
          name: inviteName || undefined,
          phone: invitePhone || undefined,
        }),
      });
      setMessage({
        action: 'create',
        outcome: 'success',
        message: t('inviteSent'),
      });
      setEmail('');
      setInviteName('');
      setInvitePhone('');
      setInviteBranchIds([]);
      setInviteOpen(false);
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

  const resendInvitation = async (userEmail: string) => {
    const token = getAccessToken();
    if (!token) return;
    setIsResending(userEmail);
    setMessage(null);
    try {
      await apiFetch('/users/invite', {
        method: 'POST',
        token,
        body: JSON.stringify({ email: userEmail, roleId }),
      });
      setMessage({
        action: 'create',
        outcome: 'success',
        message: t('resendSuccess'),
      });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('resendFailed')),
      });
    } finally {
      setIsResending(null);
    }
  };

  const toggleActivity = async (userId: string) => {
    if (activityUserId === userId) {
      setActivityUserId(null);
      setActivityData(null);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    setActivityUserId(userId);
    setActivityData(null);
    setIsActivityLoading(true);
    try {
      const data = await apiFetch<UserActivity>(`/users/${userId}/activity`, { token });
      setActivityData(data);
    } catch (err) {
      setMessage({ action: 'load', outcome: 'failure', message: getApiErrorMessage(err, t('activityFailed')) });
      setActivityUserId(null);
    } finally {
      setIsActivityLoading(false);
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

  const resolveNotificationLocale = (
    preferences?: Record<string, unknown> | null,
  ): NotificationLocale =>
    preferences?.locale === 'sw' ? 'sw' : 'en';

  const startEdit = async (user: User) => {
    if (viewMode === 'table') setViewMode('cards');
    setEditingUserId(user.id);
    setEditingUser({
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      status: user.status,
      notificationPreferences: {
        ...((user.notificationPreferences as Record<string, unknown> | null) ??
          {}),
        locale: resolveNotificationLocale(user.notificationPreferences ?? null),
        events: buildEventPreferences(user.notificationPreferences ?? null),
      },
    });
    const token = getAccessToken();
    if (!token) return;
    setRoleTargetUserId(user.id);
    setRoleAssignments([]);
    setIsLoadingRoles(true);
    try {
      const data = await apiFetch<UserRole[]>(`/users/${user.id}/roles`, { token });
      setRoleAssignments(data);
    } catch {
      // silent — roles section will show empty
    } finally {
      setIsLoadingRoles(false);
    }
  };

  const saveEdit = async () => {
    const token = getAccessToken();
    if (!token || !editingUserId) return;
    setMessage(null);
    setIsSaving(true);
    try {
      // Strip notification events the user's roles don't grant access to (Fix #2)
      const cleanedEvents: Record<string, boolean> = {};
      const availableSet = new Set<string>(availableNotificationEvents);
      for (const [key, value] of Object.entries(eventPreferences)) {
        if (availableSet.has(key)) {
          cleanedEvents[key] = value;
        }
      }
      const payload = {
        ...editingUser,
        notificationPreferences: {
          ...editingUser.notificationPreferences,
          events: cleanedEvents,
        },
      };
      await apiFetch(`/users/${editingUserId}`, {
        method: 'PUT',
        token,
        body: JSON.stringify(payload),
      });
      setEditingUserId(null);
      setRoleTargetUserId(null);
      setRoleAssignments([]);
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
    if (!token) return;
    const ok = await notify.confirm({
      title: t('deactivateConfirmTitle'),
      message: t('deactivateConfirmMessage'),
      confirmText: t('deactivateConfirmButton'),
    });
    if (!ok) return;
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
    if (!token) return;
    setRoleTargetUserId(user.id);
    const data = await apiFetch<UserRole[]>(`/users/${user.id}/roles`, { token });
    setRoleAssignments(data);
  };

  const assignRole = async () => {
    const token = getAccessToken();
    if (!token || !roleTargetUserId || !assignRoleId) return;
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
    if (!token || !roleTargetUserId) return;
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

  // ─── Derived ─────────────────────────────────────────────────────────────

  const activeCount = useMemo(() => users.filter((u) => u.status === 'ACTIVE').length, [users]);
  const pendingCount = useMemo(() => users.filter((u) => u.mustResetPassword).length, [users]);
  const totalRoleAssignments = useMemo(
    () => users.reduce((sum, u) => sum + (u.roles?.length ?? 0), 0),
    [users],
  );

  const notificationLocale =
    (editingUser.notificationPreferences.locale as NotificationLocale) ?? 'en';

  // ─── Tier badge ──────────────────────────────────────────────────────────

  const tierBadge = (tier: number | undefined) => {
    const t0 = tier ?? 0;
    const styles: Record<number, { bg: string; text: string; label: string }> = {
      0: { bg: 'bg-gray-500/10', text: 'text-gray-400', label: t('tierNone') },
      1: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: t('tierStaff') },
      2: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: t('tierManagement') },
      3: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: t('tierSystemOwner') },
    };
    const s = styles[t0] ?? styles[0];
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  // ─── KPI strip ───────────────────────────────────────────────────────────

  const kpiStrip = (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 nvi-stagger">
      <Card padding="md" as="article" className="nvi-card-hover group">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 transition-colors group-hover:bg-blue-500/20">
            <Icon name="Users" size={22} className="text-blue-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">{t('kpiVisibleUsers')}</p>
            <p className="mt-0.5 text-2xl font-bold text-blue-400">{total ?? users.length}</p>
          </div>
        </div>
      </Card>
      <Card padding="md" as="article" className="nvi-card-hover group">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 transition-colors group-hover:bg-emerald-500/20">
            <Icon name="UserCheck" size={22} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">{t('kpiActive')}</p>
            <p className="mt-0.5 text-2xl font-bold text-emerald-400">{activeCount}</p>
          </div>
        </div>
      </Card>
      <Card padding="md" as="article" className="nvi-card-hover group">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 transition-colors group-hover:bg-amber-500/20">
            <Icon name="Send" size={22} className="text-amber-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">{t('kpiPending')}</p>
            <p className="mt-0.5 text-2xl font-bold text-amber-400">{pendingCount}</p>
          </div>
        </div>
      </Card>
      <Card padding="md" as="article" className="nvi-card-hover group">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-purple-500/10 transition-colors group-hover:bg-purple-500/20">
            <Icon name="Shield" size={22} className="text-purple-400" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">{t('kpiRolesAssigned')}</p>
            <p className="mt-0.5 text-2xl font-bold text-purple-400">{totalRoleAssignments}</p>
          </div>
        </div>
      </Card>
    </div>
  );

  // ─── Filters ─────────────────────────────────────────────────────────────

  const filterBar = (
    <Card padding="md">
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
          instanceId="filter-status"
          value={filters.status}
          onChange={(value) => pushFilters({ status: value })}
          options={statusOptions}
          placeholder={common('status')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="filter-role"
          value={filters.roleId}
          onChange={(value) => pushFilters({ roleId: value })}
          options={roleOptions}
          placeholder={common('role')}
          className="nvi-select-container"
        />
      </ListFilters>
    </Card>
  );

  // ─── Invite form (Fix #1: branch picker preserved) ───────────────────────

  const inviteForm = (
    <CollapsibleSection
      title={t('inviteTitle') || 'Invite user'}
      storageKey="settings-users-invite"
      isOpen={inviteOpen}
      onToggle={setInviteOpen}
    >
      <div className="nvi-slide-in-bottom border-l-2 border-l-amber-400 pl-5">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
            <Icon name="Send" size={16} className="text-amber-400" />
          </div>
          <span className="text-sm font-semibold text-amber-300">{t('inviteTitle') || 'Send Invitation'}</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput
            label={t('emailPlaceholder')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@email.com"
            type="email"
          />
          <TextInput
            label={t('namePlaceholder')}
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            placeholder={t('namePlaceholder')}
          />
          <TextInput
            label={t('phonePlaceholder')}
            value={invitePhone}
            onChange={(event) => setInvitePhone(event.target.value)}
            placeholder="+255..."
            type="tel"
          />
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-amber-300/80 mb-1.5 block">
              {common('role')}
            </label>
            <SmartSelect
              instanceId="invite-role"
              value={roleId}
              onChange={setRoleId}
              options={assignableRoles.map((role) => ({
                value: role.id,
                label: role.name,
              }))}
              className="nvi-select-container"
            />
          </div>
        </div>
        {/* Fix #1: Branch checkboxes for invite */}
        {branches.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-300/80 mb-2">
              {t('branchAccessLabel') || 'Branch access (leave empty for all branches)'}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-[var(--nvi-text)]">
              {branches.map((branch) => (
                <label key={branch.id} className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors">
                  <input
                    type="checkbox"
                    checked={inviteBranchIds.includes(branch.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setInviteBranchIds((prev) => [...prev, branch.id]);
                      } else {
                        setInviteBranchIds((prev) => prev.filter((id) => id !== branch.id));
                      }
                    }}
                    className="accent-amber-400 h-4 w-4 rounded"
                  />
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-300">
                    <Icon name="Building2" size={12} />
                    {branch.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={invite}
          disabled={isInviting || !canInvite}
          title={!canInvite ? noAccess('title') : undefined}
          className="nvi-press mt-5 inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-2.5 font-semibold text-amber-400 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isInviting ? <Spinner variant="dots" size="xs" /> : <Icon name="Send" size={16} />}
          {isInviting ? t('sending') : t('sendInvite')}
        </button>
      </div>
    </CollapsibleSection>
  );

  // ─── Notification preferences section (Fix #2 + #3 preserved) ───────────

  const renderNotificationSection = (userId: string) => (
    <div className="nvi-expand space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10">
          <Icon name="Bell" size={15} className="text-amber-400" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-amber-300/80">
          {t('notificationPrefs')}
        </span>
      </div>
      <div className="max-w-xs">
        <SmartSelect
          instanceId={`user-${userId}-notification-locale`}
          value={notificationLocale}
          onChange={(value) =>
            setEditingUser({
              ...editingUser,
              notificationPreferences: {
                ...editingUser.notificationPreferences,
                locale: value === 'sw' ? 'sw' : 'en',
              },
            })
          }
          options={[
            { value: 'en', label: t('whatsappLocaleEnglish') },
            { value: 'sw', label: t('whatsappLocaleSwahili') },
          ]}
          placeholder={t('whatsappLocaleLabel')}
          className="nvi-select-container"
        />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {/* Fix #2: Only events allowed by user's role permissions */}
        {availableNotificationEvents.map((key) => {
          // Fix #3: Disabled when business channel is off
          const disabledByBiz =
            bizNotifSettings != null &&
            isEventDisabledByBusiness(key, bizNotifSettings);
          return (
            <label
              key={key}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors ${disabledByBiz ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5 cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={eventPreferences[key]}
                disabled={disabledByBiz}
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
                className="accent-gold-400 h-4 w-4 rounded"
              />
              <span className="text-[var(--nvi-text)]">{eventLabels(key)}</span>
              {disabledByBiz && (
                <span className="text-[10px] text-[var(--nvi-text-muted)] italic">
                  {t('disabledByBusiness')}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );

  // ─── Role assignment section ─────────────────────────────────────────────

  const renderRoleAssignments = (userId: string) => (
    <div className="nvi-expand space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10">
          <Icon name="Shield" size={15} className="text-purple-400" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-300/80">
          {t('roleAssignments')}
        </span>
      </div>
      {isLoadingRoles ? (
        <div className="flex items-center gap-2 text-xs text-[var(--nvi-text-muted)]">
          <Spinner variant="dots" size="xs" />
          <span>{actions('loading')}</span>
        </div>
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-3">
            <SmartSelect
              instanceId={`assign-role-${userId}`}
              value={assignRoleId}
              onChange={setAssignRoleId}
              options={assignableRoles.map((role) => ({
                value: role.id,
                label: role.name,
              }))}
              className="nvi-select-container"
            />
            <SmartSelect
              instanceId={`assign-branch-${userId}`}
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
              disabled={isAssigning || !canEdit || !assignRoleId}
              title={!canEdit ? noAccess('title') : undefined}
              className="nvi-cta nvi-press inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isAssigning ? <Spinner variant="pulse" size="xs" /> : <Icon name="Plus" size={14} />}
              {isAssigning ? t('assigning') : t('assignRole')}
            </button>
          </div>
          <div className="space-y-1.5">
            {roleAssignments.length === 0 ? (
              <p className="text-xs text-[var(--nvi-text-muted)]">{t('rolesEmpty')}</p>
            ) : (
              roleAssignments.map((assignment) => (
                <Card
                  key={assignment.id}
                  padding="sm"
                  className="flex items-center justify-between"
                  glow={false}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
                      <Icon name="Shield" size={13} className="text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--nvi-text)]">{assignment.role.name}</p>
                      <p className="flex items-center gap-1 text-xs text-[var(--nvi-text-muted)]">
                        <Icon name="Building2" size={12} className="text-blue-400/60" />
                        {assignment.branch?.name || t('allBranches')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRole(assignment.roleId, assignment.branchId)}
                    disabled={!canEdit || isAssigning}
                    title={!canEdit ? noAccess('title') : undefined}
                    className="nvi-press rounded-xl p-2 text-[var(--nvi-text-muted)] hover:text-red-400 transition-colors disabled:opacity-60"
                  >
                    <Icon name="Trash2" size={14} />
                  </button>
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );

  // ─── User card (card view) ───────────────────────────────────────────────

  const renderUserCard = (user: User) => {
    const isEditing = editingUserId === user.id;
    const activeNotifCount = countActiveNotifEvents(user.notificationPreferences);

    return (
      <Card
        key={user.id}
        padding="md"
        className={[
          'nvi-card-hover transition-all',
          isEditing ? 'ring-2 ring-blue-500/40' : '',
        ].join(' ')}
      >
        {isEditing ? (
          /* ── Edit mode ── */
          <div className="space-y-5 nvi-slide-in-bottom">
            {/* Edit header */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10">
                <Icon name="Pencil" size={15} className="text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-blue-300">{t('editUser')}</span>
            </div>

            {/* Profile fields */}
            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                label={t('nameCol')}
                value={editingUser.name}
                onChange={(event) =>
                  setEditingUser({ ...editingUser, name: event.target.value })
                }
              />
              <TextInput
                label={t('emailCol')}
                value={editingUser.email}
                onChange={(event) =>
                  setEditingUser({ ...editingUser, email: event.target.value })
                }
                type="email"
              />
              <div>
                <TextInput
                  label={t('phoneOptional')}
                  value={editingUser.phone}
                  onChange={(event) =>
                    setEditingUser({ ...editingUser, phone: event.target.value })
                  }
                  placeholder="+255..."
                  type="tel"
                />
                <p className="text-[10px] text-[var(--nvi-text-muted)] mt-0.5 px-1">{t('phoneCountryCodeHint')}</p>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-blue-300/80 mb-1.5 block">
                  {common('status')}
                </label>
                <SmartSelect
                  instanceId={`user-${user.id}-status`}
                  value={editingUser.status}
                  onChange={(value) =>
                    setEditingUser({ ...editingUser, status: value })
                  }
                  options={[
                    { value: 'ACTIVE', label: t('statusActive') },
                    { value: 'DEACTIVATED', label: t('statusDeactivated') },
                  ]}
                  className="nvi-select-container"
                />
              </div>
            </div>

            {/* Notification preferences (Fix #2 + #3) */}
            <div className="border-t border-[var(--nvi-border)] pt-4">
              {renderNotificationSection(user.id)}
            </div>

            {/* Role assignments */}
            <div className="border-t border-[var(--nvi-border)] pt-4">
              {renderRoleAssignments(user.id)}
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2 border-t border-[var(--nvi-border)] pt-4">
              <button
                type="button"
                onClick={saveEdit}
                disabled={isSaving || !canEdit}
                title={!canEdit ? noAccess('title') : undefined}
                className="nvi-press inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving ? <Spinner variant="grid" size="xs" /> : <Icon name="Check" size={14} />}
                {isSaving ? t('saving') : common('save')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingUserId(null);
                  setRoleTargetUserId(null);
                  setRoleAssignments([]);
                }}
                className="nvi-press inline-flex items-center gap-2 rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-xs font-medium text-[var(--nvi-text)] hover:bg-white/5 transition-colors"
              >
                <Icon name="X" size={14} />
                {common('cancel')}
              </button>
            </div>
          </div>
        ) : (
          /* ── Display mode ── */
          <div className="space-y-4">
            {/* Header row: avatar + name + status */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-0.5">
                    <AvatarInitials name={user.name} size="lg" />
                  </div>
                  {/* Status dot with glow */}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--nvi-surface)] ${statusDotColor(user.status)} ${statusGlowShadow(user.status)}`}
                    title={user.status}
                  />
                </div>
                <div>
                  <p className="text-sm font-bold text-[var(--nvi-text)]">
                    {user.isOnline && (
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)]" title="Online" />
                    )}
                    {user.name}
                  </p>
                  <p className="mt-0.5 text-xs text-white/40">{user.email}</p>
                </div>
              </div>

              {/* Actions — colored tint buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(user)}
                  disabled={!canEdit}
                  title={!canEdit ? noAccess('title') : t('editUser')}
                  className="nvi-press rounded-xl bg-blue-500/0 p-2 text-blue-400/60 hover:bg-blue-500/10 hover:text-blue-400 transition-colors disabled:opacity-40"
                >
                  <Icon name="Pencil" size={14} />
                </button>
                {user.mustResetPassword && (
                  <button
                    type="button"
                    onClick={() => resendInvitation(user.email)}
                    disabled={isResending === user.email || !canInvite}
                    title={!canInvite ? noAccess('title') : t('resendInvite')}
                    className="nvi-press rounded-xl bg-amber-500/0 p-2 text-amber-400/60 hover:bg-amber-500/10 hover:text-amber-400 transition-colors disabled:opacity-40"
                  >
                    {isResending === user.email ? <Spinner variant="dots" size="xs" /> : <Icon name="Send" size={14} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deactivate(user.id)}
                  disabled={!canDeactivate}
                  title={!canDeactivate ? noAccess('title') : t('deactivate')}
                  className="nvi-press rounded-xl bg-red-500/0 p-2 text-red-400/60 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  <Icon name="Archive" size={14} />
                </button>
              </div>
            </div>

            {/* Role badges — purple pills */}
            {user.roles && user.roles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {user.roles.map((role) => (
                  <span key={role.id} className="inline-flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-medium text-purple-300">
                      <Icon name="Shield" size={10} className="text-purple-400" />
                      {role.name}
                    </span>
                    {tierBadge(role.approvalTier)}
                  </span>
                ))}
              </div>
            )}

            {/* Contact + notifications row */}
            <div className="flex flex-wrap items-center gap-2">
              {user.phone && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                  <Icon name="Phone" size={11} />
                  {user.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/10 px-2 py-1 text-[11px] text-blue-300">
                <Icon name="Mail" size={11} />
                {user.email}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                <Icon name="Bell" size={11} />
                {activeNotifCount > 0 ? t('notifActiveCount', { count: activeNotifCount }) : t('notifNotConfigured')}
              </span>
            </div>

            {/* Activity */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleActivity(user.id)}
                className="nvi-press inline-flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-[10px] font-medium text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors"
              >
                <Icon name="Clock" size={11} />
                {t('viewActivity')}
              </button>
            </div>

            {activityUserId === user.id && (
              <div className="nvi-expand rounded-xl border border-[var(--nvi-border)] bg-black/30 p-3 text-xs">
                {isActivityLoading ? (
                  <span className="flex items-center gap-2 text-[var(--nvi-text-muted)]">
                    <Spinner variant="dots" size="xs" /> {actions('loading')}
                  </span>
                ) : activityData ? (
                  <div className="flex items-center gap-2 text-[var(--nvi-text)]">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/5">
                      <Icon name="Clock" size={11} className="text-white/30" />
                    </div>
                    {t('activitySummary', {
                      salesCount: activityData.salesCount,
                      lastAction: activityData.lastAction,
                      lastActionAt: activityData.lastActionAt,
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </Card>
    );
  };

  // ─── Table view ──────────────────────────────────────────────────────────

  const tableView = (
    <Card padding="sm">
      <div className="overflow-auto">
        <table className="min-w-[800px] w-full text-left text-sm text-[var(--nvi-text)]">
          <thead className="text-xs uppercase text-[var(--nvi-text-muted)]">
            <tr>
              <SortableTableHeader label={t('nameCol')} sortKey="name" currentSortKey={tableSortKey} currentDirection={tableSortDir} onSort={handleSort} />
              <SortableTableHeader label={t('emailCol')} sortKey="email" currentSortKey={tableSortKey} currentDirection={tableSortDir} onSort={handleSort} />
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Phone" size={12} className="text-emerald-400/60" /> {t('phoneCol')}
                </span>
              </th>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1">
                  <Icon name="Shield" size={12} className="text-purple-400/60" /> {t('rolesCol')}
                </span>
              </th>
              <SortableTableHeader label={common('status')} sortKey="status" currentSortKey={tableSortKey} currentDirection={tableSortDir} onSort={handleSort} />
              <th className="px-3 py-2">{common('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr key={user.id} className="border-t border-[var(--nvi-border)] hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <div className="rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 p-0.5">
                        <AvatarInitials name={user.name} size="xs" />
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-[1.5px] border-[var(--nvi-surface)] ${statusDotColor(user.status)} ${statusGlowShadow(user.status)}`}
                      />
                    </div>
                    <span className="font-semibold">
                      {user.isOnline && (
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.5)] mr-1.5" title="Online" />
                      )}
                      {user.name}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-white/40">
                    <Icon name="Mail" size={12} className="text-blue-400/50" /> {user.email}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {user.phone ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                      <Icon name="Phone" size={11} /> {user.phone}
                    </span>
                  ) : (
                    <span className="text-white/20">--</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {user.roles && user.roles.length > 0
                      ? user.roles.map((role) => (
                          <span key={role.id} className="inline-flex items-center gap-1">
                            <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                              <Icon name="Shield" size={9} className="text-purple-400" />
                              {role.name}
                            </span>
                            {tierBadge(role.approvalTier)}
                          </span>
                        ))
                      : <span className="text-white/20">--</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={user.status} size="xs" />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(user)}
                      disabled={!canEdit}
                      title={!canEdit ? noAccess('title') : t('editUser')}
                      className="nvi-press rounded-xl p-1.5 text-blue-400/50 hover:bg-blue-500/10 hover:text-blue-400 transition-colors disabled:opacity-40"
                    >
                      <Icon name="Pencil" size={14} />
                    </button>
                    {user.mustResetPassword && (
                      <button
                        type="button"
                        onClick={() => resendInvitation(user.email)}
                        disabled={isResending === user.email || !canInvite}
                        title={!canInvite ? noAccess('title') : t('resendInvite')}
                        className="nvi-press rounded-xl p-1.5 text-amber-400/50 hover:bg-amber-500/10 hover:text-amber-400 transition-colors disabled:opacity-40"
                      >
                        <Icon name="Send" size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deactivate(user.id)}
                      disabled={!canDeactivate}
                      title={!canDeactivate ? noAccess('title') : t('deactivate')}
                      className="nvi-press rounded-xl p-1.5 text-red-400/50 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      <Icon name="Archive" size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  // ─── Cards view ──────────────────────────────────────────────────────────

  const cardsView = (
    <div className="grid gap-4 md:grid-cols-2 nvi-stagger">
      {users.map(renderUserCard)}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <ListPage
      eyebrow={t('eyebrow')}
      title={t('title')}
      subtitle={t('subtitle')}
      badges={
        <>
          <span className="nvi-badge">{t('badgeTeamOps')}</span>
          <span className="nvi-badge">{t('badgeRoleScoped')}</span>
        </>
      }
      headerActions={
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: common('cards') || 'Cards', table: common('table') || 'Table' }}
        />
      }
      banner={message ? (
        <Banner
          message={typeof message === 'string' ? message : message.message}
          severity={typeof message === 'string' ? 'info' : message.outcome === 'success' ? 'success' : 'error'}
          onDismiss={() => setMessage(null)}
        />
      ) : null}
      kpis={kpiStrip}
      filters={filterBar}
      beforeContent={inviteForm}
      viewMode={viewMode}
      table={tableView}
      cards={cardsView}
      isEmpty={!users.length}
      emptyIcon={
        <div className="nvi-float">
          <Icon name="Users" size={48} className="text-gold-500/40" />
        </div>
      }
      emptyTitle={t('empty')}
      emptyDescription={t('emptyDescription')}
      emptyAction={
        canInvite ? (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-black"
          >
            <Icon name="Send" size={16} />
            {t('sendInvite')}
          </button>
        ) : undefined
      }
      pagination={
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          itemCount={users.length}
          availablePages={Object.keys(pageCursors).map(Number)}
          hasNext={Boolean(nextCursor)}
          hasPrev={page > 1}
          isLoading={isLoading}
          onPageChange={(nextPage) => load(nextPage)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
            setPageCursors({ 1: null });
            setTotal(null);
            load(1, size);
          }}
        />
      }
      isLoading={isLoading}
    />
  );
}
