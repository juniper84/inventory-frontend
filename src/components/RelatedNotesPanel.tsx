'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';

type NoteSummary = {
  id: string;
  title: string;
  createdAt?: string;
};

type RelatedNotesPanelProps = {
  resourceType: string;
  resourceId: string;
};

export function RelatedNotesPanel({ resourceType, resourceId }: RelatedNotesPanelProps) {
  const t = useTranslations('notesPage');
  const actions = useTranslations('actions');
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotes = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setNotes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch<{ items: NoteSummary[] } | NoteSummary[]>(
        `/notes?resourceType=${resourceType}&resourceId=${resourceId}&limit=5`,
        { token },
      );
      const items = Array.isArray(data) ? data : data.items;
      setNotes(items);
    } finally {
      setLoading(false);
    }
  }, [resourceId, resourceType]);

  useEffect(() => {
    if (!open) {
      return;
    }
    void loadNotes();
  }, [open, loadNotes]);

  return (
    <div className="rounded border border-gold-700/40 bg-black/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-gold-400">{t('title')}</p>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="text-xs text-gold-300 hover:text-gold-100"
        >
          {actions('view')}
        </button>
      </div>
      {open ? (
        loading ? (
          <div className="flex items-center gap-2 text-xs text-gold-300">
            <Spinner size="xs" variant="grid" /> {actions('loading')}
          </div>
        ) : notes.length ? (
          <div className="space-y-1 text-xs text-gold-200">
            {notes.map((note) => (
              <div key={note.id}>{note.title}</div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gold-400">{t('notesEmpty')}</p>
        )
      ) : null}
    </div>
  );
}
