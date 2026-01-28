'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useToastState } from '@/lib/app-notifications';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { StatusBanner } from '@/components/StatusBanner';
import { buildCursorQuery, normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { getPermissionSet } from '@/lib/permissions';

type NoteLink = {
  id?: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string | null;
};

type NoteReminder = {
  id: string;
  channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP';
  status: 'SCHEDULED' | 'SENT' | 'FAILED' | 'CANCELLED';
  scheduledAt: string;
};

type Note = {
  id: string;
  title: string;
  body: string;
  visibility: 'PRIVATE' | 'BRANCH' | 'BUSINESS';
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  tags: string[];
  branch?: { id: string; name: string } | null;
  author?: { id: string; name: string } | null;
  links: NoteLink[];
};

type Branch = { id: string; name: string };

type NotesMeta = {
  tier?: 'STARTER' | 'BUSINESS' | 'ENTERPRISE' | null;
  allowedChannels: Array<'IN_APP' | 'EMAIL' | 'WHATSAPP'>;
};

type LinkableRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  product?: { name?: string | null } | null;
  sourceBranch?: { name?: string | null } | null;
  destinationBranch?: { name?: string | null } | null;
};

const LINK_TYPES = [
  { value: 'Product', label: 'Product' },
  { value: 'Variant', label: 'Variant' },
  { value: 'Branch', label: 'Branch' },
  { value: 'Supplier', label: 'Supplier' },
  { value: 'Customer', label: 'Customer' },
  { value: 'PurchaseOrder', label: 'Purchase order' },
  { value: 'Purchase', label: 'Purchase' },
  { value: 'Transfer', label: 'Transfer' },
];

