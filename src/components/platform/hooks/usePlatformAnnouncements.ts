import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import type { ToastInput } from '@/lib/app-notifications';

type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

type AnnouncementForm = {
  title: string;
  message: string;
  severity: string;
  startsAt: string;
  endsAt: string;
  reason: string;
  targetBusinessIds: string[];
  targetTiers: string[];
  targetStatuses: string[];
};

type AnnouncementAudiencePreview = {
  estimatedReach: {
    total: number;
    explicit: number;
    segment: number;
  };
  filters: {
    hasBroadcastScope: boolean;
    targetBusinessIds: string[];
    targetTiers: string[];
    targetStatuses: string[];
  };
  sampleBusinesses: {
    id: string;
    name: string;
    businessStatus: string;
    subscriptionTier?: string | null;
    subscriptionStatus?: string | null;
  }[];
};

type AnnouncementItem = {
  id: string;
  title: string;
  severity: string;
  startsAt: string;
  endsAt?: string | null;
  businessTargets: { businessId: string }[];
  segmentTargets: { type: 'TIER' | 'STATUS'; value: string }[];
};

export function usePlatformAnnouncements({
  token,
  t,
  setMessage,
  announcementForm,
  setAnnouncementForm,
  announcementTargetSignature,
}: {
  token: string | null;
  t: Translate;
  setMessage: (value: ToastInput | null) => void;
  announcementForm: AnnouncementForm;
  setAnnouncementForm: Dispatch<SetStateAction<AnnouncementForm>>;
  announcementTargetSignature: string;
}) {
  const [announcementBusinessSearch, setAnnouncementBusinessSearch] = useState('');
  const [isCreatingAnnouncement, setIsCreatingAnnouncement] = useState(false);
  const [isPreviewingAnnouncementAudience, setIsPreviewingAnnouncementAudience] =
    useState(false);
  const [announcementAudiencePreview, setAnnouncementAudiencePreview] =
    useState<AnnouncementAudiencePreview | null>(null);
  const [announcementPreviewSignature, setAnnouncementPreviewSignature] = useState('');
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [endingAnnouncementId, setEndingAnnouncementId] = useState<string | null>(null);

  const formatLocalDateTime = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes(),
    ).padStart(2, '0')}`;

  const applyDefaultAnnouncementEnd = (startsAt: string, endsAt: string) => {
    if (!startsAt) return endsAt;
    const parsedStart = new Date(startsAt);
    if (Number.isNaN(parsedStart.getTime())) return endsAt;
    const nextEnd = new Date(parsedStart.getTime() + 24 * 60 * 60 * 1000);
    // Auto-fill when endsAt is empty.
    if (!endsAt) return formatLocalDateTime(nextEnd);
    // If the existing endsAt is now before or equal to startsAt (e.g. admin
    // pushed startsAt forward), bump endsAt to startsAt + 24h.
    const parsedEnd = new Date(endsAt);
    if (Number.isNaN(parsedEnd.getTime()) || parsedEnd <= parsedStart) {
      return formatLocalDateTime(nextEnd);
    }
    return endsAt;
  };

  const loadAnnouncements = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const data = await apiFetch<AnnouncementItem[]>('/platform/announcements', { token });
      setAnnouncements(data);
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('announcementLoadFailed')));
    }
  }, [token, t, setMessage]);

  const createAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (announcementPreviewSignature !== announcementTargetSignature) {
      setMessage(t('announcementPreviewRequired'));
      return;
    }
    if (!announcementForm.startsAt) {
      setMessage(t('announcementStartRequired'));
      return;
    }
    if (
      announcementForm.endsAt &&
      new Date(announcementForm.endsAt) <= new Date(announcementForm.startsAt)
    ) {
      setMessage(t('announcementEndBeforeStart'));
      return;
    }

    const toIsoDateTime = (value: string): string | undefined => {
      if (!value) return undefined;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return undefined;
      // 'YYYY-MM-DDTHH:mm' is parsed as local browser time by the JS engine.
      // Converting via toISOString() produces UTC, which the backend (UTC server) stores correctly.
      return new Date(value).toISOString();
    };

    try {
      setIsCreatingAnnouncement(true);
      await apiFetch('/platform/announcements', {
        token,
        method: 'POST',
        body: JSON.stringify({
          ...announcementForm,
          startsAt: announcementForm.startsAt
            ? toIsoDateTime(announcementForm.startsAt)
            : undefined,
          endsAt: announcementForm.endsAt ? toIsoDateTime(announcementForm.endsAt) : null,
        }),
      });

      setAnnouncementForm({
        title: '',
        message: '',
        severity: 'INFO',
        startsAt: '',
        endsAt: '',
        reason: '',
        targetBusinessIds: [],
        targetTiers: [],
        targetStatuses: [],
      });
      setAnnouncementAudiencePreview(null);
      setAnnouncementPreviewSignature('');
      setAnnouncementBusinessSearch('');
      await loadAnnouncements();
      setMessage(t('announcementCreated'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('announcementCreateFailed')));
    } finally {
      setIsCreatingAnnouncement(false);
    }
  };

  const previewAnnouncementAudience = async () => {
    if (!token) {
      return;
    }
    setIsPreviewingAnnouncementAudience(true);
    try {
      const preview = await apiFetch<AnnouncementAudiencePreview>(
        '/platform/announcements/preview',
        {
          token,
          method: 'POST',
          body: JSON.stringify({
            targetBusinessIds: announcementForm.targetBusinessIds,
            targetTiers: announcementForm.targetTiers,
            targetStatuses: announcementForm.targetStatuses,
          }),
        },
      );
      setAnnouncementAudiencePreview(preview);
      setAnnouncementPreviewSignature(announcementTargetSignature);
      setMessage(
        t('announcementPreviewReady', {
          value: preview.estimatedReach.total,
        }),
      );
    } catch (err) {
      // Clear stale preview state so the submit guard is not bypassed on error.
      setAnnouncementPreviewSignature('');
      setAnnouncementAudiencePreview(null);
      setMessage(getApiErrorMessage(err, t('announcementPreviewFailed')));
    } finally {
      setIsPreviewingAnnouncementAudience(false);
    }
  };

  const endAnnouncement = async (announcementId: string) => {
    if (!token) {
      return;
    }
    setEndingAnnouncementId(announcementId);
    try {
      await apiFetch(`/platform/announcements/${announcementId}/end`, {
        token,
        method: 'PATCH',
      });
      await loadAnnouncements();
      setMessage(t('announcementEnded'));
    } catch (err) {
      setMessage(getApiErrorMessage(err, t('announcementEndFailed')));
    } finally {
      setEndingAnnouncementId(null);
    }
  };

  useEffect(() => {
    if (
      announcementPreviewSignature &&
      announcementPreviewSignature !== announcementTargetSignature
    ) {
      setAnnouncementAudiencePreview(null);
    }
  }, [announcementPreviewSignature, announcementTargetSignature]);

  const announcementTimeline = useMemo(() => {
    const now = Date.now();
    const buckets = {
      active: [] as AnnouncementItem[],
      upcoming: [] as AnnouncementItem[],
      ended: [] as AnnouncementItem[],
    };

    announcements.forEach((announcement) => {
      const startsAt = new Date(announcement.startsAt).getTime();
      const endsAt = announcement.endsAt ? new Date(announcement.endsAt).getTime() : null;
      if (startsAt > now) {
        buckets.upcoming.push(announcement);
        return;
      }
      if (endsAt !== null && endsAt <= now) {
        buckets.ended.push(announcement);
        return;
      }
      buckets.active.push(announcement);
    });

    return buckets;
  }, [announcements]);

  return {
    announcementBusinessSearch,
    setAnnouncementBusinessSearch,
    isCreatingAnnouncement,
    isPreviewingAnnouncementAudience,
    announcementAudiencePreview,
    announcementPreviewSignature,
    announcements,
    endingAnnouncementId,
    applyDefaultAnnouncementEnd,
    loadAnnouncements,
    createAnnouncement,
    previewAnnouncementAudience,
    endAnnouncement,
    announcementTimeline,
  };
}
