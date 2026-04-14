'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { setPlatformSession } from '@/lib/auth';
import { TextInput } from '@/components/ui/TextInput';
import { Banner } from '@/components/notifications/Banner';
import { Spinner } from '@/components/Spinner';

export default function PlatformLoginPage() {
  const t = useTranslations('platformAuth');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo') ?? '';
  const returnTo =
    rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '';
  const sessionExpired = searchParams.get('expired') === '1';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeError, setShakeError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [platformStatus, setPlatformStatus] = useState<'checking' | 'online' | 'unavailable'>('checking');

  const emailRef = useRef<HTMLInputElement>(null);

  // Auto-focus email on mount
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Lightweight health check — just verify the API is reachable
  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
        if (!baseUrl) {
          if (!cancelled) setPlatformStatus('unavailable');
          return;
        }
        const res = await fetch(baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        if (!cancelled) setPlatformStatus(res.ok || res.status === 404 ? 'online' : 'unavailable');
      } catch {
        if (!cancelled) setPlatformStatus('unavailable');
      }
    };
    checkHealth();
    return () => { cancelled = true; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setShakeError(false);
    setIsSubmitting(true);
    try {
      const response = await apiFetch<{
        accessToken: string;
        refreshToken?: string;
      }>('/platform/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setPlatformSession(response.accessToken, response.refreshToken);
      router.replace(returnTo || `/${params.locale}/platform/overview`);
    } catch (err) {
      const msg = getApiErrorMessage(err, t('loginFailed'));
      setError(msg);
      setShakeError(true);
      setTimeout(() => setShakeError(false), 500);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="platform-login relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#05070a] text-[var(--pt-text-1,#f0e8d0)]">
      {/* ── Animated background ── */}
      <div className="platform-login__gradient-spot platform-login__gradient-spot--gold" />
      <div className="platform-login__gradient-spot platform-login__gradient-spot--teal" />
      <div className="platform-login__grain" />

      {/* ── Login card ── */}
      <div className="relative z-10 w-full max-w-[440px] px-5 nvi-slide-in-bottom">
        <div className="rounded-2xl border border-gold-700/40 bg-[#080b12]/80 p-6 shadow-[0_32px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-8">
          {/* ── Platform identity ── */}
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-gold-600/40 bg-gold-500/10">
              <span className="text-sm font-bold text-gold-300">NVI</span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold-500">
              {t('platformConsoleLabel')}
            </p>
            <p className="mt-1 text-sm text-gold-400">{t('signInSubtitle')}</p>
          </div>

          {/* ── Session expired banner ── */}
          {sessionExpired && (
            <div className="mb-4">
              <Banner message={t('sessionExpired')} severity="warning" />
            </div>
          )}

          {/* ── Form ── */}
          <form className="space-y-4" onSubmit={submit}>
            {/* Email */}
            <div className="relative nvi-focus-pulse">
              <div className="pointer-events-none absolute left-3 top-[34px] z-10 text-gold-500">
                <Mail size={15} />
              </div>
              <TextInput
                ref={emailRef}
                label={t('email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('emailPlaceholder')}
                autoComplete="email"
                required
                className="pl-9"
              />
            </div>

            {/* Password */}
            <div className="relative">
              <div className="pointer-events-none absolute left-3 top-[34px] z-10 text-gold-500">
                <Lock size={15} />
              </div>
              <TextInput
                label={t('password')}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                autoComplete="current-password"
                required
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                className="pl-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-[34px] z-10 text-gold-500 transition hover:text-gold-300"
                tabIndex={-1}
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {/* Password requirements — contextual */}
            <div
              className="nvi-expand"
              style={{
                maxHeight: passwordFocused ? '40px' : '0px',
                opacity: passwordFocused ? 1 : 0,
              }}
            >
              <p className="text-[10px] text-gold-600">
                {t('passwordRequirements')}
              </p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="nvi-press mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Spinner variant="bars" size="xs" /> : null}
              {isSubmitting ? t('signingIn') : t('signIn')}
            </button>

            {/* Error banner */}
            {error && (
              <div className={shakeError ? 'nvi-shake' : ''}>
                <Banner message={error} severity="error" />
              </div>
            )}
          </form>

          {/* ── System status indicator ── */}
          <div className="mt-5 flex items-center justify-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                platformStatus === 'online'
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                  : platformStatus === 'unavailable'
                    ? 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.5)]'
                    : 'animate-pulse bg-gold-500'
              }`}
            />
            <span className="text-[10px] text-gold-600">
              {platformStatus === 'online'
                ? t('statusOnline')
                : platformStatus === 'unavailable'
                  ? t('statusUnavailable')
                  : t('statusChecking')}
            </span>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <p className="relative z-10 mt-8 text-[10px] text-gold-700/50">
        {t('footerBrand')}
      </p>
    </div>
  );
}
