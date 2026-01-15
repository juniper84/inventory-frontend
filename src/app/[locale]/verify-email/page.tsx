'use client';

import { useEffect, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { getOrCreateDeviceId, setSession } from '@/lib/auth';

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
      setMessage({ action: 'auth', outcome: 'failure', message: t('verifyEmailFailed') });
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

  return (
    <div className="space-y-6 nvi-reveal">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gold-100">
          {t('verifyEmailTitle')}
        </h1>
        <p className="text-sm text-gold-300">
          {t('verifyEmailHint')}
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
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
          className="w-full rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="bars" size="xs" /> : null}
            {isSubmitting ? t('verifyEmailProcessing') : t('verifyEmailButton')}
          </span>
        </button>
        {message ? <p className="text-sm text-gold-300">{message}</p> : null}
      </form>
    </div>
  );
}
