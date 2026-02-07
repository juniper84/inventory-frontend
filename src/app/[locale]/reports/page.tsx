import { redirect } from 'next/navigation';

export default async function ReportsIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const query = new URLSearchParams();
  const rawSearchParams = await searchParams;
  Object.entries(rawSearchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
      return;
    }
    if (typeof value === 'string' && value.length > 0) {
      query.set(key, value);
    }
  });
  const suffix = query.toString();
  redirect(`/${locale}/reports/overview${suffix ? `?${suffix}` : ''}`);
}
