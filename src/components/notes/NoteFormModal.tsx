'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowLeftRight,
  Bookmark,
  Building2,
  Eye,
  FileText,
  Globe,
  Layers,
  Lock,
  Package,
  Pencil,
  Plus,
  Send,
  ShoppingCart,
  Tag,
  Truck,
  Users,
  X,
  Link as LinkIcon,
} from 'lucide-react';
import { ModalSurface } from '@/components/notifications/ModalSurface';
import { Icon, TextInput } from '@/components/ui';
import { SmartSelect } from '@/components/SmartSelect';
import { Spinner } from '@/components/Spinner';
import { TypeaheadInput } from '@/components/TypeaheadInput';

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

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

type Visibility = 'PRIVATE' | 'BRANCH' | 'BUSINESS';
type Branch = { id: string; name: string };
type NoteLink = { id?: string; resourceType: string; resourceId: string; resourceName?: string | null };
type FormState = {
  title: string;
  body: string;
  visibility: Visibility;
  branchId: string;
  tags: string;
};
type LinkOption = { id: string; label: string };
type LinkTypeOption = { value: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;

  editingId: string | null;

  form: FormState;
  onFormChange: (next: FormState) => void;

  visibilityOptions: { value: string; label: string }[];
  branches: Branch[];

  bodyPreview: boolean;
  onBodyPreviewChange: (value: boolean) => void;
  bodyEditor: ReactNode;

  links: NoteLink[];
  onRemoveLink: (resourceType: string, resourceId: string) => void;

  linkType: string;
  onLinkTypeChange: (value: string) => void;
  linkQuery: string;
  onLinkQueryChange: (value: string) => void;
  linkOptions: LinkOption[];
  linkLoading: boolean;
  onAddLink: (option: LinkOption) => void;
  linkTypes: LinkTypeOption[];

  templateName: string;
  onTemplateNameChange: (value: string) => void;
  onSaveAsTemplate: () => void;

  onReset: () => void;
  onSubmit: () => void;
  isSaving: boolean;
  canWrite: boolean;
};

