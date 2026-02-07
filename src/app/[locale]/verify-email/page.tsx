'use client';

import { useEffect, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { getOrCreateDeviceId, setSession } from '@/lib/auth';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

export default function VerifyEmailPage() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const initialToken = searchParams.get('token') ?? '';
  const businessId = searchParams.get('businessId') ?? '';
  const email = searchParams.get('email') ?? '';
  const [token, setToken] = useState(initialToken);
  const [message, setMessage] = useToastState();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

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
        setTimeout(() => {
          router.replace(`/${params.locale}`);
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
      setTimeout(() => {
        router.replace(
          `/${params.locale}/login${queryString ? `?${queryString}` : ''}`,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await verify();
  };

  const resend = async () => {
    if (!email || !businessId) {
      setMessage({ action: 'auth', outcome: 'failure', message: t('verifyEmailResendMissing') });
      return;
    }
    setMessage(null);
    setIsResending(true);
    try {
      await apiFetch('/auth/email-verification/request', {
        method: 'POST',
        body: JSON.stringify({ email, businessId }),
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
    <div className="space-y-6 nvi-reveal">
      <PremiumPageHeader
        eyebrow="EMAIL VERIFICATION"
        title={t('verifyEmailTitle')}
        subtitle={t('verifyEmailHint')}
        badges={
          <>
            <span className="nvi-badge">TOKEN CHECK</span>
            <span className="nvi-badge">{businessId ? 'BUSINESS LOCKED' : 'GLOBAL'}</span>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 nvi-stagger">
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">TOKEN</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{token.trim() ? 'SET' : 'REQUIRED'}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">BUSINESS ID</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{businessId ? 'PRESENT' : 'NONE'}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">STATUS</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">
            {isSubmitting ? t('verifyEmailProcessing') : isResending ? t('verifyEmailResendProcessing') : 'READY'}
          </p>
        </article>
      </div>

      <form className="command-card nvi-panel space-y-4 p-4" onSubmit={submit}>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t('verifyEmailTokenPlaceholder')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        {businessId ? (
          <div className="rounded border border-gold-700/40 bg-black/40 px-3 py-2 text-xs text-gold-300">
            {t('verifyEmailBusinessId')}{' '}
            <span className="text-gold-100">{businessId}</span>
          </div>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="nvi-cta w-full rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="bars" size="xs" /> : null}
            {isSubmitting ? t('verifyEmailProcessing') : t('verifyEmailButton')}
          </span>
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={isResending}
          className="w-full rounded border border-gold-700/50 bg-black/30 px-4 py-2 text-sm font-semibold text-gold-100 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isResending ? <Spinner variant="bars" size="xs" /> : null}
            {isResending ? t('verifyEmailResendProcessing') : t('verifyEmailResendButton')}
          </span>
        </button>
        {message ? <p className="text-sm text-gold-300">{message}</p> : null}
      </form>
    </div>
  );
}
