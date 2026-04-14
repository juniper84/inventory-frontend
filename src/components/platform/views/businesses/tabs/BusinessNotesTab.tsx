'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { StickyNote, Send, Trash2, User } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/Spinner';
import { useBusinessWorkspace } from '../hooks/useBusinessWorkspace';

type Props = {
  businessId: string;
};

function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function absoluteTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

export function BusinessNotesTab({ businessId }: Props) {
  const t = useTranslations('platformConsole');
  const ws = useBusinessWorkspace(businessId);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Auto-load notes when tab mounts
  useEffect(() => {
    ws.loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  const handleSubmit = async () => {
    if (!draft.trim()) return;
    setIsSubmitting(true);
    const ok = await ws.createNote(draft);
    if (ok) setDraft('');
    setIsSubmitting(false);
  };

  const handleDelete = async (noteId: string) => {
    if (confirmDeleteId !== noteId) {
      setConfirmDeleteId(noteId);
      setTimeout(() => setConfirmDeleteId(null), 4000);
      return;
    }
    await ws.deleteNote(noteId);
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-4 nvi-stagger">
      {/* Composer */}
      <Card padding="lg" className="nvi-slide-in-bottom">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10">
            <StickyNote size={16} className="text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--pt-text-1)]">{t('notesComposeTitle')}</h3>
            <p className="text-[10px] text-[var(--pt-text-muted)]">{t('notesComposeHint')}</p>
          </div>
        </div>

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={3}
        />

        <div className="mt-3 flex items-center justify-between">
          <span className="text-[10px] text-[var(--pt-text-muted)]">
            {draft.length > 0 ? `${draft.length} ${t('notesChars')}` : ''}
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!draft.trim() || isSubmitting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--pt-accent)] px-3 py-1.5 text-[10px] font-semibold text-black disabled:opacity-40 nvi-press"
          >
            {isSubmitting ? <Spinner size="xs" variant="dots" /> : <Send size={11} />}
            {isSubmitting ? t('notesAdding') : t('notesAdd')}
          </button>
        </div>
      </Card>

      {/* Notes list */}
      {ws.isLoadingNotes ? (
        <div className="space-y-2 nvi-stagger">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/[0.03] border border-white/[0.04]" />
          ))}
        </div>
      ) : ws.notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote size={28} className="text-[var(--pt-text-muted)]" />}
          title={t('notesEmptyTitle')}
          description={t('notesEmptyHint')}
        />
      ) : (
        <div className="space-y-2 nvi-stagger">
          {ws.notes.map((note) => {
            const isConfirmingDelete = confirmDeleteId === note.id;
            return (
              <Card
                key={note.id}
                padding="md"
                className="nvi-slide-in-bottom hover:border-[var(--pt-accent-border)] transition"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                    <User size={12} className="text-purple-400" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-semibold text-[var(--pt-text-2)]">
                        {note.platformAdmin?.email ?? 'Platform admin'}
                      </p>
                      <span
                        className="text-[9px] text-[var(--pt-text-muted)]"
                        title={absoluteTime(note.createdAt)}
                      >
                        {relativeTime(note.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--pt-text-1)] whitespace-pre-wrap">
                      {note.body}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    className={`shrink-0 flex h-7 items-center gap-1 rounded-md px-1.5 text-[9px] transition nvi-press ${
                      isConfirmingDelete
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                        : 'text-[var(--pt-text-muted)] hover:text-red-400'
                    }`}
                  >
                    <Trash2 size={11} />
                    {isConfirmingDelete && t('notesConfirmDelete')}
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
