'use client';

import { useToastState } from '@/lib/app-notifications';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { Banner } from '@/components/notifications/Banner';

export default function PasswordResetRequestPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
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

      setMessage({ action: 'auth', outcome: 'success', message: t('resetRequestSuccess') });
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
    <div className="auth-login-inner">
      <div className="auth-login-topline">
        <span className="auth-login-pill">{t('passwordResetTitle').toUpperCase()}</span>
      </div>

      <h3>{t('passwordResetTitle')}</h3>
      <p>{t('passwordResetSubtitle')}</p>

      <form className="auth-login-form" onSubmit={submit}>
        <div className="auth-login-field">
          <label htmlFor="email">{t('resetEmailPlaceholder')}</label>
          <div className="auth-login-control">
            <input
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('resetEmailPlaceholder')}
              type="email"
            />
          </div>
        </div>

        {businessOptions.length ? (
          <div className="auth-login-field">
            <label>{t('resetBusinessSelectPlaceholder')}</label>
            <SmartSelect
              instanceId="password-reset-business"
              value={businessId}
              onChange={setBusinessId}
              options={businessOptions}
              placeholder={t('resetBusinessSelectPlaceholder')}
              className="w-full"
            />
          </div>
        ) : null}

        <button type="submit" disabled={isSubmitting} className="auth-login-submit nvi-press">
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="ring" size="xs" /> : null}
            {isSubmitting ? t('resetSending') : t('resetSend')}
          </span>
        </button>

        {message ? <Banner message={message} /> : null}
      </form>

      <div className="auth-login-foot">
        <span>
          <a href={`/${locale}/login`}>{t('signIn')}</a>
        </span>
      </div>
    </div>
  );
}
