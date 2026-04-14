'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useTranslations } from 'next-intl';
import {
  StickyNote,
  Pin,
  Lock,
  Building2,
  Globe,
  Link as LinkIcon,
  Bell,
  Bold,
  Italic,
  List,
  Heading3,
  Plus,
  X,
  Package,
  Layers,
  Truck,
  Users,
  ShoppingCart,
  ArrowLeftRight,
  FileText,
  Tag,
  Clock,
  Eye,
  Pencil,
  Archive,
  Share2,
  Bookmark,
  Search,
  Filter,
  LayoutTemplate,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useToastState, messageText } from '@/lib/app-notifications';
import { notify } from '@/components/notifications/NotificationProvider';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { DateTimePickerInput } from '@/components/DateTimePickerInput';
import { TypeaheadInput } from '@/components/TypeaheadInput';
import { Banner } from '@/components/notifications/Banner';
import { buildCursorQuery, normalizePaginated, PaginatedResponse } from '@/lib/pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { ViewToggle, ViewMode } from '@/components/ViewToggle';
import { getPermissionSet } from '@/lib/permissions';
import { useBranchScope } from '@/lib/use-branch-scope';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useFormatDate, useTimezone } from '@/lib/business-context';
import { localToUtcIso } from '@/lib/date-format';
import {
  Card,
  PageHeader,
  EmptyState,
  TextInput,
  CollapsibleSection,
  StatusBadge,
} from '@/components/ui';
import { NoteFormModal } from '@/components/notes/NoteFormModal';

/* ─── Rich Text Editor with icon toolbar ─── */

function RichTextEditor({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: placeholder ?? 'Write something...' }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  // Sync external value changes (e.g. template apply, edit load) into the editor
  const lastExternalValue = useRef(value);
  useEffect(() => {
    if (editor && value !== lastExternalValue.current) {
      lastExternalValue.current = value;
      if (editor.getHTML() !== value) {
        editor.commands.setContent(value, { emitUpdate: false });
      }
    }
  }, [editor, value]);

  // Keep the ref in sync with onChange-driven updates too
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      lastExternalValue.current = editor.getHTML();
    };
    editor.on('update', handler);
    return () => { editor.off('update', handler); };
  }, [editor]);

  return (
    <div className="rounded-xl border border-gold-700/40 bg-black/80 text-gold-100 overflow-hidden">
      {editor ? (
        <div className="flex items-center gap-0.5 border-b border-gold-700/30 px-2 py-1.5 bg-black/40">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`rounded-lg p-1.5 transition-colors ${editor.isActive('bold') ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-gold-500 hover:text-gold-200 hover:bg-white/[0.1]'}`}
            title="Bold"
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`rounded-lg p-1.5 transition-colors ${editor.isActive('italic') ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-gold-500 hover:text-gold-200 hover:bg-white/[0.1]'}`}
            title="Italic"
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`rounded-lg p-1.5 transition-colors ${editor.isActive('bulletList') ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-gold-500 hover:text-gold-200 hover:bg-white/[0.1]'}`}
            title="Bullet list"
          >
            <List size={15} />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`rounded-lg p-1.5 transition-colors ${editor.isActive('heading') ? 'bg-blue-500/10 text-blue-400' : 'bg-white/[0.06] text-gold-500 hover:text-gold-200 hover:bg-white/[0.1]'}`}
            title="Heading"
          >
            <Heading3 size={15} />
          </button>
        </div>
      ) : null}
      <EditorContent editor={editor} className="prose prose-invert prose-sm max-w-none p-3 min-h-[120px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px]" />
    </div>
  );
}

/* ─── Helpers ─── */

const VISIBILITY_ICON: Record<string, typeof Lock> = {
  PRIVATE: Lock,
  BRANCH: Building2,
  BUSINESS: Globe,
};

const LINK_TYPE_ICON: Record<string, typeof Package> = {
  Product: Package,
  Variant: Layers,
  Branch: Building2,
  Supplier: Truck,
  Customer: Users,
  PurchaseOrder: ShoppingCart,
  Purchase: FileText,
  Transfer: ArrowLeftRight,
};

function stripHtml(html: string): string {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent ?? '';
  }
  return html.replace(/<[^>]*>/g, '');
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

/* ─── Types ─── */

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
  isPinned?: boolean;
  tags: string[];
  branch?: { id: string; name: string } | null;
  author?: { id: string; name: string } | null;
  links: NoteLink[];
  createdAt?: string;
  updatedAt?: string;
};

type Branch = { id: string; name: string };

type NotesMeta = {
  tier?: 'STARTER' | 'BUSINESS' | 'ENTERPRISE' | null;
  allowedChannels: Array<'IN_APP' | 'EMAIL' | 'WHATSAPP'>;
};

type NoteShare = {
  userId: string;
  userName?: string | null;
};

type NoteTemplate = {
  id: string;
  name: string;
  title: string;
  body: string;
  visibility: 'PRIVATE' | 'BRANCH' | 'BUSINESS';
  tags: string[];
};

type BusinessUser = {
  id: string;
  name: string;
};

type LinkableRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  product?: { name?: string | null } | null;
  sourceBranch?: { name?: string | null } | null;
  destinationBranch?: { name?: string | null } | null;
};


