import { PlatformBusinessWorkspaceView } from '@/components/platform/views/routes/PlatformBusinessWorkspaceView';

export default async function PlatformBusinessDetailPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  return <PlatformBusinessWorkspaceView businessId={(await params).businessId} />;
}
