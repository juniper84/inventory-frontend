'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getLastBusinessId, getOrCreateDeviceId, setLastBusinessId, setSession } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [availableBusinesses, setAvailableBusinesses] = useState<
    { businessId: string; businessName: string; status: string }[]
  >([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState(
    getLastBusinessId() ?? '',
  );
  const [pendingCredentials, setPendingCredentials] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [needsBusinessSelection, setNeedsBusinessSelection] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const performLogin = async (credentials: {
    email: string;
    password: string;
    businessId?: string;
  }) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await apiFetch<{
        accessToken?: string;
        refreshToken?: string;
        businessId?: string;
        businessSelectionRequired?: boolean;
        businesses?: { businessId: string; businessName: string; status: string }[];
        user?: { id: string; email: string; name: string; mustResetPassword?: boolean };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          businessId: credentials.businessId,
          deviceId: getOrCreateDeviceId(),
        }),
      });

      if (response.businessSelectionRequired && response.businesses?.length) {
        const last = getLastBusinessId();
        const match = response.businesses.find(
          (biz) => biz.businessId === last,
        );
        setAvailableBusinesses(response.businesses);
        setSelectedBusinessId(
          match?.businessId ?? response.businesses[0].businessId,
        );
        setPendingCredentials({
          email: credentials.email,
          password: credentials.password,
        });
        setNeedsBusinessSelection(true);
        return;
      }

      if (response.accessToken && response.refreshToken && response.user) {
        setSession(response.accessToken, response.refreshToken, response.user);
        if (response.businessId) {
          setLastBusinessId(response.businessId);
        } else if (credentials.businessId) {
          setLastBusinessId(credentials.businessId);
        }
        router.replace(`/${params.locale}`);
        return;
      }

      setError(t('loginFailed'));
    } catch (err) {
      setError(getApiErrorMessage(err, t('loginFailedVerify')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await performLogin({ email, password });
  };

  const submitBusinessSelection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingCredentials || !selectedBusinessId) {
      setError(t('selectBusinessRequired'));
      return;
    }
    await performLogin({
      ...pendingCredentials,
      businessId: selectedBusinessId,
    });
  };

  return (
    <div className="space-y-6 nvi-reveal">
      <PremiumPageHeader
        eyebrow="AUTH GATE"
        title={t('commandRoomFormTitle')}
        subtitle={t('commandRoomFormSubtitle')}
        badges={
          <>
            <span className="nvi-badge">SECURE LOGIN</span>
            <span className="nvi-badge">{needsBusinessSelection ? 'BUSINESS PICK' : 'DIRECT'}</span>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 nvi-stagger">
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">BUSINESSES</p>
          <p className="mt-1 text-2xl font-semibold text-gold-100">{availableBusinesses.length}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">STATUS</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{isSubmitting ? t('signingIn') : 'READY'}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">SELECTION</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{needsBusinessSelection ? 'REQUIRED' : 'OPTIONAL'}</p>
        </article>
      </div>

      <form className="command-card nvi-panel space-y-4 p-4" onSubmit={submit}>
        <div className="space-y-2">
          <label className="text-sm text-gold-200" htmlFor="email">
            {t('username')}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm text-gold-200" htmlFor="password">
            {t('password')}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="nvi-cta w-full rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="ring" size="xs" /> : null}
            {isSubmitting ? t('signingIn') : t('enterCommandRoom')}
          </span>
        </button>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </form>

      {needsBusinessSelection ? (
        <form
          className="command-card nvi-panel space-y-3 p-4"
          onSubmit={submitBusinessSelection}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submitBusinessSelection(event);
            }
          }}
        >
          <div className="rounded border border-gold-700/40 bg-black/40 p-4">
            <p className="text-sm text-gold-200">
              {t('selectBusiness')}
            </p>
            <div className="mt-3">
              <SmartSelect
                instanceId="login-business-select"
                value={selectedBusinessId}
                onChange={setSelectedBusinessId}
                options={availableBusinesses.map((biz) => ({
                  value: biz.businessId,
                  label: biz.businessName,
                }))}
                className="text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="nvi-cta mt-3 w-full rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? t('loading') : t('continue')}
            </button>
          </div>
        </form>
      ) : null}
      <p className="text-xs text-gold-300">
        {t('needBusiness')}{' '}
        <Link
          href={`/${params.locale}/signup`}
          className="text-gold-200 underline-offset-4 hover:underline"
        >
          {t('createBusiness')}
        </Link>
      </p>
      <p className="text-xs text-gold-300">
        {t('forgotPassword')}{' '}
        <Link
          href={`/${params.locale}/password-reset`}
          className="text-gold-200 underline-offset-4 hover:underline"
        >
          {t('resetIt')}
        </Link>
      </p>
    </div>
  );
}