export default function NotesPage() {
  const t = useTranslations('notesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const { formatDateTime } = useFormatDate();
  const timezone = useTimezone();
  const LINK_TYPES = [
    { value: 'Product', label: t('linkTypeProduct') },
    { value: 'Variant', label: t('linkTypeVariant') },
    { value: 'Branch', label: t('linkTypeBranch') },
    { value: 'Supplier', label: t('linkTypeSupplier') },
    { value: 'Customer', label: t('linkTypeCustomer') },
    { value: 'PurchaseOrder', label: t('linkTypePurchaseOrder') },
    { value: 'Purchase', label: t('linkTypePurchase') },
    { value: 'Transfer', label: t('linkTypeTransfer') },
  ];
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
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pageCursors, setPageCursors] = useState<Record<number, string | null>>({
    1: null,
  });
  const pageCursorsRef = useRef(pageCursors);
  pageCursorsRef.current = pageCursors;
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [filters, setFilters] = useState({
    search: '',
    tag: '',
    visibility: '',
    branchId: '',
  });

  const debouncedTag = useDebouncedValue(filters.tag, 350);
  const { activeBranch } = useBranchScope();
  const [branchFilterInitialized, setBranchFilterInitialized] = useState(false);
  const [form, setForm] = useState({
    title: '',
    body: '',
    visibility: 'BUSINESS' as Note['visibility'],
    branchId: '',
    tags: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bodyPreview, setBodyPreview] = useState(false);
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
  const [reminderOpen, setReminderOpen] = useState<Record<string, boolean>>({});

  // Sharing state
  const [shareOpen, setShareOpen] = useState<Record<string, boolean>>({});
  const [shareLists, setShareLists] = useState<Record<string, NoteShare[]>>({});
  const [shareUserId, setShareUserId] = useState<Record<string, string>>({});
  const [shareBusy, setShareBusy] = useState<Record<string, boolean>>({});
  const [allUsers, setAllUsers] = useState<BusinessUser[]>([]);

  // Template state
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');

  // Expanded note (card detail view)
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const allowedChannels = meta?.allowedChannels ?? ['IN_APP'];

  useEffect(() => {
    if (branchFilterInitialized) {
      return;
    }
    if (!activeBranch?.id) {
      return;
    }
    setBranchFilterInitialized(true);
    setFilters((prev) => (prev.branchId ? prev : { ...prev, branchId: activeBranch.id }));
  }, [activeBranch?.id, branchFilterInitialized]);

  const loadReferenceData = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const [branchData, metaData, userData, templateData] = await Promise.all([
        apiFetch<PaginatedResponse<Branch> | Branch[]>('/branches?limit=200', { token }),
        apiFetch<NotesMeta>('/notes/meta', { token }),
        apiFetch<PaginatedResponse<BusinessUser> | BusinessUser[]>('/users?limit=200', { token }),
        apiFetch<NoteTemplate[]>('/notes/templates', { token }).catch(() => [] as NoteTemplate[]),
      ]);
      setBranches(normalizePaginated(branchData).items);
      setMeta(metaData);
      setAllUsers(normalizePaginated(userData).items);
      setTemplates(templateData);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadFailed')),
      });
    }
  }, [setMessage, t]);

  const load = useCallback(async (targetPage = 1, nextPageSize?: number) => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsLoading(true);
    const effectivePageSize = nextPageSize ?? pageSize;
    const cursor = targetPage === 1 ? null : pageCursorsRef.current[targetPage] ?? null;
    const query = buildCursorQuery({
      limit: effectivePageSize,
      cursor: cursor ?? undefined,
      includeTotal: targetPage === 1 ? '1' : undefined,
      search: filters.search || undefined,
      tag: debouncedTag || undefined,
      visibility: filters.visibility || undefined,
      branchId: filters.branchId || undefined,
    });
    try {
      const noteData = await apiFetch<PaginatedResponse<Note> | Note[]>(
        `/notes${query}`,
        { token },
      );
      const notesResult = normalizePaginated(noteData);
      setNotes(notesResult.items);
      setNextCursor(notesResult.nextCursor);
      if (typeof notesResult.total === 'number') {
        setTotal(notesResult.total);
      }
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
  }, [pageSize, filters.search, debouncedTag, filters.visibility, filters.branchId, t]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    setPage(1);
    setPageCursors({ 1: null });
    setTotal(null);
    load(1);
  }, [load]);

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
    setNoteFormOpen(true);
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
      setNoteFormOpen(false);
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
    const ok = await notify.confirm({
      title: t('archiveNoteConfirmTitle'),
      message: t('archiveNoteConfirmMessage'),
      confirmText: t('archiveNoteConfirmButton'),
    });
    if (!ok) return;
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

  const [togglingPinId, setTogglingPinId] = useState<string | null>(null);

  const togglePin = async (note: Note) => {
    const token = getAccessToken();
    if (!token) return;
    setTogglingPinId(note.id);
    try {
      await apiFetch(`/notes/${note.id}`, {
        token,
        method: 'PUT',
        body: JSON.stringify({ isPinned: !note.isPinned }),
      });
      await load(1);
    } catch (err) {
      setMessage({
        action: 'update',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('pinFailed')),
      });
    } finally {
      setTogglingPinId(null);
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
          scheduledAt: localToUtcIso(formState.scheduledAt, timezone),
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
    const ok = await notify.confirm({
      title: t('cancelReminderConfirmTitle') || t('reminderCancelled'),
      message: t('cancelReminderConfirmMessage') || t('reminderCancelled'),
      confirmText: t('cancelReminderConfirmButton') || common('cancel'),
    });
    if (!ok) return;
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

  // --- Sharing functions ---
  const loadShares = async (noteId: string) => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<NoteShare[]>(`/notes/${noteId}/shares`, { token });
      setShareLists((prev) => ({ ...prev, [noteId]: data }));
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadSharesFailed')),
      });
    }
  };

  const shareNote = async (noteId: string) => {
    const token = getAccessToken();
    const userId = shareUserId[noteId];
    if (!token || !userId) return;
    setShareBusy((prev) => ({ ...prev, [noteId]: true }));
    try {
      await apiFetch(`/notes/${noteId}/shares`, {
        token,
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      setShareUserId((prev) => ({ ...prev, [noteId]: '' }));
      await loadShares(noteId);
      setMessage({ action: 'create', outcome: 'success', message: t('shareSuccess') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('shareFailed')),
      });
    } finally {
      setShareBusy((prev) => ({ ...prev, [noteId]: false }));
    }
  };

  const unshareNote = async (noteId: string, userId: string) => {
    const token = getAccessToken();
    if (!token) return;
    const ok = await notify.confirm({
      title: t('unshareConfirmTitle') || t('unshareSuccess'),
      message: t('unshareConfirmMessage') || t('unshareSuccess'),
      confirmText: t('unshareConfirmButton') || common('remove'),
    });
    if (!ok) return;
    setShareBusy((prev) => ({ ...prev, [noteId]: true }));
    try {
      await apiFetch(`/notes/${noteId}/shares/${userId}`, {
        token,
        method: 'DELETE',
      });
      await loadShares(noteId);
      setMessage({ action: 'delete', outcome: 'success', message: t('unshareSuccess') });
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('unshareFailed')),
      });
    } finally {
      setShareBusy((prev) => ({ ...prev, [noteId]: false }));
    }
  };

  // --- Template functions ---
  const loadTemplates = async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const data = await apiFetch<NoteTemplate[]>('/notes/templates', { token });
      setTemplates(data);
    } catch (err) {
      setMessage({
        action: 'load',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('loadTemplatesFailed')),
      });
    }
  };

  const saveAsTemplate = async () => {
    const token = getAccessToken();
    if (!token) return;
    if (!templateName.trim()) {
      setMessage({ action: 'create', outcome: 'failure', message: t('templateNameRequired') });
      return;
    }
    try {
      await apiFetch('/notes/templates', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: templateName.trim(),
          title: form.title,
          body: form.body,
          visibility: form.visibility,
          tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      });
      setTemplateName('');
      await loadTemplates();
      setMessage({ action: 'create', outcome: 'success', message: t('templateSaved') });
    } catch (err) {
      setMessage({
        action: 'create',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('saveTemplateFailed')),
      });
    }
  };

  const deleteTemplate = async (templateId: string) => {
    const token = getAccessToken();
    if (!token) return;
    const ok = await notify.confirm({
      title: t('deleteTemplateConfirmTitle') || t('deleteTemplate'),
      message: t('deleteTemplateConfirmMessage') || t('templateDeleted'),
      confirmText: t('deleteTemplateConfirmButton') || common('delete'),
    });
    if (!ok) return;
    try {
      await apiFetch(`/notes/templates/${templateId}`, {
        token,
        method: 'DELETE',
      });
      await loadTemplates();
      setMessage({ action: 'delete', outcome: 'success', message: t('templateDeleted') });
    } catch (err) {
      setMessage({
        action: 'delete',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('deleteTemplateFailed')),
      });
    }
  };

  const useTemplate = (tmpl: NoteTemplate) => {
    setForm({
      title: tmpl.title,
      body: tmpl.body,
      visibility: tmpl.visibility,
      branchId: '',
      tags: (tmpl.tags ?? []).join(', '),
    });
    setEditingId(null);
    setNoteFormOpen(true);
  };

  const visibilityOptions = [
    { value: 'PRIVATE', label: t('visibilityPrivate') },
    { value: 'BRANCH', label: t('visibilityBranch') },
    { value: 'BUSINESS', label: t('visibilityBusiness') },
  ];

  const visibilityLabels = useMemo<Record<string, string>>(
    () => ({
      PRIVATE: t('visibilityPrivate'),
      BRANCH: t('visibilityBranch'),
      BUSINESS: t('visibilityBusiness'),
    }),
    [t],
  );

  const renderMarkdown = (text: string): string => {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const lines = escaped.split('\n');
    const result: string[] = [];
    let inList = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#{1,3}\s/.test(trimmed)) {
        if (inList) { result.push('</ul>'); inList = false; }
        const level = trimmed.match(/^(#{1,3})/)?.[1].length ?? 1;
        const content = trimmed.replace(/^#{1,3}\s+/, '');
        const tag = `h${level + 1}` as 'h2' | 'h3' | 'h4';
        result.push(`<${tag} class="font-semibold text-gold-100">${content}</${tag}>`);
      } else if (/^[-*]\s/.test(trimmed)) {
        if (!inList) { result.push('<ul class="list-disc pl-4">'); inList = true; }
        result.push(`<li>${trimmed.replace(/^[-*]\s+/, '')}</li>`);
      } else {
        if (inList) { result.push('</ul>'); inList = false; }
        result.push(trimmed === '' ? '<br/>' : `<p>${trimmed}</p>`);
      }
    }
    if (inList) result.push('</ul>');
    let html = result.join('\n');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    return html;
  };

  const tableRows = useMemo(() => {
    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      visibility: note.visibility,
      isPinned: note.isPinned ?? false,
      branch: note.branch?.name ?? '\u2014',
      tags: note.tags ?? [],
      links: note.links?.length ?? 0,
      reminders: reminderLists[note.id]?.length ?? 0,
      status: note.status,
    }));
  }, [notes, reminderLists]);

  const activeNotes = useMemo(
    () => notes.filter((note) => note.status === 'ACTIVE').length,
    [notes],
  );
  const linkedNotes = useMemo(
    () => notes.filter((note) => note.links.length > 0).length,
    [notes],
  );
  const pinnedNotes = useMemo(
    () => notes.filter((note) => note.isPinned).length,
    [notes],
  );

  // Sort: pinned first
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  }, [notes]);

  /* ─── Link chips for the form ─── */
  const linkChips = links.length ? (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => {
        const LinkTypeIcon = LINK_TYPE_ICON[link.resourceType] ?? FileText;
        const formLinkColorMap: Record<string, string> = {
          Product: 'border-blue-500/30 bg-blue-500/8 text-blue-300 hover:border-blue-500/50',
          Variant: 'border-cyan-500/30 bg-cyan-500/8 text-cyan-300 hover:border-cyan-500/50',
          Customer: 'border-purple-500/30 bg-purple-500/8 text-purple-300 hover:border-purple-500/50',
          Supplier: 'border-amber-500/30 bg-amber-500/8 text-amber-300 hover:border-amber-500/50',
          Branch: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300 hover:border-emerald-500/50',
          PurchaseOrder: 'border-orange-500/30 bg-orange-500/8 text-orange-300 hover:border-orange-500/50',
          Purchase: 'border-pink-500/30 bg-pink-500/8 text-pink-300 hover:border-pink-500/50',
          Transfer: 'border-indigo-500/30 bg-indigo-500/8 text-indigo-300 hover:border-indigo-500/50',
        };
        const chipColor = formLinkColorMap[link.resourceType] ?? 'border-gold-700/40 bg-gold-500/5 text-gold-200 hover:border-gold-500/40';
        return (
          <button
            key={`${link.resourceType}-${link.resourceId}`}
            type="button"
            onClick={() => removeLink(link.resourceType, link.resourceId)}
            className={`nvi-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors group ${chipColor}`}
          >
            <LinkTypeIcon size={12} />
            <span>{link.resourceName ?? `${link.resourceType} \u2022 ${common('unknown')}`}</span>
            <X size={12} className="opacity-40 group-hover:text-red-400 group-hover:opacity-100 transition-colors" />
          </button>
        );
      })}
    </div>
  ) : (
    <p className="text-xs text-gold-500/60">{t('noLinks')}</p>
  );

  if (isLoading) {
    return <PageSkeleton title={t('title')} />;
  }

  return (
    <section className="space-y-5">
      {/* ─── Hero ─── */}
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge inline-flex items-center gap-1.5">
              <StickyNote size={12} />
              {t('badgeLiveNotes')}
            </span>
            <span className="nvi-badge inline-flex items-center gap-1.5">
              <Bell size={12} />
              {t('badgeReminderReady')}
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-3">
            <ViewToggle
              value={viewMode}
              onChange={setViewMode}
              labels={{ cards: actions('viewCards'), table: actions('viewTable') }}
            />
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setNoteFormOpen(true);
                }}
                className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black"
              >
                <Plus size={16} />
                {t('newNote')}
              </button>
            )}
          </div>
        }
      />

      {/* ─── KPI strip ─── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 nvi-stagger">
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--blue">
              <StickyNote size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiTotalNotes')}</p>
              <p className="text-2xl font-bold text-blue-400">{total ?? notes.length}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--amber">
              <Pin size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiPinned')}</p>
              <p className="text-2xl font-bold text-amber-400">{pinnedNotes}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--purple">
              <Bell size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiActive')}</p>
              <p className="text-2xl font-bold text-purple-400">{activeNotes}</p>
            </div>
          </div>
        </Card>
        <Card padding="md">
          <div className="flex items-center gap-3">
            <div className="nvi-kpi-icon nvi-kpi-icon--emerald">
              <Share2 size={20} />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiWithLinks')}</p>
              <p className="text-2xl font-bold text-emerald-400">{linkedNotes}</p>
            </div>
          </div>
        </Card>
      </div>

      {message ? <Banner message={messageText(message)} /> : null}

      {/* ─── Filters ─── */}
      <Card padding="md">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-gold-500" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-500">{t('filtersLabel')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-500/50" />
            <input
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              placeholder={common('search')}
              className="rounded-xl border border-gold-700/40 bg-black pl-9 pr-3 py-2 text-sm text-gold-100 placeholder:text-gold-700/60 outline-none focus:border-gold-500/50 transition-colors"
            />
          </div>
          <div className="relative">
            <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-500/50" />
            <input
              value={filters.tag}
              onChange={(event) => setFilters({ ...filters, tag: event.target.value })}
              placeholder={t('tags')}
              className="rounded-xl border border-gold-700/40 bg-black pl-9 pr-3 py-2 text-sm text-gold-100 placeholder:text-gold-700/60 outline-none focus:border-gold-500/50 transition-colors"
            />
          </div>
          <SmartSelect
            instanceId="notes-filter-visibility"
            value={filters.visibility}
            onChange={(value) => setFilters({ ...filters, visibility: value })}
            options={[{ value: '', label: common('all') }, ...visibilityOptions]}
            placeholder={t('visibility')}
            className="nvi-select-container"
          />
          <SmartSelect
            instanceId="notes-filter-branch"
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
      </Card>

      {/* ─── Note editor modal ─── */}
      <NoteFormModal
        open={noteFormOpen || !!editingId}
        onClose={() => {
          setNoteFormOpen(false);
          if (editingId) resetForm();
        }}
        editingId={editingId}
        form={form}
        onFormChange={setForm}
        visibilityOptions={visibilityOptions}
        branches={branches}
        bodyPreview={bodyPreview}
        onBodyPreviewChange={setBodyPreview}
        bodyEditor={
          <RichTextEditor
            value={form.body}
            onChange={(html) => setForm((prev) => ({ ...prev, body: html }))}
            placeholder={t('noteBody')}
          />
        }
        links={links}
        onRemoveLink={removeLink}
        linkType={linkType}
        onLinkTypeChange={(value) => {
          setLinkType(value);
          setLinkQuery('');
          setLinkOptions([]);
        }}
        linkQuery={linkQuery}
        onLinkQueryChange={setLinkQuery}
        linkOptions={linkOptions}
        linkLoading={linkLoading}
        onAddLink={addLink}
        linkTypes={LINK_TYPES}
        templateName={templateName}
        onTemplateNameChange={setTemplateName}
        onSaveAsTemplate={saveAsTemplate}
        onReset={resetForm}
        onSubmit={saveNote}
        isSaving={isSaving}
        canWrite={canWrite}
      />

      {/* ─── Templates ─── */}
      {templates.length > 0 && (
        <CollapsibleSection title={t('templates')} storageKey="notes-templates">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 nvi-stagger">
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                className="nvi-card-hover group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-2 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/10">
                      <LayoutTemplate size={14} className="text-purple-400" />
                    </div>
                    <p className="font-semibold text-gold-100 text-sm">{tmpl.name}</p>
                  </div>
                  <StatusBadge status={tmpl.visibility} size="xs" />
                </div>
                <p className="text-xs text-gold-400 line-clamp-1">{tmpl.title}</p>
                {tmpl.tags?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {tmpl.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-gold-500/10 px-2 py-0.5 text-[10px] text-gold-400">{tag}</span>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => useTemplate(tmpl)}
                    className="nvi-press inline-flex items-center gap-1 rounded-lg bg-gold-500/10 px-3 py-1 text-xs text-gold-200 hover:bg-gold-500/20 transition-colors"
                  >
                    <FileText size={11} />
                    {t('useTemplate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTemplate(tmpl.id)}
                    className="nvi-press inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={11} />
                    {t('deleteTemplate')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ─── Table view ─── */}
      {viewMode === 'table' ? (
        <Card padding="md">
          {!tableRows.length ? (
            <EmptyState
              icon={<StickyNote size={36} className="text-gold-500/30" />}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
              action={canWrite ? (
                <button
                  type="button"
                  onClick={() => { resetForm(); setNoteFormOpen(true); }}
                  className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black"
                >
                  <Plus size={14} />
                  {t('newNote')}
                </button>
              ) : undefined}
            />
          ) : (
            <div className="overflow-auto">
              <table className="min-w-[720px] w-full text-left text-sm text-gold-100">
                <thead className="text-[10px] uppercase tracking-[0.15em] text-gold-500">
                  <tr>
                    <th className="px-3 py-2.5 w-10">{t('pinLabel')}</th>
                    <th className="px-3 py-2.5">{t('noteTitle')}</th>
                    <th className="px-3 py-2.5">{t('visibility')}</th>
                    <th className="px-3 py-2.5">{t('branch')}</th>
                    <th className="px-3 py-2.5">{t('tags')}</th>
                    <th className="px-3 py-2.5">{t('links')}</th>
                    <th className="px-3 py-2.5">{t('reminders')}</th>
                    <th className="px-3 py-2.5">{common('status')}</th>
                    <th className="px-3 py-2.5">{actions('view')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.id} className={`border-t border-gold-700/15 transition-colors hover:bg-gold-500/[0.03] ${row.isPinned ? 'bg-gold-500/[0.04]' : ''}`}>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const note = notes.find((n) => n.id === row.id);
                            if (note) togglePin(note);
                          }}
                          disabled={togglingPinId === row.id}
                          className={`nvi-press p-1 rounded-lg transition-colors disabled:opacity-50 ${row.isPinned ? 'text-amber-400' : 'text-gold-700/50 hover:text-gold-400'}`}
                          title={row.isPinned ? t('unpin') : t('pin')}
                        >
                          <Pin size={14} className={row.isPinned ? 'fill-current' : ''} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-semibold">{row.title}</td>
                      <td className="px-3 py-2.5">
                        {(() => {
                          const VisIcon = VISIBILITY_ICON[row.visibility] ?? Globe;
                          return (
                            <span className="inline-flex items-center gap-1 text-xs text-gold-400">
                              <VisIcon size={12} />
                              {visibilityLabels[row.visibility]}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5 text-gold-400 text-xs">{row.branch}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.tags.length ? row.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-gold-500/10 px-2 py-0.5 text-[10px] text-gold-400">{tag}</span>
                          )) : <span className="text-gold-700/50">\u2014</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {row.links > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                            <LinkIcon size={12} />
                            {row.links}
                          </span>
                        ) : (
                          <span className="text-gold-700/50">\u2014</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {row.reminders > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                            <Bell size={12} />
                            {row.reminders}
                          </span>
                        ) : (
                          <span className="text-gold-700/50">\u2014</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5"><StatusBadge status={row.status} size="xs" /></td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            const note = notes.find((item) => item.id === row.id);
                            if (note) {
                              setViewMode('cards');
                              applyEdit(note);
                            }
                          }}
                          className="nvi-press inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gold-400 hover:text-gold-100 hover:bg-gold-500/10 transition-colors"
                        >
                          <Pencil size={12} />
                          {actions('edit')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        /* ─── Card view ─── */
        <>
          {!sortedNotes.length ? (
            <Card padding="lg">
              <EmptyState
                icon={<StickyNote size={48} className="text-gold-500/25 nvi-float" />}
                title={t('emptyTitle')}
                description={t('emptyDescription')}
                action={canWrite ? (
                  <button
                    type="button"
                    onClick={() => { resetForm(); setNoteFormOpen(true); }}
                    className="nvi-cta nvi-press inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-black"
                  >
                    <Plus size={14} />
                    {t('newNote')}
                  </button>
                ) : undefined}
              />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 nvi-stagger">
              {sortedNotes.map((note) => {
                const isExpanded = expandedNoteId === note.id;
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
                const VisIcon = VISIBILITY_ICON[note.visibility] ?? Globe;
                const bodyText = stripHtml(note.body);
                const hasReminders = reminderList.length > 0 || (reminderLists[note.id]?.length ?? 0) > 0;

                return (
                  <article
                    key={note.id}
                    className={`nvi-card nvi-card--glow nvi-card-hover nvi-reveal group relative flex flex-col overflow-hidden transition-all ${
                      note.isPinned ? 'ring-1 ring-amber-500/30 bg-amber-500/[0.02]' : ''
                    } ${isExpanded ? 'sm:col-span-2 lg:col-span-3' : ''}`}
                  >
                    {/* Pin indicator */}
                    <div className="absolute top-3 right-3 z-10">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); togglePin(note); }}
                        disabled={togglingPinId === note.id}
                        className={`nvi-press rounded-lg p-1.5 transition-all disabled:opacity-50 ${
                          note.isPinned
                            ? 'text-amber-400 bg-amber-500/10'
                            : 'text-gold-700/40 opacity-0 group-hover:opacity-100 hover:text-gold-300 hover:bg-gold-500/10'
                        }`}
                        title={note.isPinned ? t('unpin') : t('pin')}
                      >
                        <Pin size={14} className={note.isPinned ? 'fill-current' : ''} />
                      </button>
                    </div>

                    {/* Card body */}
                    <button
                      type="button"
                      onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                      className="flex-1 p-4 pb-2 text-left"
                    >
                      {/* Title + visibility */}
                      <div className="flex items-start gap-2 pr-8">
                        <h3 className="text-base font-bold text-gold-100 leading-snug line-clamp-2">
                          {note.title}
                        </h3>
                        <span className={`mt-0.5 shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${
                          note.visibility === 'PRIVATE' ? 'bg-red-500/10 text-red-400' :
                          note.visibility === 'BRANCH' ? 'bg-blue-500/10 text-blue-400' :
                          'bg-emerald-500/10 text-emerald-400'
                        }`} title={visibilityLabels[note.visibility]}>
                          <VisIcon size={10} />
                          {visibilityLabels[note.visibility]}
                        </span>
                      </div>

                      {/* Body preview */}
                      <p className={`mt-2 text-xs text-gold-400/70 leading-relaxed ${isExpanded ? '' : 'line-clamp-3'}`}>
                        {bodyText}
                      </p>

                      {/* Tags */}
                      {note.tags.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {note.tags.map((tag, idx) => {
                            const tagColors = [
                              'bg-blue-500/10 text-blue-400',
                              'bg-purple-500/10 text-purple-400',
                              'bg-emerald-500/10 text-emerald-400',
                              'bg-amber-500/10 text-amber-400',
                              'bg-cyan-500/10 text-cyan-400',
                              'bg-pink-500/10 text-pink-400',
                            ];
                            return (
                              <span key={`${note.id}-${tag}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${tagColors[idx % tagColors.length]}`}>
                                <Tag size={9} />
                                {tag}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Indicators row */}
                      <div className="mt-3 flex items-center gap-3 text-[10px] text-gold-500/60">
                        {note.links.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-blue-400">
                            <LinkIcon size={10} />
                            {note.links.length}
                          </span>
                        )}
                        {hasReminders && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-purple-400">
                            <Bell size={10} />
                            {reminderList.length || ''}
                          </span>
                        )}
                        {shareLists[note.id]?.length ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                            <Share2 size={10} />
                            {t('shared')}
                          </span>
                        ) : null}
                        <span className="ml-auto inline-flex items-center gap-1">
                          {note.author?.name && (
                            <span className="text-gold-500/50">{note.author.name}</span>
                          )}
                          {note.createdAt && (
                            <>
                              <span className="text-gold-700/40">&middot;</span>
                              <Clock size={9} />
                              <span>{relativeTime(note.createdAt)}</span>
                            </>
                          )}
                        </span>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-gold-700/20 p-4 space-y-4 nvi-reveal">
                        {/* Full body */}
                        <div className="prose prose-invert prose-sm max-w-none text-gold-200" dangerouslySetInnerHTML={{ __html: note.body }} />

                        {/* Status + branch */}
                        <div className="flex items-center gap-2">
                          <StatusBadge status={note.status} size="xs" />
                          {note.branch?.name && (
                            <span className="inline-flex items-center gap-1 text-xs text-gold-400">
                              <Building2 size={12} />
                              {note.branch.name}
                            </span>
                          )}
                        </div>

                        {/* Links */}
                        {note.links.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-gold-500">
                              <LinkIcon size={11} />
                              {t('links')} ({note.links.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {note.links.map((link) => {
                                const LinkTypeIcon = LINK_TYPE_ICON[link.resourceType] ?? FileText;
                                const linkColorMap: Record<string, string> = {
                                  Product: 'border-blue-500/30 bg-blue-500/8 text-blue-300',
                                  Variant: 'border-cyan-500/30 bg-cyan-500/8 text-cyan-300',
                                  Customer: 'border-purple-500/30 bg-purple-500/8 text-purple-300',
                                  Supplier: 'border-amber-500/30 bg-amber-500/8 text-amber-300',
                                  Branch: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300',
                                  PurchaseOrder: 'border-orange-500/30 bg-orange-500/8 text-orange-300',
                                  Purchase: 'border-pink-500/30 bg-pink-500/8 text-pink-300',
                                  Transfer: 'border-indigo-500/30 bg-indigo-500/8 text-indigo-300',
                                };
                                const linkColor = linkColorMap[link.resourceType] ?? 'border-gold-700/30 bg-gold-500/5 text-gold-300';
                                return (
                                  <span key={`${note.id}-${link.resourceId}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] ${linkColor}`}>
                                    <LinkTypeIcon size={11} />
                                    {link.resourceName ?? link.resourceType}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Reminders */}
                        <div className="rounded-xl border border-gold-700/30 border-l-2 border-l-purple-400 bg-black/40 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-gold-500">
                              <Bell size={11} />
                              {t('reminders')}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => loadReminders(note.id)}
                                className="nvi-press rounded-lg px-2 py-0.5 text-[10px] text-gold-400 hover:text-gold-200 hover:bg-gold-500/10 transition-colors"
                              >
                                {actions('view')}
                              </button>
                              {canWrite && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReminderOpen((prev) => ({ ...prev, [note.id]: !prev[note.id] }))
                                  }
                                  className="nvi-press inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] text-gold-400 hover:text-gold-200 hover:bg-gold-500/10 transition-colors"
                                >
                                  {reminderOpen[note.id] ? <X size={10} /> : <Plus size={10} />}
                                  {reminderOpen[note.id] ? '' : t('addReminder')}
                                </button>
                              )}
                            </div>
                          </div>
                          {reminderOpen[note.id] && (
                            <div className="grid gap-2 md:grid-cols-3">
                              <DateTimePickerInput
                                value={reminderForm.scheduledAt}
                                onChange={(value) =>
                                  updateReminderForm(note.id, { scheduledAt: value })
                                }
                                className="rounded-xl border border-gold-700/40 bg-black px-3 py-2 text-xs text-gold-100 outline-none focus:border-gold-500/50 transition-colors"
                              />
                              <div className="flex flex-wrap items-center gap-2 text-xs text-gold-200">
                                {(['IN_APP', 'EMAIL', 'WHATSAPP'] as const).map((channel) => {
                                  const channelColors: Record<string, { on: string; off: string }> = {
                                    IN_APP: { on: 'border-blue-500/40 bg-blue-500/10 text-blue-300', off: 'border-gold-700/30 text-blue-400/50' },
                                    EMAIL: { on: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', off: 'border-gold-700/30 text-emerald-400/50' },
                                    WHATSAPP: { on: 'border-green-500/40 bg-green-500/10 text-green-300', off: 'border-gold-700/30 text-green-400/50' },
                                  };
                                  const cc = channelColors[channel];
                                  return (
                                  <label
                                    key={`${note.id}-${channel}`}
                                    className={`nvi-press inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] cursor-pointer transition-colors ${
                                      reminderForm.channels[channel]
                                        ? cc.on
                                        : cc.off
                                    } ${!allowedChannels.includes(channel) ? 'opacity-40 cursor-not-allowed' : ''}`}
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
                                      className="sr-only"
                                    />
                                    {channel}
                                  </label>
                                  );
                                })}
                              </div>
                              <button
                                type="button"
                                onClick={() => scheduleReminder(note.id)}
                                disabled={!canWrite || reminderForm.busy}
                                className="nvi-press inline-flex items-center justify-center gap-1.5 rounded-xl border border-gold-700/40 px-3 py-2 text-xs text-gold-200 hover:text-gold-100 disabled:opacity-50 transition-colors"
                              >
                                <Bell size={12} />
                                {reminderForm.busy ? common('loading') : t('addReminder')}
                              </button>
                            </div>
                          )}
                          {reminderList.length > 0 ? (
                            <div className="space-y-1 text-xs text-gold-400">
                              {reminderList.map((reminder) => (
                                <div key={reminder.id} className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                                      reminder.status === 'SCHEDULED' ? 'bg-amber-500/10 text-amber-400' :
                                      reminder.status === 'SENT' ? 'bg-emerald-500/10 text-emerald-400' :
                                      reminder.status === 'FAILED' ? 'bg-red-500/10 text-red-400' :
                                      'bg-gold-500/10 text-gold-400'
                                    }`}>
                                      {reminder.status}
                                    </span>
                                    <span className={`rounded-full px-2 py-0.5 text-[9px] ${
                                      reminder.channel === 'IN_APP' ? 'bg-blue-500/10 text-blue-400' :
                                      reminder.channel === 'EMAIL' ? 'bg-emerald-500/10 text-emerald-400' :
                                      'bg-green-500/10 text-green-400'
                                    }`}>
                                      {reminder.channel}
                                    </span>
                                    <span className="text-gold-500/60">
                                      {formatDateTime(reminder.scheduledAt)}
                                    </span>
                                  </div>
                                  {reminder.status === 'SCHEDULED' && (
                                    <button
                                      type="button"
                                      onClick={() => cancelReminder(note.id, reminder.id)}
                                      className="nvi-press rounded-lg px-2 py-0.5 text-[10px] text-red-400/70 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                    >
                                      {t('reminderCancel')}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[10px] text-gold-500/50">{t('reminderEmpty')}</p>
                          )}
                        </div>

                        {/* Sharing */}
                        <div className="rounded-xl border border-gold-700/30 bg-black/40 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-gold-500">
                              <Share2 size={11} />
                              {t('sharedWith')}
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const isOpen = shareOpen[note.id];
                                setShareOpen((prev) => ({ ...prev, [note.id]: !isOpen }));
                                if (!isOpen && !shareLists[note.id]) {
                                  loadShares(note.id);
                                }
                              }}
                              className="nvi-press rounded-lg px-2 py-0.5 text-[10px] text-gold-400 hover:text-gold-200 hover:bg-gold-500/10 transition-colors"
                            >
                              {shareOpen[note.id] ? t('shared') : t('share')}
                            </button>
                          </div>
                          {shareOpen[note.id] && (
                            <>
                              {canWrite && (
                                <div className="flex items-center gap-2">
                                  <SmartSelect
                                    instanceId={`notes-share-user-${note.id}`}
                                    value={shareUserId[note.id] ?? ''}
                                    onChange={(value) =>
                                      setShareUserId((prev) => ({ ...prev, [note.id]: value }))
                                    }
                                    options={allUsers.map((user) => ({ value: user.id, label: user.name }))}
                                    placeholder={t('selectUser')}
                                    className="nvi-select-container min-w-[180px]"
                                    isClearable
                                  />
                                  <button
                                    type="button"
                                    onClick={() => shareNote(note.id)}
                                    disabled={!shareUserId[note.id] || shareBusy[note.id]}
                                    className="nvi-press inline-flex items-center gap-1 rounded-xl border border-gold-700/40 px-3 py-2 text-xs text-gold-200 hover:text-gold-100 disabled:opacity-50 transition-colors"
                                  >
                                    <Share2 size={12} />
                                    {shareBusy[note.id] ? common('loading') : t('share')}
                                  </button>
                                </div>
                              )}
                              {(shareLists[note.id] ?? []).length > 0 ? (
                                <div className="space-y-1 text-xs text-gold-400">
                                  {(shareLists[note.id] ?? []).map((share) => (
                                    <div key={share.userId} className="flex items-center justify-between rounded-lg bg-black/30 px-2.5 py-1.5">
                                      <span className="inline-flex items-center gap-1.5">
                                        <Users size={11} className="text-gold-500/50" />
                                        {share.userName ?? common('unknown')}
                                      </span>
                                      {canWrite && (
                                        <button
                                          type="button"
                                          onClick={() => unshareNote(note.id, share.userId)}
                                          disabled={shareBusy[note.id]}
                                          className="nvi-press rounded-lg px-2 py-0.5 text-[10px] text-red-400/70 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                                        >
                                          {t('unshare')}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-gold-500/50">{t('noShares')}</p>
                              )}
                            </>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => applyEdit(note)}
                            className="nvi-press inline-flex items-center gap-1.5 rounded-xl bg-gold-500/10 px-3 py-1.5 text-xs text-gold-200 hover:bg-gold-500/20 transition-colors"
                          >
                            <Pencil size={12} />
                            {actions('edit')}
                          </button>
                          <button
                            type="button"
                            onClick={() => archiveNote(note.id)}
                            disabled={!canManage && note.author?.id !== undefined && !canWrite}
                            className="nvi-press inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs text-gold-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                          >
                            <Archive size={12} />
                            {t('archiveNote')}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        itemCount={notes.length}
        availablePages={Object.keys(pageCursors).map(Number)}
        hasNext={!!nextCursor}
        hasPrev={page > 1}
        isLoading={isLoading}
        onPageChange={(p) => load(p)}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
          setPageCursors({ 1: null });
          setTotal(null);
          load(1, size);
        }}
      />
    </section>
  );
}
