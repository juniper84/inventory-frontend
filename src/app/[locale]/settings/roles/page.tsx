'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { notify } from '@/components/notifications/NotificationProvider';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Banner } from '@/components/notifications/Banner';
import type { NotifySeverity } from '@/components/notifications/types';
import { SmartSelect } from '@/components/SmartSelect';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PaginationControls } from '@/components/PaginationControls';
import {
  Shield,
  Lock,
  Key,
  Users,
  UserCog,
  CheckSquare,
  Copy,
  Plus,
  Search,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ShieldQuestion,
  Package,
  Layers,
  ShoppingCart,
  Truck,
  CreditCard,
  Building2,
  Settings,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  PermissionCatalogEntry,
  PermissionLevel,
  PermissionModuleKey,
  PermissionRisk,
} from '@/lib/permission-catalog';

/* ---------- module icon map ---------- */
const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  business: Building2,
  users: Users,
  catalog: Package,
  stock: Layers,
  sales: ShoppingCart,
  customers: Users,
  purchases: Truck,
  reports: CreditCard,
  system: Settings,
};

/* ---------- module color map for left borders + icon containers ---------- */
const MODULE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  business: { border: 'border-l-orange-400', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  users: { border: 'border-l-violet-400', bg: 'bg-violet-500/10', text: 'text-violet-400' },
  catalog: { border: 'border-l-blue-400', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  stock: { border: 'border-l-cyan-400', bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  sales: { border: 'border-l-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  customers: { border: 'border-l-teal-400', bg: 'bg-teal-500/10', text: 'text-teal-400' },
  purchases: { border: 'border-l-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  reports: { border: 'border-l-indigo-400', bg: 'bg-indigo-500/10', text: 'text-indigo-400' },
  system: { border: 'border-l-pink-400', bg: 'bg-pink-500/10', text: 'text-pink-400' },
  transfers: { border: 'border-l-purple-400', bg: 'bg-purple-500/10', text: 'text-purple-400' },
  settings: { border: 'border-l-pink-400', bg: 'bg-pink-500/10', text: 'text-pink-400' },
};

const DEFAULT_MODULE_COLOR = { border: 'border-l-gray-400', bg: 'bg-gray-500/10', text: 'text-gray-400' };

/* ---------- types ---------- */
type Role = { id: string; name: string; isSystem?: boolean; approvalTier?: number; userCount?: number };
type Permission = { id: string; code: string; description?: string | null };
type PermissionEntry = Permission & PermissionCatalogEntry;

export default function RolesPage() {
  const t = useTranslations('rolesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissionCatalog = useTranslations('permissions');
  const moduleLabels = useTranslations('permissionModules');
  const riskLabels = useTranslations('permissionRisks');
  const presetLabels = useTranslations('permissionPresets');
  const permissionsSet = getPermissionSet();
  const canCreate = permissionsSet.has('roles.create');
  const canUpdate = permissionsSet.has('roles.update');
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionEntry[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [createTier, setCreateTier] = useState(0);
  const [editTier, setEditTier] = useState(0);
  const [isSavingTier, setIsSavingTier] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ text: string; severity: NotifySeverity } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCloning, setIsCloning] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [total, setTotal] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<PermissionModuleKey | ''>('');
  const [permissionQuery, setPermissionQuery] = useState('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    scope: '',
    permissionCount: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);


  const scopeOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      { value: 'system', label: t('system') },
      { value: 'custom', label: t('custom') },
    ],
    [common, t],
  );
  const permissionCountOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      { value: 'some', label: t('permissionsSome') },
      { value: 'none', label: t('permissionsNone') },
    ],
    [common, t],
  );

  const tierOptions = useMemo(
    () => [
      { value: '0', label: t('tierNone') },
      { value: '1', label: t('tierStaff') },
      { value: '2', label: t('tierManagement') },
    ],
    [t],
  );

  const moduleOptions = useMemo(
    () => [
      { value: '', label: common('all') },
      ...PERMISSION_MODULES.map((module) => ({
        value: module.key,
        label: moduleLabels(module.key),
      })),
    ],
    [common, moduleLabels],
  );

  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);



  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const permissionData = await apiFetch<Permission[]>('/roles/permissions', { token });
      const catalogByCode = new Map(
        PERMISSION_CATALOG.map((entry) => [entry.code, entry]),
      );
      const enriched = permissionData.map((perm) => {
        const meta = catalogByCode.get(perm.code);
        if (meta) {
          return { ...perm, ...meta };
        }
        return {
          ...perm,
          module: 'system',
          labelKey: 'unknown',
          descriptionKey: 'unknown',
          risk: 'medium',
          level: 'standard',
        } as PermissionEntry;
      });
      setPermissions(enriched);
    } catch (err) {
      setBannerMsg({
        text: getApiErrorMessage(err, t('loadFailed')),
        severity: 'error',
      });
    }
  }, [t]);

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
      const roleQuery = buildCursorQuery({
        limit: effectivePageSize,
        cursor: cursor ?? undefined,
        includeTotal: targetPage === 1 ? '1' : undefined,
        search: filters.search || undefined,
        scope: filters.scope || undefined,
        permissionCount: filters.permissionCount || undefined,
      });
      const roleData = await apiFetch<PaginatedResponse<Role> | Role[]>(
        `/roles${roleQuery}`,
        { token },
      );
      const rolesResult = normalizePaginated(roleData);
      setRoles(rolesResult.items);
      setNextCursor(rolesResult.nextCursor);
      if (typeof rolesResult.total === 'number') {
        setTotal(rolesResult.total);
      }
      setPage(targetPage);
      setPageCursors((prev) => {
        const nextState: Record<number, string | null> =
          targetPage === 1 ? { 1: null } : { ...prev };
        if (rolesResult.nextCursor) {
          nextState[targetPage + 1] = rolesResult.nextCursor;
        }
        return nextState;
      });
    } catch (err) {
      setBannerMsg({
        text: getApiErrorMessage(err, t('loadFailed')),
        severity: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [pageSize, filters.search, filters.scope, filters.permissionCount, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId],
  );
  const isSystemOwnerRole = (role: Role) => role.name === 'System Owner';

  const tierConfig: Record<number, { bg: string; text: string; ring: string }> = {
    0: { bg: 'bg-white/[0.06]', text: 'text-white/40', ring: 'ring-white/10' },
    1: { bg: 'bg-blue-500/10', text: 'text-blue-400', ring: 'ring-blue-500/20' },
    2: { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/20' },
    3: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20' },
  };

  const tierBadge = (tier: number | undefined) => {
    const t0 = tier ?? 0;
    const labels: Record<number, string> = {
      0: t('tierLabelNone'),
      1: t('tierLabelStaff'),
      2: t('tierLabelMgmt'),
      3: t('tierLabelOwner'),
    };
    const s = tierConfig[t0] ?? tierConfig[0];
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${s.bg} ${s.text} ${s.ring}`}>
        <Shield className="h-2.5 w-2.5" />
        {labels[t0]}
      </span>
    );
  };

  const riskIcon = (risk: PermissionRisk) => {
    if (risk === 'high') return <AlertTriangle className="h-3 w-3 text-red-400" />;
    if (risk === 'medium') return <AlertCircle className="h-3 w-3 text-amber-400" />;
    return <ShieldCheck className="h-3 w-3 text-emerald-400" />;
  };

  const riskBadgeClasses: Record<PermissionRisk, string> = {
    high: 'bg-red-500/10 text-red-400 ring-red-500/20',
    medium: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    low: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
  };

  const loadRolePermissions = async (roleId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const data = await apiFetch<string[]>(`/roles/${roleId}/permissions`, {
      token,
    });
    setSelectedPermissions(data || []);
  };

  const createRole = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setBannerMsg(null);
    setIsCreating(true);
    try {
      const role = await apiFetch<Role>('/roles', {
        method: 'POST',
        token,
        body: JSON.stringify({ name, approvalTier: createTier }),
      });
      setRoles((prev) => [...prev, role]);
      setName('');
      setCreateTier(0);
      notify.success(t('created'));
    } catch (err) {
      setBannerMsg({
        text: getApiErrorMessage(err, t('createFailed')),
        severity: 'error',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((id) => id !== permissionId)
        : [...prev, permissionId],
    );
  };

  const levelRank: Record<PermissionLevel, number> = {
    read: 0,
    standard: 1,
    full: 2,
  };

  const applyModulePreset = (moduleKey: PermissionModuleKey, level: PermissionLevel) => {
    const modulePermissions = permissions.filter(
      (perm) => perm.module === moduleKey,
    );
    const allowed = modulePermissions
      .filter((perm) => levelRank[perm.level] <= levelRank[level])
      .map((perm) => perm.id);
    setSelectedPermissions((prev) => {
      const withoutModule = prev.filter(
        (id) => !modulePermissions.some((perm) => perm.id === id),
      );
      return Array.from(new Set([...withoutModule, ...allowed]));
    });
  };

  const filteredPermissions = useMemo(() => {
    const query = permissionQuery.trim().toLowerCase();
    return permissions.filter((perm) => {
      if (moduleFilter && perm.module !== moduleFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const label = permissionCatalog(`${perm.labelKey}.title`).toLowerCase();
      const desc = permissionCatalog(`${perm.descriptionKey}.description`).toLowerCase();
      return (
        perm.code.toLowerCase().includes(query) ||
        label.includes(query) ||
        desc.includes(query)
      );
    });
  }, [permissions, permissionQuery, moduleFilter, permissionCatalog]);

  const permissionsByModule = useMemo(() => {
    const grouped = new Map<PermissionModuleKey, PermissionEntry[]>();
    filteredPermissions.forEach((perm) => {
      const list = grouped.get(perm.module) ?? [];
      list.push(perm);
      grouped.set(perm.module, list);
    });
    return grouped;
  }, [filteredPermissions]);

  const savePermissions = async () => {
    const token = getAccessToken();
    if (!token || !selectedRoleId) {
      return;
    }
    setBannerMsg(null);
    setIsSaving(true);
    try {
      await apiFetch(`/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ permissionIds: selectedPermissions }),
      });
      notify.success(t('permissionsUpdated'));
    } catch (err) {
      setBannerMsg({
        text: getApiErrorMessage(err, t('permissionsFailed')),
        severity: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveRoleTier = async () => {
    const token = getAccessToken();
    if (!token || !selectedRoleId) {
      return;
    }
    setIsSavingTier(true);
    try {
      const updated = await apiFetch<Role>(`/roles/${selectedRoleId}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ approvalTier: editTier }),
      });
      setRoles((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, approvalTier: updated.approvalTier } : r)),
      );
      notify.success(t('tierUpdated'));
    } catch (err) {
      setBannerMsg({
        text: getApiErrorMessage(err, t('tierFailed')),
        severity: 'error',
      });
    } finally {
      setIsSavingTier(false);
    }
  };

  const cloneRole = async (sourceRole: Role) => {
    const ok = await notify.confirm({
      title: t('cloneConfirmTitle'),
      message: t('cloneConfirmMessage', { role: sourceRole.name }),
      confirmText: t('cloneConfirmButton'),
    });
    if (!ok) return;
    setIsCloning(sourceRole.id);
    setBannerMsg(null);
    try {
      const token = getAccessToken();
      if (!token) return;
      const newRole = await apiFetch<Role>('/roles', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: `${sourceRole.name} (${t('copy')})`,
          approvalTier: sourceRole.approvalTier ?? 0,
        }),
      });
      const sourcePerms = await apiFetch<string[]>(
        `/roles/${sourceRole.id}/permissions`,
        { token },
      );
      if (sourcePerms && sourcePerms.length > 0) {
        await apiFetch(`/roles/${newRole.id}/permissions`, {
          method: 'PUT',
          token,
          body: JSON.stringify({ permissionIds: sourcePerms }),
        });
      }
      notify.success(t('cloneSuccess'));
      await load();
    } catch (err) {
      setBannerMsg({
        text: getApiErrorMessage(err, t('cloneFailed')),
        severity: 'error',
      });
    } finally {
      setIsCloning(null);
    }
  };

  const riskSummary = useMemo(() => {
    if (!selectedRoleId || selectedPermissions.length === 0) return null;
    const permissionIdSet = new Set(selectedPermissions);
    const selectedEntries = permissions.filter((p) => permissionIdSet.has(p.id));
    const counts: Record<PermissionRisk, number> = { high: 0, medium: 0, low: 0 };
    for (const entry of selectedEntries) {
      counts[entry.risk] = (counts[entry.risk] ?? 0) + 1;
    }
    return counts;
  }, [selectedRoleId, selectedPermissions, permissions]);

  const toggleModuleExpand = (key: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  /* ---------- module progress helper ---------- */
  const moduleGrantedCount = (moduleKey: string) => {
    const modulePerms = permissions.filter((p) => p.module === moduleKey);
    return modulePerms.filter((p) => selectedPermissions.includes(p.id)).length;
  };
  const moduleTotalCount = (moduleKey: string) => {
    return permissions.filter((p) => p.module === moduleKey).length;
  };

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="nvi-page">
      {/* ---------- HEADER ---------- */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">{t('badgeRiskAware')}</span>
            <span className="nvi-badge">{t('badgeModulePresets')}</span>
          </>
        }
      />

      {/* ---------- KPIs ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--nvi-muted)]">{t('kpiVisibleRoles')}</p>
              <p className="mt-2 text-3xl font-semibold text-purple-400">{roles.length}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20">
              <Shield className="h-5 w-5 text-purple-400" />
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--nvi-muted)]">{t('kpiPermissions')}</p>
              <p className="mt-2 text-3xl font-semibold text-blue-400">{permissions.length}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
              <Key className="h-5 w-5 text-blue-400" />
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--nvi-muted)]">{t('kpiSelectedRole')}</p>
              <p className="mt-2 text-lg font-semibold text-emerald-400">
                {selectedRole?.name ?? '\u2014'}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <UserCog className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
        </Card>
        <Card as="article" padding="md" className="nvi-card-hover">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--nvi-muted)]">{t('kpiAssignedPerms')}</p>
              <p className="mt-2 text-3xl font-semibold text-amber-400">{selectedPermissions.length}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20">
              <CheckSquare className="h-5 w-5 text-amber-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* ---------- BANNER ---------- */}
      {bannerMsg ? (
        <Banner
          message={bannerMsg.text}
          severity={bannerMsg.severity}
          onDismiss={() => setBannerMsg(null)}
        />
      ) : null}

      {/* ---------- FILTERS ---------- */}
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
          instanceId="filter-scope"
          value={filters.scope}
          onChange={(value) => pushFilters({ scope: value })}
          options={scopeOptions}
          placeholder={t('scope')}
          className="nvi-select-container"
        />
        <SmartSelect
          instanceId="filter-permission-count"
          value={filters.permissionCount}
          onChange={(value) => pushFilters({ permissionCount: value })}
          options={permissionCountOptions}
          placeholder={t('permissionCount')}
          className="nvi-select-container"
        />
      </ListFilters>

      {/* ---------- MASTER / DETAIL LAYOUT ---------- */}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">

        {/* ===== LEFT PANEL: ROLE LIST ===== */}
        <div className="space-y-3">
          <Card padding="md">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--nvi-foreground)]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
                <Shield className="h-3.5 w-3.5 text-purple-400" />
              </div>
              {t('listTitle')}
            </h3>
          </Card>

          {!roles.length ? (
            <EmptyState
              icon={<ShieldQuestion className="h-10 w-10 text-purple-500/40 nvi-float" />}
              title={t('empty')}
              description={t('emptyHint')}
            />
          ) : (
            <ul className="space-y-2 nvi-stagger">
              {roles.map((role) => {
                const isSelected = role.id === selectedRoleId;
                const isOwner = isSystemOwnerRole(role);
                return (
                  <li key={role.id}>
                    <div
                      role="button"
                      tabIndex={isOwner || !canUpdate ? -1 : 0}
                      aria-disabled={isOwner || !canUpdate}
                      title={!canUpdate ? noAccess('title') : isOwner ? t('systemOwnerLocked') : undefined}
                      onClick={() => {
                        if (isOwner || !canUpdate) return;
                        setSelectedRoleId(role.id);
                        setEditTier(role.approvalTier ?? 0);
                        setExpandedModules(new Set());
                        loadRolePermissions(role.id).catch((err) =>
                          setBannerMsg({
                            text: getApiErrorMessage(err, t('loadPermissionsFailed')),
                            severity: 'error',
                          }),
                        );
                      }}
                      className={[
                        'w-full rounded-xl border bg-white/[0.02] border-white/[0.06] p-3 text-left transition-all',
                        isSelected
                          ? 'ring-2 ring-purple-500/40 bg-purple-500/[0.04]'
                          : 'hover:border-white/[0.12] hover:bg-white/[0.04]',
                        isOwner ? 'opacity-60 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-purple-500/15' : 'bg-purple-500/10'}`}>
                          {isOwner ? (
                            <Lock className="h-4 w-4 text-purple-400" />
                          ) : (
                            <Shield className="h-4 w-4 text-purple-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-[color:var(--nvi-foreground)]">
                              {role.name}
                            </span>
                            {role.isSystem ? (
                              <span className="shrink-0 rounded-full bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-purple-400 ring-1 ring-purple-500/20">
                                {t('system')}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {tierBadge(isOwner ? 3 : role.approvalTier)}
                            {typeof role.userCount === 'number' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-white/30">
                                <Users className="h-2.5 w-2.5" />
                                {role.userCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {!isOwner ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              cloneRole(role);
                            }}
                            disabled={isCloning === role.id || !canCreate}
                            title={!canCreate ? noAccess('title') : t('clone')}
                            className="nvi-press shrink-0 rounded-lg bg-white/[0.04] p-1.5 text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/60 disabled:opacity-40"
                          >
                            {isCloning === role.id ? (
                              <Spinner variant="orbit" size="xs" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Pagination */}
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={total}
            itemCount={roles.length}
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

          {/* ---------- CREATE ROLE FORM ---------- */}
          <Card padding="md" className="space-y-3 border-l-2 border-l-purple-400">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--nvi-foreground)]">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-500/10">
                <Shield className="h-3 w-3 text-purple-400" />
              </div>
              {t('createRole')}
            </h4>
            <TextInput
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('roleName')}
              label={t('roleName')}
            />
            <SmartSelect
              instanceId="create-role-tier"
              value={String(createTier)}
              onChange={(value) => setCreateTier(Number(value))}
              options={tierOptions}
              placeholder={t('approvalAuthority')}
              className="nvi-select-container"
            />
            <button
              type="button"
              onClick={createRole}
              disabled={isCreating || !canCreate || !name.trim()}
              title={!canCreate ? noAccess('title') : undefined}
              className="nvi-press flex w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isCreating ? <Spinner variant="orbit" size="xs" /> : <Plus className="h-4 w-4" />}
              {isCreating ? t('creating') : common('create')}
            </button>
            <p className="text-[10px] text-[color:var(--nvi-muted)]">{t('approvalAuthorityHint')}</p>
          </Card>
        </div>

        {/* ===== RIGHT PANEL: PERMISSION MATRIX ===== */}
        {selectedRole ? (
          <div className="space-y-4 nvi-slide-in-bottom">
            {/* Header */}
            <Card padding="lg" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 ring-1 ring-purple-500/20">
                    <Shield className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[color:var(--nvi-foreground)]">
                      {selectedRole.name}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-2">
                      {tierBadge(isSystemOwnerRole(selectedRole) ? 3 : selectedRole.approvalTier)}
                      <span className="text-xs text-[color:var(--nvi-muted)]">
                        {t('permissionsCount', { count: selectedPermissions.length, total: permissions.length })}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRoleId(null)}
                  className="nvi-press rounded-lg p-2 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/60"
                  aria-label={common('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Progress bar */}
              <ProgressBar
                value={selectedPermissions.length}
                max={permissions.length}
                label={t('permissionsProgress')}
                showPercent
                showValue
                height={8}
                color="accent"
                className="nvi-pop"
              />

              {/* Risk summary */}
              {riskSummary ? (
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-[color:var(--nvi-muted)]">{t('riskSummaryLabel')}</span>
                  <span className="inline-flex items-center gap-1 text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    {riskSummary.high} {riskLabels('high')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <AlertCircle className="h-3 w-3" />
                    {riskSummary.medium} {riskLabels('medium')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    {riskSummary.low} {riskLabels('low')}
                  </span>
                </div>
              ) : null}
            </Card>

            {/* Approval authority (non-system roles) */}
            {!selectedRole.isSystem ? (
              <Card padding="md" className="space-y-3 nvi-expand">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--nvi-foreground)]">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
                    <Shield className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  {t('approvalAuthority')}
                </h4>
                <div className="flex flex-wrap items-center gap-3">
                  <SmartSelect
                    instanceId="edit-role-tier"
                    value={String(editTier)}
                    onChange={(value) => setEditTier(Number(value))}
                    options={tierOptions}
                    className="nvi-select-container min-w-[200px]"
                    isDisabled={!canUpdate}
                  />
                  <button
                    type="button"
                    onClick={saveRoleTier}
                    disabled={isSavingTier || !canUpdate}
                    title={!canUpdate ? noAccess('title') : undefined}
                    className="nvi-press flex items-center gap-2 rounded-xl border border-purple-500/40 px-4 py-2 text-sm font-medium text-[color:var(--nvi-foreground)] transition-colors hover:bg-purple-500/10 disabled:opacity-40"
                  >
                    {isSavingTier ? <Spinner variant="orbit" size="xs" /> : null}
                    {isSavingTier ? t('saving') : common('save')}
                  </button>
                </div>
                <p className="text-[10px] text-[color:var(--nvi-muted)]">{t('approvalAuthorityHint')}</p>
              </Card>
            ) : null}

            {/* Permission search + module filter */}
            <Card padding="md" className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <TextInput
                    value={permissionQuery}
                    onChange={(event) => setPermissionQuery(event.target.value)}
                    placeholder={t('permissionSearch')}
                    className="pl-9"
                    type="search"
                  />
                </div>
                <SmartSelect
                  instanceId="role-permission-module-filter"
                  value={moduleFilter}
                  onChange={(value) => setModuleFilter(value as PermissionModuleKey | '')}
                  options={moduleOptions}
                  placeholder={t('permissionModuleFilter')}
                  className="nvi-select-container min-w-[200px]"
                />
              </div>

              {/* Module preset row */}
              <div className="flex flex-wrap gap-2">
                {PERMISSION_MODULES.filter((m) => !moduleFilter || m.key === moduleFilter).map((module) => {
                  const ModIcon = MODULE_ICONS[module.key] ?? Settings;
                  const modColor = MODULE_COLORS[module.key] ?? DEFAULT_MODULE_COLOR;
                  return (
                    <div key={module.key} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5">
                      <div className={`flex h-5 w-5 items-center justify-center rounded ${modColor.bg}`}>
                        <ModIcon className={`h-3 w-3 ${modColor.text}`} />
                      </div>
                      <span className="text-[10px] font-medium text-[color:var(--nvi-muted)]">{moduleLabels(module.key)}</span>
                      <button
                        type="button"
                        onClick={() => applyModulePreset(module.key, 'read')}
                        disabled={!canUpdate}
                        className="nvi-press ml-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-40"
                      >
                        {presetLabels('read')}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset(module.key, 'standard')}
                        disabled={!canUpdate}
                        className="nvi-press rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                      >
                        {presetLabels('standard')}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyModulePreset(module.key, 'full')}
                        disabled={!canUpdate}
                        className="nvi-press rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-40"
                      >
                        {presetLabels('full')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Permission groups */}
            {filteredPermissions.length === 0 ? (
              <EmptyState
                icon={<Key className="h-8 w-8 text-blue-500/40 nvi-float" />}
                title={t('permissionEmpty')}
              />
            ) : (
              <div className="space-y-3 nvi-stagger">
                {PERMISSION_MODULES.map((module) => {
                  const modulePermissions = permissionsByModule.get(module.key) ?? [];
                  if (moduleFilter && module.key !== moduleFilter) return null;
                  if (modulePermissions.length === 0) return null;
                  const granted = moduleGrantedCount(module.key);
                  const totalMod = moduleTotalCount(module.key);
                  const ModIcon = MODULE_ICONS[module.key] ?? Settings;
                  const isExpanded = expandedModules.has(module.key);

                  const modColor = MODULE_COLORS[module.key] ?? DEFAULT_MODULE_COLOR;

                  return (
                    <Card key={module.key} padding="md" className={`space-y-3 nvi-expand border-l-2 ${modColor.border}`}>
                      {/* Module header -- clickable to expand */}
                      <button
                        type="button"
                        onClick={() => toggleModuleExpand(module.key)}
                        className="nvi-press flex w-full items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${modColor.bg}`}>
                            <ModIcon className={`h-4 w-4 ${modColor.text}`} />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-[color:var(--nvi-foreground)]">
                              {moduleLabels(module.key)}
                            </h4>
                            <p className="text-[10px] text-[color:var(--nvi-muted)]">
                              {granted}/{totalMod} {t('permissionsGranted')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <ProgressBar
                            value={granted}
                            max={totalMod}
                            height={4}
                            color={granted === totalMod ? 'green' : 'accent'}
                            className="w-24"
                          />
                          {isExpanded ? (
                            <ChevronDown className={`h-4 w-4 ${modColor.text} opacity-60`} />
                          ) : (
                            <ChevronRight className={`h-4 w-4 ${modColor.text} opacity-60`} />
                          )}
                        </div>
                      </button>

                      {/* Expanded permission rows */}
                      {isExpanded ? (
                        <div className="space-y-2 nvi-stagger">
                          {modulePermissions.map((perm) => {
                            const title = permissionCatalog(`${perm.labelKey}.title`);
                            const description = permissionCatalog(`${perm.descriptionKey}.description`);
                            const isChecked = selectedPermissions.includes(perm.id);
                            return (
                              <label
                                key={perm.id}
                                title={!canUpdate ? noAccess('title') : undefined}
                                className={[
                                  'flex items-start gap-3 rounded-xl border px-3 py-3 text-xs transition-all cursor-pointer',
                                  isChecked
                                    ? 'border-purple-500/30 bg-purple-500/[0.04]'
                                    : 'border-white/[0.06] hover:border-white/[0.12]',
                                ].join(' ')}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => togglePermission(perm.id)}
                                  disabled={!canUpdate}
                                  className="mt-1 h-4 w-4 rounded border-gold-700/50 bg-black accent-gold-500"
                                />
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-[color:var(--nvi-foreground)]">
                                      {title}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                      perm.risk === 'high'
                                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                        : perm.risk === 'medium'
                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    }`}>
                                      {riskIcon(perm.risk)}
                                      {riskLabels(perm.risk)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[color:var(--nvi-muted)]">
                                    {description}
                                  </p>
                                  <p className="text-[10px] uppercase text-white/20">
                                    {perm.code}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Permission guide + save */}
            <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
              <Card padding="md" className="space-y-3 text-xs text-[color:var(--nvi-muted)]">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-[color:var(--nvi-foreground)]">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
                    <Key className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  {t('permissionGuideTitle')}
                </h4>
                <p>{t('permissionGuideBody')}</p>
                <div className="space-y-2">
                  <p>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                      <ShieldCheck className="h-3 w-3" />
                      {presetLabels('read')}:
                    </span>{' '}
                    {t('permissionPresetReadHint')}
                  </p>
                  <p>
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                      <AlertCircle className="h-3 w-3" />
                      {presetLabels('standard')}:
                    </span>{' '}
                    {t('permissionPresetStandardHint')}
                  </p>
                  <p>
                    <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      {presetLabels('full')}:
                    </span>{' '}
                    {t('permissionPresetFullHint')}
                  </p>
                </div>
              </Card>

              <button
                type="button"
                onClick={savePermissions}
                disabled={isSaving || !canUpdate}
                title={!canUpdate ? noAccess('title') : undefined}
                className="nvi-press flex h-fit items-center gap-2 self-end rounded-xl bg-gold-500 px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isSaving ? <Spinner variant="grid" size="xs" /> : <CheckSquare className="h-4 w-4" />}
                {isSaving ? t('saving') : t('savePermissions')}
              </button>
            </div>
          </div>
        ) : (
          /* Empty state when no role selected */
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10">
                <ShieldQuestion className="h-8 w-8 text-purple-400 nvi-float" />
              </div>
              <EmptyState
                icon={null}
                title={t('selectRoleHint')}
                description={t('selectRoleDescription')}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
