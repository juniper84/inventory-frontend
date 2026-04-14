'use client';

import { BusinessWorkspaceView } from '@/components/platform/views/businesses/BusinessWorkspaceView';
import { BusinessWorkspaceProvider } from '@/components/platform/views/businesses/context/BusinessWorkspaceContext';

export function PlatformBusinessWorkspaceView({
  businessId,
}: {
  businessId: string;
}) {
  return (
    <BusinessWorkspaceProvider>
      <BusinessWorkspaceView businessId={businessId} />
    </BusinessWorkspaceProvider>
  );
}
