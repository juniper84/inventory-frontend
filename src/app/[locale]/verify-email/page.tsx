'use client';

import { useEffect, useRef, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { getOrCreateDeviceId, setSession } from '@/lib/auth';
import { Banner } from '@/components/notifications/Banner';

export default function VerifyEmailPage() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const initialToken = searchParams.get('token') ?? '';
  const businessId = searchParams.get('businessId') ?? '';
  const email = searchParams.get('email') ?? '';
  const [token, setToken] = useState(initialToken);
  const [message, setMessage] = useToastState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const verify = async () => {
    setMessage(null);
    setIsSubmitting(true);
    try {
      const response = await apiFetch<{
        verified: boolean;
        accessToken?: string;
        refreshToken?: string;
        businessId?: string;
        user?: { id: string; email: string; name: string; mustResetPassword?: boolean };
        businessSelectionRequired?: boolean;
      }>('/auth/email-verification/confirm', {
        method: 'POST',
        body: JSON.stringify({
          token,
          deviceId: getOrCreateDeviceId(),
          ...(businessId ? { businessId } : {}),
        }),
      });
      if (response.accessToken && response.refreshToken && response.user) {
        setSession(response.accessToken, response.refreshToken, response.user);
        setMessage({ action: 'auth', outcome: 'success', message: t('verifyEmailLoggedIn') });
        redirectTimerRef.current = setTimeout(() => {
          router.replace(`/${locale}`);
        }, 500);
        return;
      }

      setMessage({ action: 'auth', outcome: 'info', message: t('verifyEmailSuccess') });
      const query = new URLSearchParams();
      if (businessId) {
        query.set('businessId', businessId);
      }
      if (email) {
        query.set('email', email);
      }
      if (response.businessSelectionRequired) {
        query.set('selectBusiness', '1');
      }
      const queryString = query.toString();
      redirectTimerRef.current = setTimeout(() => {
        router.replace(
          `/${locale}/login${queryString ? `?${queryString}` : ''}`,
        );
      }, 800);
    } catch (err) {
      setMessage({
        action: 'auth',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('verifyEmailFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }
    verify();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await verify();
  };

  const resend = async () => {
    if (!email) {
      setMessage({ action: 'auth', outcome: 'failure', message: t('verifyEmailResendMissing') });
      return;
    }
    setMessage(null);
    setIsResending(true);
    try {
      await apiFetch('/auth/email-verification/request', {
        method: 'POST',
        body: JSON.stringify({ email, ...(businessId ? { businessId } : {}) }),
      });
      setMessage({ action: 'auth', outcome: 'success', message: t('verifyEmailResendSent') });
    } catch (err) {
      setMessage({
        action: 'auth',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('verifyEmailResendFailed')),
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="auth-login-inner">
      <div className="auth-login-topline">
        <span className="auth-login-pill">{t('verifyEmailTitle').toUpperCase()}</span>
        <span className="auth-login-pill auth-login-pill--teal">
          {businessId ? t('badgeBusinessLocked').toUpperCase() : t('badgeGlobal').toUpperCase()}
        </span>
      </div>

      <h3>{t('verifyEmailTitle')}</h3>
      <p>{t('verifyEmailHint')}</p>

      <form className="auth-login-form" onSubmit={submit}>
        <div className="auth-login-field">
          <label htmlFor="token">{t('verifyEmailTokenPlaceholder')}</label>
          <div className="auth-login-control">
            <input
              id="token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={t('verifyEmailTokenPlaceholder')}
            />
          </div>
        </div>

        {businessId ? (
          <div className="auth-login-business">
            <span className="text-xs">{t('verifyEmailBusinessId')}</span>
            <span className="font-medium">{businessId}</span>
          </div>
        ) : null}

        <button type="submit" disabled={isSubmitting} className="auth-login-submit nvi-press">
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="bars" size="xs" /> : null}
            {isSubmitting ? t('verifyEmailProcessing') : t('verifyEmailButton')}
          </span>
        </button>

        <button
          type="button"
          onClick={resend}
          disabled={isResending}
          className="auth-login-submit nvi-press"
          style={{ opacity: isResending ? 0.7 : 1 }}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isResending ? <Spinner variant="bars" size="xs" /> : null}
            {isResending ? t('verifyEmailResendProcessing') : t('verifyEmailResendButton')}
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
