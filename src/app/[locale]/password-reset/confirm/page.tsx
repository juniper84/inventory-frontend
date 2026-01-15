'use client';

import { useToastState } from '@/lib/app-notifications';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Spinner } from '@/components/Spinner';

export default function PasswordResetConfirmPage() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const initialToken = searchParams.get('token') ?? '';
  const initialUserId = searchParams.get('userId') ?? '';
  const [token, setToken] = useState(initialToken);
  const [userId] = useState(initialUserId);
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
        body: JSON.stringify({
          token,
          password,
          ...(userId ? { userId } : {}),
        }),
      });
      setMessage({ action: 'auth', outcome: 'success', message: t('resetComplete') });
    } catch (err) {
      setMessage({ action: 'auth', outcome: 'failure', message: t('resetFailed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 nvi-reveal">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gold-100">
          {t('resetConfirmTitle')}
        </h1>
        <p className="text-sm text-gold-300">
          {t('resetConfirmSubtitle')}
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        {userId ? (
          <div className="rounded border border-gold-700/40 bg-black/40 px-3 py-2 text-xs text-gold-300">
            {t('resetUserIdLabel')}{' '}
            <span className="text-gold-100">{userId}</span>
          </div>
        ) : null}
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t('resetTokenPlaceholder')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <div className="space-y-2">
          <div className="relative">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('resetNewPasswordPlaceholder')}
              type={showPassword ? 'text' : 'password'}
              className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
            >
              {showPassword ? t('hidePassword') : t('showPassword')}
            </button>
          </div>
          <p className="text-xs text-gold-400">{t('passwordRequirements')}</p>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="dots" size="xs" /> : null}
            {isSubmitting ? t('resetting') : t('resetPassword')}
          </span>
        </button>
        {message ? <p className="text-sm text-gold-300">{message}</p> : null}
      </form>
    </div>
  );
}
