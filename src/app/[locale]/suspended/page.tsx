'use client';

import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth';

export default function SuspendedPage() {
  const t = useTranslations('suspended');
  const router = useRouter();
  const params = useParams<{ locale: string }>();

  function handleSignOut() {
    clearSession();
    router.replace(`/${params.locale}/login`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-3">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {t('signOut')}
        </button>
      </div>
    </div>
  );
}
