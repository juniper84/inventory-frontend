'use client';

import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth';
import { AlertTriangle } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';

export default function SuspendedPage() {
  const t = useTranslations('suspended');
  const router = useRouter();
  const params = useParams<{ locale: string }>();

  function handleSignOut() {
    clearSession();
    router.replace(`/${params.locale}/login`);
  }

  return (
    <div className="auth-suspended-root">
      <div className="auth-suspended-card">
        <div className="mb-4">
          <BrandLogo variant="vision" size="sm" animated={false} />
        </div>
        <div className="auth-suspended-icon"><AlertTriangle size={32} /></div>
        <h1 className="mt-4 text-2xl font-bold text-red-200">{t('title')}</h1>
        <p className="mt-3 text-sm text-red-300/70 leading-relaxed">{t('description')}</p>
        <button onClick={handleSignOut} className="auth-suspended-btn nvi-press">
          {t('signOut')}
        </button>
      </div>
    </div>
  );
}