export default function NotesPage() {
  const t = useTranslations('notesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');
  const permissions = getPermissionSet();
  const canWrite = permissions.has('notes.write');
  const canManage = permissions.has('notes.manage');
  const [message, setMessage] = useToastState();
  const [notes, setNotes] = useState<Note[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [meta, setMeta] = useState<NotesMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [filters, setFilters] = useState({
    search: '',
    tag: '',
    visibility: '',
    branchId: '',
  });
  const [form, setForm] = useState({
    title: '',
    body: '',
    visibility: 'BUSINESS' as Note['visibility'],
    branchId: '',
    tags: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [links, setLinks] = useState<NoteLink[]>([]);
  const [linkType, setLinkType] = useState('');
  const [linkQuery, setLinkQuery] = useState('');
  const [linkOptions, setLinkOptions] = useState<{ id: string; label: string }[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [reminderForms, setReminderForms] = useState<
    Record<
      string,
      {
        scheduledAt: string;
        channels: Record<'IN_APP' | 'EMAIL' | 'WHATSAPP', boolean>;
        busy?: boolean;
      }
    >
  >({});
  const [reminderLists, setReminderLists] = useState<Record<string, NoteReminder[]>>({});

  const allowedChannels = meta?.allowedChannels ?? ['IN_APP'];

  const load = async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor = targetPage === 1 ? null : pageCursors[targetPage] ?? null;
    const query = buildCursorQuery({
      limit: effectivePageSize,
      cursor: cursor ?? undefined,
      includeTotal: targetPage === 1 ? '1' : undefined,
      search: filters.search || undefined,
      tag: filters.tag || undefined,
      visibility: filters.visibility || undefined,
      branchId: filters.branchId || undefined,
    });
    try {
      const [noteData, branchData, metaData] = await Promise.all([
        apiFetch<PaginatedResponse<Note> | Note[]>(`/notes${query}`, { token }),
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<NotesMeta>('/notes/meta', { token }),
      ]);
      const notesResult = normalizePaginated(noteData);
      setNotes(notesResult.items);
      setNextCursor(notesResult.nextCursor);
      if (typeof notesResult.total === 'number') {
        setTotal(notesResult.total);
      }
      setBranches(normalizePaginated(branchData).items);
      setMeta(metaData);
    setPage(targetPage);
    setPageCursors((prev) => {
      const nextState: Record<number, string | null> =
        targetPage === 1 ? { 1: null } : { ...prev };
      if (notesResult.nextCursor) {
        nextState[targetPage + 1] = notesResult.nextCursor;
      }
      return nextState;
    });
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

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [filters.search, filters.tag, filters.visibility, filters.branchId]);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !linkType || !linkQuery.trim()) {
      setLinkOptions([]);
      return;
    }
    let active = true;
    setLinkLoading(true);
    apiFetch<LinkableRecord[]>(
      `/notes/linkables?type=${linkType}&query=${encodeURIComponent(linkQuery)}`,
      {
      token,
      },
    )
      .then((items) => {
        if (!active) {
          return;
        }
        const options = items.map((item) => {
          if (linkType === 'Variant' && item.product?.name) {
            return { id: item.id, label: `${item.product.name} · ${item.name}` };
          }
          if (linkType === 'Transfer') {
            const parts = [
              item.sourceBranch?.name,
              item.destinationBranch?.name,
              item.status,
            ].filter(Boolean);
            return { id: item.id, label: parts.length ? parts.join(' • ') : item.id };
          }
          if (linkType === 'Purchase') {
            return { id: item.id, label: `${item.id} • ${item.status}` };
          }
          if (linkType === 'PurchaseOrder') {
            return { id: item.id, label: `${item.id} • ${item.status}` };
          }
          return { id: item.id, label: item.name ?? item.id };
        });
        setLinkOptions(options);
      })
      .catch((err) => {
        setLinkOptions([]);
        setMessage({
          action: 'load',
          outcome: 'failure',
          message: getApiErrorMessage(err, t('loadFailed')),
        });
      })
      .finally(() => {
        if (active) {
          setLinkLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [linkType, linkQuery]);

  const resetForm = () => {
    setForm({
      title: '',
      body: '',
      visibility: 'BUSINESS',
      branchId: '',
      tags: '',
    });
    setLinks([]);
    setEditingId(null);
  };

  const applyEdit = (note: Note) => {
    setEditingId(note.id);
    setForm({
      title: note.title,
      body: note.body,
      visibility: note.visibility,
      branchId: note.branch?.id ?? '',
      tags: (note.tags ?? []).join(', '),
    });
    setLinks(note.links ?? []);
  };

  const saveNote = async () => {
    const token = getAccessToken();
    if (!token || !form.title.trim() || !form.body.trim()) {
      return;
    }
    setIsSaving(true);
    setMessage(null);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      visibility: form.visibility,
      branchId: form.branchId || null,
      tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      links: links.map((link) => ({
        resourceType: link.resourceType,
        resourceId: link.resourceId,
      })),
    };
    try {
      if (editingId) {
        await apiFetch(`/notes/${editingId}`, {
          token,
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/notes', {
          token,
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      resetForm();
      await load(1);
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('saveFailed')),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const archiveNote = async (noteId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setMessage(null);
    try {
      await apiFetch(`/notes/${noteId}/archive`, {
        token,
        method: 'POST',
      });
      await load(1);
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('archiveFailed')),
      });
    }
  };

  const addLink = (option: { id: string; label: string }) => {
    if (!linkType) {
      return;
    }
    if (links.some((link) => link.resourceType === linkType && link.resourceId === option.id)) {
      return;
    }
    setLinks((prev) => [
      ...prev,
      { resourceType: linkType, resourceId: option.id, resourceName: option.label },
    ]);
    setLinkQuery('');
  };

  const removeLink = (resourceType: string, resourceId: string) => {
    setLinks((prev) =>
      prev.filter(
        (link) => !(link.resourceType === resourceType && link.resourceId === resourceId),
      ),
    );
  };

  const loadReminders = async (noteId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const data = await apiFetch<NoteReminder[]>(`/notes/${noteId}/reminders`, { token });
    setReminderLists((prev) => ({ ...prev, [noteId]: data }));
  };

  const updateReminderForm = (
    noteId: string,
    patch: Partial<{
      scheduledAt: string;
      channels: Record<'IN_APP' | 'EMAIL' | 'WHATSAPP', boolean>;
      busy?: boolean;
    }>,
  ) => {
    setReminderForms((prev) => ({
      ...prev,
      [noteId]: {
        ...(prev[noteId] ?? {
          scheduledAt: '',
          channels: { IN_APP: true, EMAIL: false, WHATSAPP: false },
        }),
        ...patch,
      },
    }));
  };

  const scheduleReminder = async (noteId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const formState = reminderForms[noteId] ?? {
      scheduledAt: '',
      channels: { IN_APP: true, EMAIL: false, WHATSAPP: false },
    };
    const selected = Object.entries(formState.channels)
      .filter(([, enabled]) => enabled)
      .map(([channel]) => channel as 'IN_APP' | 'EMAIL' | 'WHATSAPP')
      .filter((channel) => allowedChannels.includes(channel));
    if (!formState.scheduledAt || !selected.length) {
      return;
    }
    updateReminderForm(noteId, { busy: true });
    try {
      await apiFetch(`/notes/${noteId}/reminders`, {
        token,
        method: 'POST',
        body: JSON.stringify({
          scheduledAt: formState.scheduledAt,
          channels: selected,
        }),
      });
      updateReminderForm(noteId, { scheduledAt: '', busy: false });
      await loadReminders(noteId);
      setMessage({ action: 'create', outcome: 'success', message: t('reminderCreated') });
    } catch (err) {
      updateReminderForm(noteId, { busy: false });
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('reminderFailed')),
      });
    }
  };

  const cancelReminder = async (noteId: string, reminderId: string) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    try {
      await apiFetch(`/notes/reminders/${reminderId}/cancel`, {
        token,
        method: 'POST',
      });
      await loadReminders(noteId);
      setMessage({ action: 'update', outcome: 'success', message: t('reminderCancelled') });
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('reminderFailed')),
      });
    }
  };

  const linkChips = links.length ? (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <button
          key={`${link.resourceType}-${link.resourceId}`}
          type="button"
          onClick={() => removeLink(link.resourceType, link.resourceId)}
          className="rounded-full border border-gold-700/50 px-3 py-1 text-xs text-gold-200 hover:text-gold-100"
        >
          {link.resourceName ?? `${link.resourceType} • ${link.resourceId}`}
        </button>
      ))}
    </div>
  ) : (
    <p className="text-xs text-gold-400">{t('noLinks')}</p>
  );

  const visibilityOptions = [
    { value: 'PRIVATE', label: t('visibilityPrivate') },
    { value: 'BRANCH', label: t('visibilityBranch') },
    { value: 'BUSINESS', label: t('visibilityBusiness') },
  ];

  const tableRows = useMemo(() => {
    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      visibility: note.visibility,
      branch: note.branch?.name ?? '—',
      tags: note.tags?.length ? note.tags.join(', ') : '—',
      links: note.links?.length ?? 0,
      status: note.status,
    }));
  }, [notes]);

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
          <p className="text-sm text-gold-300">{t('subtitle')}</p>
        </div>
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
        />
      </div>

      {message ? <StatusBanner message={message} /> : null}

      <div className="command-card p-4 space-y-4 nvi-reveal">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gold-100">
            {editingId ? t('editNote') : t('newNote')}
          </h3>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-gold-300 hover:text-gold-100"
            >
              {actions('clear')}
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder={t('noteTitle')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
          <SmartSelect
            value={form.visibility}
            onChange={(value) =>
              setForm({ ...form, visibility: value as Note['visibility'] })
            }
            options={visibilityOptions}
            placeholder={t('visibility')}
            className="nvi-select-container"
          />
          <textarea
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
            placeholder={t('noteBody')}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 md:col-span-2"
            rows={4}
          />
          <SmartSelect
            value={form.branchId}
            onChange={(value) => setForm({ ...form, branchId: value })}
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            placeholder={t('branch')}
            isClearable
            className="nvi-select-container"
            isDisabled={form.visibility !== 'BRANCH'}
          />
          <input
            value={form.tags}
            onChange={(event) => setForm({ ...form, tags: event.target.value })}
            placeholder={`${t('tags')} (${t('tagsHint')})`}
            className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
            {t('links')}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <SmartSelect
              value={linkType}
              onChange={(value) => {
                setLinkType(value);
                setLinkQuery('');
                setLinkOptions([]);
              }}
              options={LINK_TYPES.map((type) => ({
                value: type.value,
                label: type.label,
              }))}
              placeholder={t('linkTypePlaceholder')}
              className="nvi-select-container"
              isClearable
            />
            <TypeaheadInput
              value={linkQuery}
              onChange={setLinkQuery}
              onSelect={addLink}
              options={linkOptions}
              placeholder={t('linkQueryPlaceholder')}
              className="rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
            />
            <button
              type="button"
              onClick={() => {
                const top = linkOptions[0];
                if (top) {
                  addLink(top);
                }
              }}
              disabled={!linkOptions.length || linkLoading}
              className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-60"
            >
              {linkLoading ? common('loading') : t('addLink')}
            </button>
          </div>
          {linkChips}
        </div>
        <button
          onClick={saveNote}
          disabled={!canWrite || isSaving}
          className="rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
          title={!canWrite ? noAccess('title') : undefined}
        >
          <span className="inline-flex items-center gap-2">
            {isSaving ? <Spinner size="xs" variant="orbit" /> : null}
            {isSaving
              ? editingId
                ? t('updating')
                : t('creating')
              : editingId
              ? t('updateNote')
              : t('createNote')}
          </span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={filters.search}
          onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          placeholder={common('search')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
        />
        <input
          value={filters.tag}
          onChange={(event) => setFilters({ ...filters, tag: event.target.value })}
          placeholder={t('tags')}
          className="rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
        />
        <SmartSelect
          value={filters.visibility}
          onChange={(value) => setFilters({ ...filters, visibility: value })}
          options={[{ value: '', label: common('all') }, ...visibilityOptions]}
          placeholder={t('visibility')}
          className="nvi-select-container"
        />
        <SmartSelect
          value={filters.branchId}
          onChange={(value) => setFilters({ ...filters, branchId: value })}
          options={[
            { value: '', label: common('all') },
            ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
          ]}
          placeholder={t('branch')}
          className="nvi-select-container"
        />
      </div>

      {viewMode === 'table' ? (
        <div className="command-card p-4 nvi-reveal">
          {!tableRows.length ? (
            <StatusBanner message={t('notesEmpty')} />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-xs uppercase text-gold-400">
                  <tr>
                    <th className="px-3 py-2">{t('noteTitle')}</th>
                    <th className="px-3 py-2">{t('visibility')}</th>
                    <th className="px-3 py-2">{t('branch')}</th>
                    <th className="px-3 py-2">{t('tags')}</th>
                    <th className="px-3 py-2">{t('links')}</th>
                    <th className="px-3 py-2">{common('status')}</th>
                    <th className="px-3 py-2">{actions('view')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.id} className="border-t border-gold-700/20">
                      <td className="px-3 py-2 font-semibold">{row.title}</td>
                      <td className="px-3 py-2">{row.visibility}</td>
                      <td className="px-3 py-2">{row.branch}</td>
                      <td className="px-3 py-2">{row.tags}</td>
                      <td className="px-3 py-2">{row.links}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            const note = notes.find((item) => item.id === row.id);
                            if (note) {
                              setViewMode('cards');
                              applyEdit(note);
                            }
                          }}
                          className="text-xs text-gold-300 hover:text-gold-100"
                        >
                          {actions('view')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {!notes.length ? (
            <StatusBanner message={t('notesEmpty')} />
          ) : (
            notes.map((note) => {
              const reminderForm =
                reminderForms[note.id] ?? {
                  scheduledAt: '',
                  channels: {
                    IN_APP: true,
                    EMAIL: false,
                    WHATSAPP: false,
                  },
                };
              const reminderList = reminderLists[note.id] ?? [];
              return (
                <div
                  key={note.id}
                  className="command-card p-4 space-y-3 nvi-reveal"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold text-gold-100">
                        {note.title}
                      </h4>
                      <p className="text-xs text-gold-400">{note.visibility}</p>
                      {note.branch?.name ? (
                        <p className="text-xs text-gold-400">{note.branch.name}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => applyEdit(note)}
                        className="text-xs text-gold-300 hover:text-gold-100"
                      >
                        {actions('view')}
                      </button>
                      <button
                        type="button"
                        onClick={() => archiveNote(note.id)}
                        disabled={!canManage && note.author?.id !== undefined && !canWrite}
                        className="text-xs text-gold-300 hover:text-gold-100 disabled:opacity-50"
                      >
                        {t('archiveNote')}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gold-200">{note.body}</p>
                  {note.tags.length ? (
                    <div className="flex flex-wrap gap-2 text-xs text-gold-400">
                      {note.tags.map((tag) => (
                        <span key={`${note.id}-${tag}`}>#{tag}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                      {t('links')}
                    </p>
                    {note.links.length ? (
                      <div className="flex flex-wrap gap-2 text-xs text-gold-200">
                        {note.links.map((link) => (
                          <span key={`${note.id}-${link.resourceId}`}>
                            {link.resourceName ?? `${link.resourceType} • ${link.resourceId}`}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gold-400">{t('noLinks')}</p>
                    )}
                  </div>
                  <div className="rounded border border-gold-700/40 bg-black/60 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.2em] text-gold-400">
                        {t('reminders')}
                      </p>
                      <button
                        type="button"
                        onClick={() => loadReminders(note.id)}
                        className="text-xs text-gold-300 hover:text-gold-100"
                      >
                        {actions('view')}
                      </button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3">
                      <DateTimePickerInput
                        value={reminderForm.scheduledAt}
                        onChange={(value) =>
                          updateReminderForm(note.id, { scheduledAt: value })
                        }
                        className="rounded border border-gold-700/50 bg-black px-3 py-2 text-xs text-gold-100"
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gold-200">
                        {(['IN_APP', 'EMAIL', 'WHATSAPP'] as const).map((channel) => (
                          <label
                            key={`${note.id}-${channel}`}
                            className="inline-flex items-center gap-1"
                          >
                            <input
                              type="checkbox"
                              checked={reminderForm.channels[channel]}
                              disabled={!allowedChannels.includes(channel)}
                              onChange={(event) =>
                                updateReminderForm(note.id, {
                                  channels: {
                                    ...reminderForm.channels,
                                    [channel]: event.target.checked,
                                  },
                                })
                              }
                            />
                            <span className={allowedChannels.includes(channel) ? '' : 'opacity-50'}>
                              {channel}
                            </span>
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => scheduleReminder(note.id)}
                        disabled={!canWrite || reminderForm.busy}
                        className="rounded border border-gold-700/50 px-3 py-2 text-xs text-gold-100 disabled:opacity-60"
                      >
                        {reminderForm.busy ? common('loading') : t('addReminder')}
                      </button>
                    </div>
                    {reminderList.length ? (
                      <div className="space-y-1 text-xs text-gold-300">
                        {reminderList.map((reminder) => (
                          <div key={reminder.id} className="flex items-center justify-between">
                            <span>
                              {reminder.channel} • {reminder.status} •{' '}
                              {new Date(reminder.scheduledAt).toLocaleString()}
                            </span>
                            {reminder.status === 'SCHEDULED' ? (
                              <button
                                type="button"
                                onClick={() => cancelReminder(note.id, reminder.id)}
                                className="text-xs text-gold-300 hover:text-gold-100"
                              >
                                {t('reminderCancel')}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gold-400">{t('reminderEmpty')}</p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {nextCursor ? (
        <button
          type="button"
          onClick={() => load(page + 1)}
          className="rounded border border-gold-700/50 px-4 py-2 text-sm text-gold-100"
        >
          {actions('loadMore')}
        </button>
      ) : null}
      {typeof total === 'number' ? (
        <p className="text-xs text-gold-400">
          {common('total')}: {total}
        </p>
      ) : null}
    </section>
  );
}
