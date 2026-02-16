import { useEffect } from 'react';

export function usePlatformConsoleStorage(params: {
  pinnedBusinessIds: string[];
  supportNotes: Record<string, string>;
  setPinnedBusinessIds: (value: string[]) => void;
  setSupportNotes: (value: Record<string, string>) => void;
}) {
  const {
    pinnedBusinessIds,
    supportNotes,
    setPinnedBusinessIds,
    setSupportNotes,
  } = params;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const rawPins = window.localStorage.getItem('nvi.platformPinnedBusinesses');
    const rawNotes = window.localStorage.getItem('nvi.platformSupportNotes');
    if (rawPins) {
      try {
        setPinnedBusinessIds(JSON.parse(rawPins) as string[]);
      } catch (err) {
        console.warn('Failed to parse pinned businesses cache', err);
        setPinnedBusinessIds([]);
      }
    }
    if (rawNotes) {
      try {
        setSupportNotes(JSON.parse(rawNotes) as Record<string, string>);
      } catch (err) {
        console.warn('Failed to parse support notes cache', err);
        setSupportNotes({});
      }
    }
  }, [setPinnedBusinessIds, setSupportNotes]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      'nvi.platformPinnedBusinesses',
      JSON.stringify(pinnedBusinessIds),
    );
  }, [pinnedBusinessIds]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      'nvi.platformSupportNotes',
      JSON.stringify(supportNotes),
    );
  }, [supportNotes]);
}
