'use client';

import { useEffect, useState } from 'react';
import { useToastState } from '@/lib/app-notifications';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { Spinner } from '@/components/Spinner';

export default function AcceptInvitePage() {
  const auth = useTranslations('auth');
  const t = useTranslations('invitePage');
  const router = useRouter();
  const params = useParams<{ locale: string }>();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useToastState();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    }
  }, [searchParams]);

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
      setTimeout(() => {
        router.replace(`/${params.locale}/login`);
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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-gold-100">
          {t('title')}
        </h1>
        <p className="text-sm text-gold-300">
          {t('subtitle')}
        </p>
      </div>

      <form className="space-y-4" onSubmit={submit}>
        <input
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={t('tokenPlaceholder')}
          className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-gold-100"
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
          className="w-full rounded bg-gold-500 px-4 py-2 font-semibold text-black disabled:opacity-70"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {isSubmitting ? <Spinner variant="dots" size="xs" /> : null}
            {isSubmitting ? t('submitting') : t('submit')}
          </span>
        </button>
        {message ? <p className="text-sm text-gold-300">{message}</p> : null}
      </form>
    </div>
  );
}
