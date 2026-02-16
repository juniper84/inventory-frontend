'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { setPlatformSession } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';

export default function PlatformLoginPage() {
  const t = useTranslations('platformAuth');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await apiFetch<{ accessToken: string }>(
        '/platform/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        },
      );
      setPlatformSession(response.accessToken);
      router.replace(`/${params.locale}/platform/overview`);
    } catch (err) {
      setError(getApiErrorMessage(err, t('loginFailed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05070a] text-gold-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(245,158,11,0.18),transparent_48%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_5%,rgba(13,148,136,0.12),transparent_45%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(2,6,23,0.96),rgba(6,10,18,0.88),rgba(0,0,0,0.92))]" />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1240px] gap-8 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <section className="space-y-6 nvi-reveal">
          <p className="inline-flex items-center gap-2 rounded-full border border-gold-700/60 bg-black/40 px-3 py-1 text-[10px] uppercase tracking-[0.28em] text-gold-400">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded border border-gold-600/60 text-[10px] font-semibold text-gold-300">
              P
            </span>
            {t('deckEyebrow')}
          </p>

          <div className="space-y-3">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-gold-50 md:text-5xl">
              {t('title')}
            </h1>
            <p className="max-w-2xl text-base text-gold-300 md:text-lg">{t('deckSubtitle')}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                glyph: 'S',
                title: t('pillarSecurityTitle'),
                body: t('pillarSecurityBody'),
              },
              {
                glyph: 'Q',
                title: t('pillarQueuesTitle'),
                body: t('pillarQueuesBody'),
              },
              {
                glyph: 'A',
                title: t('pillarAuditTitle'),
                body: t('pillarAuditBody'),
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-gold-700/50 bg-black/40 p-4 backdrop-blur-sm"
              >
                <div className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded border border-gold-600/60 bg-gold-500/10 text-[11px] font-semibold text-gold-100">
                  {item.glyph}
                </div>
                <p className="text-sm font-semibold text-gold-100">{item.title}</p>
                <p className="mt-1 text-xs text-gold-400">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gold-700/50 bg-black/40 p-4 backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">{t('statusLabel')}</p>
                <p className="mt-1 text-sm text-gold-100">{t('statusValue')}</p>
              </div>
              <span className="rounded-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                {t('statusBadge')}
              </span>
            </div>
          </div>
        </section>

        <section className="nvi-reveal">
          <div className="rounded-2xl border border-gold-700/50 bg-black/60 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl md:p-7">
            <div className="mb-5 space-y-2">
              <p className="text-[10px] uppercase tracking-[0.28em] text-gold-500">{t('formEyebrow')}</p>
              <h2 className="text-2xl font-semibold text-gold-50">{t('formTitle')}</h2>
              <p className="text-sm text-gold-400">{t('subtitle')}</p>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.2em] text-gold-500">{t('email')}</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('email')}
                  type="email"
                  className="w-full rounded border border-gold-700/60 bg-black px-3 py-2.5 text-gold-100 outline-none transition focus:border-gold-400/70"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.2em] text-gold-500">{t('password')}</span>
                <div className="relative">
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t('password')}
                    type={showPassword ? 'text' : 'password'}
                    className="w-full rounded border border-gold-700/60 bg-black px-3 py-2.5 pr-14 text-gold-100 outline-none transition focus:border-gold-400/70"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-gold-700/50 px-2 py-0.5 text-[11px] text-gold-300"
                  >
                    {showPassword ? t('hidePassword') : t('showPassword')}
                  </button>
                </div>
              </label>

              <p className="text-xs text-gold-500">{t('passwordRequirements')}</p>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded bg-gold-500 px-4 py-2.5 font-semibold text-black transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isSubmitting ? <Spinner variant="bars" size="xs" /> : null}
                  {isSubmitting ? t('signingIn') : t('signIn')}
                </span>
              </button>

              {error ? (
                <p className="rounded border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              ) : null}
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
