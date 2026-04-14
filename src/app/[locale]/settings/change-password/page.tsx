'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  Lock,
  KeyRound,
  Check,
  Eye,
  EyeOff,
  ChevronLeft,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch, getApiErrorMessage } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import { notify } from '@/components/notifications/NotificationProvider';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { TextInput } from '@/components/ui/TextInput';
import { Banner } from '@/components/notifications/Banner';
import type { NotifySeverity } from '@/components/notifications/types';

export default function ChangePasswordPage() {
  const locale = useLocale();
  const t = useTranslations('changePasswordPage');
  const actions = useTranslations('actions');
  const [bannerMsg, setBannerMsg] = useState<{ text: string; severity: NotifySeverity } | null>(null);
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (field: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const mismatch =
    form.newPassword.length > 0 &&
    form.confirmPassword.length > 0 &&
    form.newPassword !== form.confirmPassword;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setBannerMsg({ text: t('passwordMismatch'), severity: 'error' });
      return;
    }
    const token = getAccessToken();
    if (!token) {
      return;
    }
    setIsSaving(true);
    setBannerMsg(null);
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
      setBannerMsg(null);
      notify.success(t('success'));
    } catch (err) {
      setBannerMsg({
        text: getApiErrorMessage(err, t('saveFailed')),
        severity: 'error',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="nvi-page">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        subtitle={t('subtitle')}
      />

      {/* Centered form column */}
      <div className="mx-auto w-full max-w-[480px] space-y-5 pt-4">
        {/* Back to profile */}
        <Link
          href={`/${locale}/settings/profile`}
          className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-gold-400/70 transition-colors hover:text-gold-300"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {t('backToProfile')}
        </Link>

        {/* Banner for errors */}
        {bannerMsg ? (
          <Banner
            message={bannerMsg.text}
            severity={bannerMsg.severity}
            onDismiss={() => setBannerMsg(null)}
          />
        ) : null}

        {/* Shield icon anchor */}
        <Card padding="lg" className="nvi-slide-in-bottom space-y-6">
          <div className="flex flex-col items-center gap-3 pb-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-500/10 ring-1 ring-gold-500/20">
              <ShieldCheck className="h-8 w-8 text-gold-400" />
            </div>
            <p className="text-center text-sm text-gold-300/60">
              {t('securityHint')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Current password */}
            <div className="grid gap-1.5">
              <label
                htmlFor="cp-current"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gold-300/80"
              >
                <Lock className="h-3.5 w-3.5" />
                {t('currentPassword')}
              </label>
              <div className="relative">
                <TextInput
                  id="cp-current"
                  type={showCurrent ? 'text' : 'password'}
                  value={form.currentPassword}
                  onChange={handleChange('currentPassword')}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="nvi-focus-pulse pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gold-500/50 transition-colors hover:text-gold-300"
                  aria-label={showCurrent ? t('hide') : t('show')}
                >
                  {showCurrent ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="grid gap-1.5">
              <label
                htmlFor="cp-new"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gold-300/80"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {t('newPassword')}
              </label>
              <div className="relative">
                <TextInput
                  id="cp-new"
                  type={showNew ? 'text' : 'password'}
                  value={form.newPassword}
                  onChange={handleChange('newPassword')}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="nvi-focus-pulse pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gold-500/50 transition-colors hover:text-gold-300"
                  aria-label={showNew ? t('hide') : t('show')}
                >
                  {showNew ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gold-500/40">{t('passwordRequirements')}</p>
            </div>

            {/* Confirm password */}
            <div className="grid gap-1.5">
              <label
                htmlFor="cp-confirm"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gold-300/80"
              >
                <Check className="h-3.5 w-3.5" />
                {t('confirmPassword')}
              </label>
              <div className="relative">
                <TextInput
                  id="cp-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={handleChange('confirmPassword')}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={`nvi-focus-pulse pr-10 ${mismatch ? '!border-red-500/60' : ''}`}
                  error={mismatch ? t('passwordMismatch') : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gold-500/50 transition-colors hover:text-gold-300"
                  style={mismatch ? { top: 'calc(50% - 0.65rem)' } : undefined}
                  aria-label={showConfirm ? t('hide') : t('show')}
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={
                isSaving ||
                !form.currentPassword ||
                !form.newPassword ||
                !form.confirmPassword
              }
              className="nvi-press flex w-full items-center justify-center gap-2 rounded-xl bg-gold-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Lock className="h-4 w-4" />
              {isSaving ? actions('saving') : t('submit')}
            </button>
          </form>
        </Card>
      </div>
    </section>
  );
}
