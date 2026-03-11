'use client';

import { useToastState } from '@/lib/app-notifications';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { StatusBanner } from '@/components/StatusBanner';

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
    <div className="space-y-6 nvi-reveal">
      <PremiumPageHeader
        eyebrow={t('eyebrowReset')}
        title={t('resetConfirmTitle')}
        subtitle={t('resetConfirmSubtitle')}
        badges={
          <>
            <span className="nvi-badge">{t('badgeTokenVerify')}</span>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 nvi-stagger">
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiToken')}</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{token.trim() ? t('set') : t('required')}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiStatus')}</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{isSubmitting ? t('resetting') : t('ready')}</p>
        </article>
      </div>

      <form className="command-card nvi-panel space-y-4 p-4" onSubmit={submit}>
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
        {message ? <StatusBanner message={message} /> : null}
      </form>
    </div>
  );
}
