'use client';

import { useToastState } from '@/lib/app-notifications';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

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
    <div className="space-y-6 nvi-reveal">
      <PremiumPageHeader
        eyebrow="PASSWORD RESET"
        title={t('resetConfirmTitle')}
        subtitle={t('resetConfirmSubtitle')}
        badges={
          <>
            <span className="nvi-badge">TOKEN VERIFY</span>
            <span className="nvi-badge">{userId ? 'USER LOCKED' : 'GENERIC MODE'}</span>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 nvi-stagger">
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">TOKEN</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{token.trim() ? 'SET' : 'REQUIRED'}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">USER ID</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{userId ? 'PRESENT' : 'NONE'}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">STATUS</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{isSubmitting ? t('resetting') : 'READY'}</p>
        </article>
      </div>

      <form className="command-card nvi-panel space-y-4 p-4" onSubmit={submit}>
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
          className="nvi-cta w-full rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
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
