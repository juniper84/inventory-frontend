import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/AppShell';
import '../globals.css';

export const metadata: Metadata = {
  title: 'New Vision Inventory',
  description: 'Inventory management system',
};

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'sw' }];
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale = 'en' } = await params;
  setRequestLocale(locale);
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppShell>{children}</AppShell>
    </NextIntlClientProvider>
  );
}
