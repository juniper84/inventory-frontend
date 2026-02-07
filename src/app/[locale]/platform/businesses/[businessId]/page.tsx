import { PlatformConsole } from '@/components/platform/PlatformConsole';

export default async function PlatformBusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return (
    <PlatformConsole
      view="businesses"
      focusBusinessId={(await params).businessId}
    />
  );
}
