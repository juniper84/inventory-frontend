'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { setSession } from '@/lib/auth';
import { Spinner } from '@/components/Spinner';
export default function SignupPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const locale = useLocale();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tier, setTier] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!tier) {
      setError(t('planRequired'));
      return;
    }
    // Client-side password validation
    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError(t('passwordRequiresLetterAndNumber'));
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiFetch<{
        verificationRequired: boolean;
        userId: string;
        businessId: string;
        isExistingUser?: boolean;
        accessToken?: string;
        refreshToken?: string;
        user?: { id: string; email: string; name: string };
      }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          businessName,
          ownerName,
          email,
          password,
          tier,
        }),
      });
      if (response.isExistingUser && response.accessToken && response.refreshToken && response.user) {
        // Existing verified user — auto-login into the new business
        setSession(response.accessToken, response.refreshToken, response.user);
        router.replace(`/${locale}/onboarding`);
      } else if (response.verificationRequired && response.businessId) {
        // New user — needs email verification first
        router.replace(
          `/${locale}/verify-email?email=${encodeURIComponent(email)}`,
        );
      } else {
        setError(t('signupTokenMissing'));
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t('signupFailed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-login-inner">
      <div className="auth-login-topline">
        <span className="auth-login-pill">{t('createBusinessTitle').toUpperCase()}</span>
        {tier ? (
          <span className="auth-login-pill auth-login-pill--teal">
            {t(`tier${tier.charAt(0)}${tier.slice(1).toLowerCase()}`).toUpperCase()}
          </span>
        ) : null}
      </div>

      <h3>{t('createBusinessTitle')}</h3>
      <p>{t('createBusinessSubtitle')}</p>

      <form className="auth-login-form" onSubmit={submit}>
        <div className="auth-login-field">
          <label htmlFor="businessName">{t('businessName')}</label>
          <div className="auth-login-control">
            <input
              id="businessName"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder={t('businessName')}
              required
              maxLength={100}
            />
          </div>
        </div>

        <div className="auth-login-field">
          <label htmlFor="ownerName">{t('ownerName')}</label>
          <div className="auth-login-control">
            <input
              id="ownerName"
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder={t('ownerName')}
              required
              maxLength={100}
            />
          </div>
        </div>

        <div className="auth-login-field">
          <label htmlFor="email">{t('ownerEmail')}</label>
          <div className="auth-login-control">
            <input
              id="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t('ownerEmail')}
              type="email"
              required
              autoComplete="email"
            />
          </div>
        </div>

        <div className="auth-login-field">
          <label htmlFor="password">{t('password')}</label>
          <div className="auth-login-control">
            <input
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
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
          <p className="text-xs text-gold-400">{t('passwordRequirements')}</p>
        </div>

        <div className="auth-login-field">
          <label>{t('choosePlan')}</label>
          <div className="tier-pills" role="radiogroup" aria-label={t('choosePlan')}>
            {([
              { value: 'STARTER', label: t('tierStarter'), desc: t('tierStarterDesc') },
              { value: 'BUSINESS', label: t('tierBusiness'), desc: t('tierBusinessDesc') },
              { value: 'ENTERPRISE', label: t('tierEnterprise'), desc: t('tierEnterpriseDesc') },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={tier === option.value}
                onClick={() => setTier(option.value)}
                className={`tier-pill ${tier === option.value ? 'tier-pill--active' : ''}`}
              >
                <span className="tier-pill__name">{option.label}</span>
                <span className="tier-pill__desc">{option.desc}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gold-400" style={{ marginTop: 4 }}>{t('trialTierHint')}</p>
        </div>

        <button type="submit" disabled={isSubmitting} className="auth-login-submit nvi-press">
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="dots" size="xs" /> : null}
            {isSubmitting ? t('creating') : t('createAccount')}
          </span>
        </button>

        {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
      </form>

      <div className="auth-login-foot">
        <span>
          {t('alreadyHaveAccount')}{' '}
          <a href={`/${locale}/login`}>{t('signIn')}</a>
        </span>
      </div>
    </div>
  );
}
