'use client';

import { useToastState } from '@/lib/app-notifications';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';

export default function PasswordResetRequestPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [businessOptions, setBusinessOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [message, setMessage] = useToastState();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (businessOptions.length && !businessId) {
      setMessage({ action: 'auth', outcome: 'failure', message: t('resetSelectBusiness') });
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiFetch<{
        requested?: boolean;
        businessSelectionRequired?: boolean;
        businesses?: { businessId: string; businessName: string }[];
      }>('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({
          email,
          ...(businessId ? { businessId } : {}),
        }),
      });

      if (response.businessSelectionRequired && response.businesses?.length) {
        setBusinessOptions(
          response.businesses.map((biz) => ({
            value: biz.businessId,
            label: biz.businessName,
          })),
        );
        setMessage({ action: 'auth', outcome: 'info', message: t('resetChooseBusiness') });
        return;
      }

      setMessage(t('resetRequestSuccess'));
    } catch (err) {
      setMessage({
        action: 'auth',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('resetRequestFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 nvi-reveal">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gold-100">
          {t('passwordResetTitle')}
        </h1>
        <p className="text-sm text-gold-300">
          {t('passwordResetSubtitle')}
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('resetEmailPlaceholder')}
          type="email"
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        {businessOptions.length ? (
          <SmartSelect
            value={businessId}
            onChange={setBusinessId}
            options={businessOptions}
            placeholder={t('resetBusinessSelectPlaceholder')}
            className="nvi-select-container"
          />
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="ring" size="xs" /> : null}
            {isSubmitting ? t('resetSending') : t('resetSend')}
          </span>
        </button>
        {message ? <p className="text-sm text-gold-300">{message}</p> : null}
      </form>
    </div>
  );
}
