'use client';

import { useEffect, useRef, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';
import { StatusBanner } from '@/components/StatusBanner';

export default function AcceptInvitePage() {
  const auth = useTranslations('auth');
  const t = useTranslations('invitePage');
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [tokenFromUrl, setTokenFromUrl] = useState(false);
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
    }
  }, [searchParams]);

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
    <div className="space-y-6 nvi-reveal">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
        badges={
          <>
            <span className="nvi-badge">{t('badgeTokenFlow')}</span>
            <span className="nvi-badge">{token.trim() ? t('badgeTokenSet') : t('badgeTokenMissing')}</span>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 nvi-stagger">
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiToken')}</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{token.trim() ? t('kpiTokenProvided') : t('kpiTokenRequired')}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiName')}</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{name.trim() ? t('kpiNameSet') : t('kpiNamePending')}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('kpiStatus')}</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{isSubmitting ? t('submitting') : t('kpiStatusReady')}</p>
        </article>
      </div>

      <form className="command-card nvi-panel space-y-4 p-4" onSubmit={submit}>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          readOnly={tokenFromUrl}
          placeholder={t('tokenPlaceholder')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100 read-only:opacity-60"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('namePlaceholder')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <div className="space-y-2">
          <div className="relative">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('passwordPlaceholder')}
              type={showPassword ? 'text' : 'password'}
              className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 pr-12 text-gold-100"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gold-300"
            >
              {showPassword ? auth('hidePassword') : auth('showPassword')}
            </button>
          </div>
          <p className="text-xs text-gold-400">{auth('passwordRequirements')}</p>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="nvi-cta w-full rounded px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="dots" size="xs" /> : null}
            {isSubmitting ? t('submitting') : t('submit')}
          </span>
        </button>
        {message ? <StatusBanner message={message} /> : null}
      </form>
    </div>
  );
}
