'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { promptAction, useToastState } from '@/lib/app-notifications';
import { StatusBanner } from '@/components/StatusBanner';

type NoAccessStateProps = {
  permission: string;
  path: string;
};

export function NoAccessState({ permission, path }: NoAccessStateProps) {
  const t = useTranslations('noAccess');
  const actions = useTranslations('actions');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useToastState();

  const requestAccess = async () => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    const reason = await promptAction({
      title: t('requestTitle'),
      message: t('requestPrompt'),
      confirmText: t('requestAction'),
      cancelText: actions('cancel'),
      placeholder: t('requestPlaceholder'),
    });
    if (reason === null) {
      return;
    }
    setIsSubmitting(true);
    try {
      await apiFetch('/access-requests', {
        token,
        method: 'POST',
        body: JSON.stringify({
          permission,
          path,
          reason: reason.trim() || undefined,
        }),
      });
      setMessage({
        action: 'save',
        outcome: 'success',
        message: t('requestSent'),
      });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('requestFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-gold-700/40 bg-black/60 p-6">
        <h2 className="text-2xl font-semibold text-gold-100">{t('title')}</h2>
        <p className="mt-2 text-sm text-gold-300">{t('subtitle')}</p>
        <p className="mt-3 text-xs text-gold-500">
          {t('requiredPermission', { permission })}
        </p>
        <button
          type="button"
          onClick={requestAccess}
          disabled={isSubmitting}
          className="mt-4 rounded border border-gold-600/60 px-4 py-2 text-sm text-gold-100 disabled:opacity-70"
        >
          {isSubmitting ? t('requesting') : t('requestAction')}
        </button>
      </div>
      {message ? <StatusBanner message={message} /> : null}
    </div>
  );
}
