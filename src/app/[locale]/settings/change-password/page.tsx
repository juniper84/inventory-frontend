'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { useToastState } from '@/lib/app-notifications';
import { StatusBanner } from '@/components/StatusBanner';
import { PremiumPageHeader } from '@/components/PremiumPageHeader';

export default function ChangePasswordPage() {
  const t = useTranslations('changePasswordPage');
  const actions = useTranslations('actions');
  const [message, setMessage] = useToastState();
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (field: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setMessage({ action: 'save', outcome: 'failure', message: t('passwordMismatch') });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        token,
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage({ action: 'save', outcome: 'success', message: t('success') });
    } catch (err) {
      setMessage({
        action: 'save',
        outcome: 'failure',
        message: getApiErrorMessage(err, t('saveFailed')),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <PremiumPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
      />
      {message ? <StatusBanner message={message} /> : null}
      <form onSubmit={handleSubmit} className="command-card nvi-panel p-6 space-y-4 max-w-md nvi-reveal">
        <div className="space-y-1">
          <label htmlFor="cp-current" className="text-xs uppercase tracking-[0.2em] text-gold-400">
            {t('currentPassword')}
          </label>
          <input
            id="cp-current"
            type="password"
            value={form.currentPassword}
            onChange={handleChange('currentPassword')}
            required
            autoComplete="current-password"
            className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="cp-new" className="text-xs uppercase tracking-[0.2em] text-gold-400">
            {t('newPassword')}
          </label>
          <input
            id="cp-new"
            type="password"
            value={form.newPassword}
            onChange={handleChange('newPassword')}
            required
            autoComplete="new-password"
            className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="cp-confirm" className="text-xs uppercase tracking-[0.2em] text-gold-400">
            {t('confirmPassword')}
          </label>
          <input
            id="cp-confirm"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange('confirmPassword')}
            required
            autoComplete="new-password"
            className="w-full rounded border border-gold-700/50 bg-black px-3 py-2 text-sm text-gold-100"
          />
        </div>
        <button
          type="submit"
          disabled={
            isSaving ||
            !form.currentPassword ||
            !form.newPassword ||
            !form.confirmPassword
          }
          className="nvi-cta rounded px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
        >
          {isSaving ? actions('saving') : t('submit')}
        </button>
      </form>
    </section>
  );
}
