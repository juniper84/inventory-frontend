'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getLastBusinessId, getOrCreateDeviceId, setLastBusinessId, setSession } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo') ?? '';
  const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '';
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
        router.replace(returnTo || `/${params.locale}`);
        return;
      }

      setError(t('loginFailed'));
    } catch (err) {
      const msg = getApiErrorMessage(err, '');
      const errObj = err as { errorCode?: string; message?: string };
      if (errObj?.errorCode === 'BUSINESS_SUSPENDED' || msg.includes('Business is not active')) {
        setError(t('businessSuspendedError'));
      } else if (msg.includes('not verified')) {
        setError(t('emailNotVerifiedError'));
      } else if (msg.includes('not active')) {
        setError(t('userNotActiveError'));
      } else {
        setError(msg || t('loginFailedVerify'));
      }
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
    <div className="auth-login-inner">
      <div className="auth-login-topline">
        <span className="auth-login-pill">{t('loginTitle').toUpperCase()}</span>
        <span className="auth-login-pill auth-login-pill--teal">
          {String(params.locale || 'en').toUpperCase()}
        </span>
      </div>

      <h3>{t('loginTitle')}</h3>
      <p>{t('commandRoomFormSubtitle')}</p>

      <form className="auth-login-form" onSubmit={(e) => { if (needsBusinessSelection) { e.preventDefault(); return; } submit(e); }}>
        <div className="auth-login-field">
          <label htmlFor="email">{t('username')}</label>
          <div className="auth-login-control">
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@company.com"
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div className="auth-login-field">
          <label htmlFor="password">
            {t('password')}
            <Link href={`/${params.locale}/password-reset`} className="auth-login-link">
              {t('resetIt')}
            </Link>
          </label>
          <div className="auth-login-control">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="auth-login-link"
            >
              {showPassword ? t('hidePassword') : t('showPassword')}
            </button>
          </div>
        </div>

        <button type="submit" disabled={isSubmitting} className="auth-login-submit nvi-press">
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="ring" size="xs" /> : null}
            {isSubmitting ? t('signingIn') : t('signIn')}
          </span>
        </button>

        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      </form>

      {needsBusinessSelection ? (
        <form
          className="auth-login-business"
          onSubmit={submitBusinessSelection}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && selectedBusinessId) {
              event.preventDefault();
              submitBusinessSelection(event);
            }
          }}
        >
          <label>{t('selectBusiness')}</label>
          <SmartSelect
            instanceId="login-business-select"
            value={selectedBusinessId}
            onChange={setSelectedBusinessId}
            options={availableBusinesses.map((biz) => ({
              value: biz.businessId,
              label: biz.status === 'SUSPENDED'
                ? `${biz.businessName} (${t('businessSuspended')})`
                : biz.businessName,
              isDisabled: biz.status === 'SUSPENDED',
            }))}
            className="text-sm"
          />
          <button type="submit" disabled={isSubmitting} className="auth-login-submit nvi-press" autoFocus>
            {isSubmitting ? t('loading') : t('continue')}
          </button>
        </form>
      ) : null}

      <div className="auth-login-foot">
        <span>
          {t('needBusiness')}{' '}
          <Link href={`/${params.locale}/signup`}>{t('createBusiness')}</Link>
        </span>
      </div>
    </div>
  );
}
