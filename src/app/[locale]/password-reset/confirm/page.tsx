'use client';

import { useToastState } from '@/lib/app-notifications';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { Banner } from '@/components/notifications/Banner';

export default function PasswordResetConfirmPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';
  // userId is no longer included in the reset URL (user enumeration fix)
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useToastState();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);
    try {
      await apiFetch('/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setMessage({ action: 'auth', outcome: 'success', message: t('resetComplete') });
      setTimeout(() => {
        router.replace(`/${locale}/login`);
      }, 1500);
    } catch (err) {
      setMessage({
        action: 'auth',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('resetFailed')),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-login-inner">
      <div className="auth-login-topline">
        <span className="auth-login-pill">{t('resetConfirmTitle').toUpperCase()}</span>
      </div>

      <h3>{t('resetConfirmTitle')}</h3>
      <p>{t('resetConfirmSubtitle')}</p>

      <form className="auth-login-form" onSubmit={submit}>
        <div className="auth-login-field">
          <label htmlFor="token">{t('resetTokenPlaceholder')}</label>
          <div className="auth-login-control">
            <input
              id="token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={t('resetTokenPlaceholder')}
            />
          </div>
        </div>

        <div className="auth-login-field">
          <label htmlFor="password">{t('resetNewPasswordPlaceholder')}</label>
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
              {showPassword ? t('hidePassword') : t('showPassword')}
            </button>
          </div>
          <p className="text-xs text-gold-400">{t('passwordRequirements')}</p>
        </div>

        <button type="submit" disabled={isSubmitting} className="auth-login-submit nvi-press">
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="dots" size="xs" /> : null}
            {isSubmitting ? t('resetting') : t('resetPassword')}
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
