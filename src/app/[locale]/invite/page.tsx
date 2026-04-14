'use client';

import { useEffect, useRef, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { Banner } from '@/components/notifications/Banner';
import { FontScaleSelector } from '@/components/ui/FontScaleSelector';

export default function AcceptInvitePage() {
  const auth = useTranslations('auth');
  const t = useTranslations('invitePage');
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [tokenFromUrl, setTokenFromUrl] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useToastState();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const urlToken = searchParams.get('token');
    if (urlToken) {
      setToken(urlToken);
      setTokenFromUrl(true);
      apiFetch<{ email: string }>('/auth/invite/info', {
        method: 'POST',
        body: JSON.stringify({ token: urlToken }),
      }).then((info) => {
        setInviteEmail(info.email);
      }).catch(() => {
        setMessage({ action: 'auth', outcome: 'failure', message: t('tokenInvalid') });
      });
    }
  }, [searchParams, t]);

  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);
    try {
      await apiFetch('/auth/invite/accept', {
        method: 'POST',
        body: JSON.stringify({ token, name, password }),
      });
      setMessage({ action: 'create', outcome: 'success', message: t('created') });
      redirectTimerRef.current = setTimeout(() => {
        router.replace(`/${locale}/login`);
      }, 700);
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('failed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-login-inner">
      <div className="auth-login-topline">
        <span className="auth-login-pill">{t('title').toUpperCase()}</span>
      </div>

      <h3>{t('title')}</h3>
      <p>{t('subtitle')}</p>

      {inviteEmail ? (
        <div className="auth-login-business">
          <span className="text-xs">{t('invitedAs')}</span>
          <span className="font-medium">{inviteEmail}</span>
        </div>
      ) : null}

      <form className="auth-login-form" onSubmit={submit}>
        <div className="auth-login-field">
          <label htmlFor="token">{t('tokenPlaceholder')}</label>
          <div className="auth-login-control">
            <input
              id="token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              readOnly={tokenFromUrl}
              placeholder={t('tokenPlaceholder')}
            />
          </div>
        </div>

        <div className="auth-login-field">
          <label htmlFor="name">{t('namePlaceholder')}</label>
          <div className="auth-login-control">
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('namePlaceholder')}
            />
          </div>
        </div>

        <div className="auth-login-field">
          <label htmlFor="password">{auth('password')}</label>
          <div className="auth-login-control">
            <input
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              type={showPassword ? 'text' : 'password'}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="auth-login-link"
            >
              {showPassword ? auth('hidePassword') : auth('showPassword')}
            </button>
          </div>
          <p className="text-xs text-gold-400">{auth('passwordRequirements')}</p>
        </div>

        <div className="space-y-2 mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
            Display size (optional)
          </p>
          <FontScaleSelector showHint />
        </div>

        <button type="submit" disabled={isSubmitting} className="auth-login-submit nvi-press">
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="dots" size="xs" /> : null}
            {isSubmitting ? t('submitting') : t('submit')}
          </span>
        </button>

        {message ? <Banner message={message} /> : null}
      </form>

      <div className="auth-login-foot">
        <span>
          <a href={`/${locale}/login`}>{auth('signIn')}</a>
        </span>
      </div>
    </div>
  );
}
