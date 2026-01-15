import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

const locales = ['en', 'sw'] as const;

export default getRequestConfig(async ({ locale }) => {
  if (locale && !locales.includes(locale as (typeof locales)[number])) {
    notFound();
  }

  const resolvedLocale =
    locale && locales.includes(locale as (typeof locales)[number])
      ? locale
      : 'en';

  return {
    locale: resolvedLocale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default,
  };
});
