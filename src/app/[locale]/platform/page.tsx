import { redirect } from 'next/navigation';

export default function PlatformRootPage({
  params,
}: {
  params: { locale: string };
}) {
  redirect(`/${params.locale}/platform/overview`);
}
