'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { SmartSelect } from '@/components/SmartSelect';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

export default function SignupPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tier, setTier] = useState('BUSINESS');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await apiFetch<{
        verificationRequired: boolean;
        userId: string;
        businessId: string;
        verificationToken?: string;
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
      if (response.verificationToken && response.businessId) {
        router.replace(
          `/${params.locale}/verify-email?token=${response.verificationToken}&businessId=${encodeURIComponent(response.businessId)}&email=${encodeURIComponent(email)}`,
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
    <div className="space-y-6 nvi-reveal">
      <PremiumPageHeader
        eyebrow="ACCOUNT PROVISIONING"
        title={t('createBusinessTitle')}
        subtitle={t('createBusinessSubtitle')}
        badges={
          <>
            <span className="nvi-badge">TRIAL FLOW</span>
            <span className="nvi-badge">{tier}</span>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 nvi-stagger">
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">BUSINESS NAME</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{businessName.trim() ? 'SET' : 'PENDING'}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">OWNER</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{ownerName.trim() ? 'SET' : 'PENDING'}</p>
        </article>
        <article className="command-card nvi-panel p-3 nvi-reveal">
          <p className="text-[10px] uppercase tracking-[0.25em] text-gold-500">STATUS</p>
          <p className="mt-1 text-sm font-semibold text-gold-100">{isSubmitting ? t('creating') : 'READY'}</p>
        </article>
      </div>

      <form className="command-card nvi-panel space-y-4 p-4" onSubmit={submit}>
        <input
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder={t('businessName')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <input
          value={ownerName}
          onChange={(event) => setOwnerName(event.target.value)}
          placeholder={t('ownerName')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('ownerEmail')}
          type="email"
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
        />
        <div className="space-y-2">
          <div className="relative">
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('password')}
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
        <SmartSelect
          value={tier}
          onChange={(value) => setTier(value)}
          options={[
            { value: 'STARTER', label: t('tierStarter') },
            { value: 'BUSINESS', label: t('tierBusiness') },
            { value: 'ENTERPRISE', label: t('tierEnterprise') },
          ]}
          className="w-full"
        />
        <p className="text-xs text-gold-400">
          {t('trialTierHint')}
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="nvi-cta w-full rounded px-4 py-2 font-semibold text-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="dots" size="xs" /> : null}
            {isSubmitting ? t('creating') : t('createAccount')}
          </span>
        </button>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </form>
    </div>
  );
}
