import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';

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
  setMessage: (value: string | null) => void;
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
    if (!startsAt || endsAt) {
      return endsAt;
    }
    const parsed = new Date(startsAt);
    if (Number.isNaN(parsed.getTime())) {
      return endsAt;
    }
    const nextEnd = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
    return formatLocalDateTime(nextEnd);
  };

  const loadAnnouncements = async () => {
    if (!token) {
      return;
    }
    const data = await apiFetch<AnnouncementItem[]>('/platform/announcements', { token });
    setAnnouncements(data);
  };

  const createAnnouncement = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) {
      return;
    }
    if (announcementPreviewSignature !== announcementTargetSignature) {
      setMessage(t('announcementPreviewRequired'));
      return;
    }

    const toIsoDateTime = (value: string) => {
      if (!value) {
        return undefined;
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return undefined;
      }
      return parsed.toISOString();
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
