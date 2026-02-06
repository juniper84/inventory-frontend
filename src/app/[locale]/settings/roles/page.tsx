'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useToastState } from '@/lib/app-notifications';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { PageSkeleton } from '@/components/PageSkeleton';
import { StatusBanner } from '@/components/StatusBanner';
import { SmartSelect } from '@/components/SmartSelect';
import {
  buildCursorQuery,
  normalizePaginated,
  PaginatedResponse,
} from '@/lib/pagination';
import { getPermissionSet } from '@/lib/permissions';
import { ListFilters } from '@/components/ListFilters';
import { useListFilters } from '@/lib/list-filters';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import {
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  PermissionCatalogEntry,
  PermissionLevel,
  PermissionModuleKey,
} from '@/lib/permission-catalog';

type Role = { id: string; name: string; isSystem?: boolean };
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
  const [message, setMessage] = useToastState();
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<PermissionModuleKey | ''>('');
  const [permissionQuery, setPermissionQuery] = useState('');
  const { filters, pushFilters, resetFilters } = useListFilters({
    search: '',
    scope: '',
    permissionCount: '',
  });
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

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

  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      pushFilters({ search: debouncedSearch });
    }
  }, [debouncedSearch, filters.search, pushFilters]);

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
    try {
      const roleQuery = buildCursorQuery({
        limit: 50,
        cursor,
        search: filters.search || undefined,
        scope: filters.scope || undefined,
        permissionCount: filters.permissionCount || undefined,
      });
      const [roleData, permissionData] = await Promise.all([
        apiFetch<PaginatedResponse<Role> | Role[]>(`/roles${roleQuery}`, { token }),
        apiFetch<Permission[]>('/roles/permissions', { token }),
      ]);
      const rolesResult = normalizePaginated(roleData);
      setRoles((prev) =>
        append ? [...prev, ...rolesResult.items] : rolesResult.items,
      );
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
      setNextCursor(rolesResult.nextCursor);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    } finally {
      if (append) {
        setIsLoadingMore(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    load().catch((err) => setMessage(getApiErrorMessage(err, t('loadFailed'))));
  }, [filters.search, filters.scope, filters.permissionCount]);

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) || null,
    [roles, selectedRoleId],
  );
  const isSystemOwnerRole = (role: Role) => role.name === 'System Owner';

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
    setMessage(null);
    setIsCreating(true);
    try {
      const role = await apiFetch<Role>('/roles', {
        method: 'POST',
        token,
        body: JSON.stringify({ name }),
      });
      setRoles((prev) => [...prev, role]);
      setName('');
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('createFailed')),
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
    setMessage(null);
    setIsSaving(true);
    try {
      await apiFetch(`/roles/${selectedRoleId}/permissions`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ permissionIds: selectedPermissions }),
      });
      setMessage({ action: 'update', outcome: 'success', message: t('permissionsUpdated') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('permissionsFailed')),
      });
    } finally {
      setIsSaving(false);
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
          value={filters.scope}
          onChange={(value) => pushFilters({ scope: value })}
          options={scopeOptions}
          placeholder={t('scope')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.permissionCount}
          onChange={(value) => pushFilters({ permissionCount: value })}
          options={permissionCountOptions}
          placeholder={t('permissionCount')}
          className="nvi-select-container"
        />
      </ListFilters>

      <div className="command-card p-6 space-y-4 nvi-reveal">
        <div className="flex gap-3">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('roleName')}
            className="flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <button
            type="button"
            onClick={createRole}
            disabled={isCreating || !canCreate}
            title={!canCreate ? noAccess('title') : undefined}
            className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isCreating ? <Spinner variant="orbit" size="xs" /> : null}
              {isCreating ? t('creating') : common('create')}
            </span>
          </button>
        </div>
      </div>

      <div className="command-card p-6 space-y-3 nvi-reveal">
        <h3 className="text-lg font-semibold text-gold-100">{t('listTitle')}</h3>
        {!roles.length ? <StatusBanner message={t('empty')} /> : null}
        <ul className="mt-3 space-y-2 text-sm text-gold-200 nvi-stagger">
          {roles.map((role) => (
            <li key={role.id} className="flex items-center justify-between">
              <span>{role.name}</span>
              <div className="flex items-center gap-3">
                {role.isSystem ? (
                  <span className="text-gold-400">{t('system')}</span>
                ) : null}
                {isSystemOwnerRole(role) ? (
                  <span className="text-xs text-gold-400">
                    {t('systemOwnerLocked')}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRoleId(role.id);
                      loadRolePermissions(role.id).catch((err) =>
                        setMessage(
                          getApiErrorMessage(err, t('loadPermissionsFailed')),
                        ),
                      );
                    }}
                    disabled={!canUpdate}
                    title={!canUpdate ? noAccess('title') : undefined}
                    className="rounded border border-gold-700/50 px-3 py-1 text-xs text-gold-100"
                  >
                    {t('editPermissions')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {nextCursor ? (
          <button
            type="button"
            onClick={() => load(nextCursor, true)}
            disabled={isLoadingMore}
            className="mt-3 rounded border border-gold-500/60 px-4 py-2 text-sm text-gold-200 disabled:opacity-60"
          >
            <span className="inline-flex items-center gap-2">
              {isLoadingMore ? <Spinner variant="orbit" size="xs" /> : null}
              {isLoadingMore ? actions('loading') : actions('loadMore')}
            </span>
          </button>
        ) : null}
      </div>

      {selectedRole ? (
        <div className="command-card p-6 space-y-4 nvi-reveal">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gold-100">
              {t('permissionsFor', { role: selectedRole.name })}
            </h3>
            <button
              type="button"
              onClick={() => setSelectedRoleId(null)}
              className="text-xs text-gold-400"
            >
              {common('close')}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  value={permissionQuery}
                  onChange={(event) => setPermissionQuery(event.target.value)}
                  placeholder={t('permissionSearch')}
                  className="min-w-[200px] flex-1 rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
                />
                <SmartSelect
                  value={moduleFilter}
                  onChange={(value) => setModuleFilter(value as PermissionModuleKey | '')}
                  options={moduleOptions}
                  placeholder={t('permissionModuleFilter')}
                  className="nvi-select-container min-w-[200px]"
                />
              </div>
              {filteredPermissions.length === 0 ? (
                <StatusBanner message={t('permissionEmpty')} />
              ) : (
                PERMISSION_MODULES.map((module) => {
                  const modulePermissions = permissionsByModule.get(module.key) ?? [];
                  if (moduleFilter && module.key !== moduleFilter) {
                    return null;
                  }
                  if (modulePermissions.length === 0) {
                    return null;
                  }
                  return (
                    <div
                      key={module.key}
                      className="rounded border border-gold-700/40 bg-black/40 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-gold-100">
                            {moduleLabels(module.key)}
                          </h4>
                          <p className="text-xs text-gold-400">
                            {t('permissionPresetHint')}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => applyModulePreset(module.key, 'read')}
                            className="rounded border border-gold-700/50 px-2 py-1 text-gold-100"
                            disabled={!canUpdate}
                          >
                            {presetLabels('read')}
                          </button>
                          <button
                            type="button"
                            onClick={() => applyModulePreset(module.key, 'standard')}
                            className="rounded border border-gold-700/50 px-2 py-1 text-gold-100"
                            disabled={!canUpdate}
                          >
                            {presetLabels('standard')}
                          </button>
                          <button
                            type="button"
                            onClick={() => applyModulePreset(module.key, 'full')}
                            className="rounded border border-gold-500/60 px-2 py-1 text-gold-200"
                            disabled={!canUpdate}
                          >
                            {presetLabels('full')}
                          </button>
                        </div>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {modulePermissions.map((perm) => {
                          const title = permissionCatalog(`${perm.labelKey}.title`);
                          const description = permissionCatalog(
                            `${perm.descriptionKey}.description`,
                          );
                          return (
                            <label
                              key={perm.id}
                              title={!canUpdate ? noAccess('title') : undefined}
                              className="flex items-start gap-3 rounded border border-gold-700/30 px-3 py-3 text-xs text-gold-200"
                            >
                              <input
                                type="checkbox"
                                checked={selectedPermissions.includes(perm.id)}
                                onChange={() => togglePermission(perm.id)}
                                disabled={!canUpdate}
                                className="mt-1"
                              />
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-gold-100">
                                    {title}
                                  </span>
                                  <span className="rounded-full border border-gold-700/40 px-2 py-0.5 text-[10px] uppercase text-gold-300">
                                    {riskLabels(perm.risk)}
                                  </span>
                                </div>
                                <p className="text-xs text-gold-400">
                                  {description}
                                </p>
                                <p className="text-[10px] uppercase text-gold-500/80">
                                  {perm.code}
                                </p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div className="rounded border border-gold-700/40 bg-black/40 p-4 space-y-3 text-xs text-gold-300">
              <h4 className="text-sm font-semibold text-gold-100">
                {t('permissionGuideTitle')}
              </h4>
              <p>{t('permissionGuideBody')}</p>
              <div className="space-y-2">
                <p>
                  <span className="font-semibold text-gold-200">
                    {presetLabels('read')}:
                  </span>{' '}
                  {t('permissionPresetReadHint')}
                </p>
                <p>
                  <span className="font-semibold text-gold-200">
                    {presetLabels('standard')}:
                  </span>{' '}
                  {t('permissionPresetStandardHint')}
                </p>
                <p>
                  <span className="font-semibold text-gold-200">
                    {presetLabels('full')}:
                  </span>{' '}
                  {t('permissionPresetFullHint')}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={savePermissions}
            disabled={isSaving || !canUpdate}
            title={!canUpdate ? noAccess('title') : undefined}
            className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
          >
            <span className="inline-flex items-center gap-2">
              {isSaving ? <Spinner variant="grid" size="xs" /> : null}
              {isSaving ? t('saving') : t('savePermissions')}
            </span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