export function NoteFormModal({
  open,
  onClose,
  editingId,
  form,
  onFormChange,
  visibilityOptions,
  branches,
  bodyPreview,
  onBodyPreviewChange,
  bodyEditor,
  links,
  onRemoveLink,
  linkType,
  onLinkTypeChange,
  linkQuery,
  onLinkQueryChange,
  linkOptions,
  linkLoading,
  onAddLink,
  linkTypes,
  templateName,
  onTemplateNameChange,
  onSaveAsTemplate,
  onReset,
  onSubmit,
  isSaving,
  canWrite,
}: Props) {
  const t = useTranslations('notesPage');
  const actions = useTranslations('actions');
  const common = useTranslations('common');
  const noAccess = useTranslations('noAccess');

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
        const chipColor =
          formLinkColorMap[link.resourceType] ??
          'border-gold-700/40 bg-gold-500/5 text-gold-200 hover:border-gold-500/40';
        return (
          <button
            key={`${link.resourceType}-${link.resourceId}`}
            type="button"
            onClick={() => onRemoveLink(link.resourceType, link.resourceId)}
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

  return (
    <ModalSurface
      open={open}
      onClose={onClose}
      labelledBy="note-form-title"
      panelClassName="nvi-modal-panel--wide"
    >
      <div className="nvi-modal-panel__header">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="StickyNote" size={18} className="text-[color:var(--muted)]" />
            <h2
              id="note-form-title"
              className="text-lg font-semibold text-[color:var(--foreground)]"
            >
              {editingId ? t('editNote') : t('createNote')}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {editingId ? (
              <button
                type="button"
                onClick={onReset}
                className="nvi-press inline-flex items-center gap-1 rounded-lg border border-gold-700/40 px-2.5 py-1 text-xs text-gold-300 hover:text-gold-100 transition-colors"
              >
                <X size={12} />
                {actions('clear')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="nvi-press rounded-xl border border-[color:var(--border)] px-2.5 py-1.5 text-[color:var(--muted)]"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="nvi-modal-panel__body space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <TextInput
            label={t('noteTitle')}
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
            placeholder={t('noteTitle')}
          />
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
              {t('visibility')}
            </label>
            <div className="flex gap-2">
              {visibilityOptions.map((opt) => {
                const VisIcon = VISIBILITY_ICON[opt.value] ?? Globe;
                const isActive = form.visibility === opt.value;
                const colorMap: Record<string, { active: string; idle: string }> = {
                  PRIVATE: {
                    active: 'border-red-500/50 bg-red-500/15 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.08)]',
                    idle: 'border-gold-700/30 text-red-400/60 hover:border-red-500/30 hover:text-red-300',
                  },
                  BRANCH: {
                    active: 'border-blue-500/50 bg-blue-500/15 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.08)]',
                    idle: 'border-gold-700/30 text-blue-400/60 hover:border-blue-500/30 hover:text-blue-300',
                  },
                  BUSINESS: {
                    active: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.08)]',
                    idle: 'border-gold-700/30 text-emerald-400/60 hover:border-emerald-500/30 hover:text-emerald-300',
                  },
                };
                const colors = colorMap[opt.value] ?? colorMap.BUSINESS;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onFormChange({ ...form, visibility: opt.value as Visibility })}
                    className={`nvi-press inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all ${
                      isActive ? colors.active : colors.idle
                    }`}
                  >
                    <VisIcon size={14} />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-gold-300/80">
                {t('noteBody')}
              </label>
              <button
                type="button"
                onClick={() => onBodyPreviewChange(!bodyPreview)}
                className="nvi-press inline-flex items-center gap-1 rounded-lg border border-gold-700/40 px-2 py-0.5 text-[10px] text-gold-400 hover:text-gold-200 transition-colors"
              >
                {bodyPreview ? <Pencil size={10} /> : <Eye size={10} />}
                {bodyPreview ? t('previewOff') : t('previewOn')}
              </button>
            </div>
            {bodyPreview ? (
              <div
                className="rounded-xl border border-gold-700/40 bg-black/80 px-4 py-3 text-sm text-gold-200 min-h-[6rem] prose-sm"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body) }}
              />
            ) : (
              bodyEditor
            )}
          </div>
          <SmartSelect
            instanceId="notes-form-branch"
            value={form.branchId}
            onChange={(value) => onFormChange({ ...form, branchId: value })}
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            placeholder={t('branch')}
            isClearable
            className="nvi-select-container"
            isDisabled={form.visibility !== 'BRANCH'}
          />
          <div className="relative">
            <Tag size={14} className="absolute left-3 top-[2.1rem] text-gold-500/50" />
            <TextInput
              label={t('tags')}
              value={form.tags}
              onChange={(event) => onFormChange({ ...form, tags: event.target.value })}
              placeholder={t('tagsHint')}
              className="pl-9"
            />
          </div>
        </div>

        {/* Links section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <LinkIcon size={14} className="text-gold-500" />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
              {t('links')}
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <SmartSelect
              instanceId="notes-form-link-type"
              value={linkType}
              onChange={(value) => onLinkTypeChange(value)}
              options={linkTypes.map((type) => ({
                value: type.value,
                label: type.label,
              }))}
              placeholder={t('linkTypePlaceholder')}
              className="nvi-select-container"
              isClearable
            />
            <TypeaheadInput
              value={linkQuery}
              onChange={onLinkQueryChange}
              onSelect={onAddLink}
              options={linkOptions}
              placeholder={t('linkQueryPlaceholder')}
              className="rounded-xl border border-gold-700/40 bg-black px-3 py-2 text-gold-100 outline-none focus:border-gold-500/50 transition-colors"
            />
            <button
              type="button"
              onClick={() => {
                const top = linkOptions[0];
                if (top) onAddLink(top);
              }}
              disabled={!linkOptions.length || linkLoading}
              className="nvi-press inline-flex items-center justify-center gap-2 rounded-xl border border-gold-700/40 px-3 py-2 text-xs text-gold-200 hover:text-gold-100 disabled:opacity-50 transition-colors"
            >
              <Plus size={14} />
              {linkLoading ? common('loading') : t('addLink')}
            </button>
          </div>
          {linkChips}
        </div>

        {canWrite && form.title.trim() && form.body.trim() ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <input
              value={templateName}
              onChange={(event) => onTemplateNameChange(event.target.value)}
              placeholder={t('templateName')}
              className="rounded-xl border border-gold-700/40 bg-black px-3 py-2 text-xs text-gold-100 placeholder:text-gold-700/60 outline-none focus:border-gold-500/50 transition-colors"
            />
            <button
              type="button"
              onClick={onSaveAsTemplate}
              className="nvi-press inline-flex items-center gap-1.5 rounded-xl border border-gold-700/40 px-3 py-2 text-xs text-gold-200 hover:text-gold-100 transition-colors"
            >
              <Bookmark size={12} />
              {t('saveAsTemplate')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="nvi-modal-panel__footer">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="nvi-press rounded-xl border border-[var(--nvi-border)] px-4 py-2 text-xs text-[color:var(--muted)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canWrite || isSaving || !form.title.trim() || !form.body.trim()}
            className="nvi-press inline-flex items-center gap-2 rounded-xl bg-[var(--nvi-accent)] px-5 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            title={!canWrite ? noAccess('title') : undefined}
          >
            {isSaving ? <Spinner size="xs" variant="orbit" /> : <Send size={14} />}
            {isSaving
              ? editingId
                ? t('updating')
                : t('creating')
              : editingId
                ? t('updateNote')
                : t('createNote')}
          </button>
        </div>
      </div>
    </ModalSurface>
  );
}
