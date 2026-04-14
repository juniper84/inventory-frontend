'use client';

import { BusinessRegistryView } from '@/components/platform/views/businesses/BusinessRegistryView';
import { BusinessWorkspaceProvider } from '@/components/platform/views/businesses/context/BusinessWorkspaceContext';

export function PlatformBusinessesView() {
  return (
    <BusinessWorkspaceProvider>
      <BusinessRegistryView />
    </BusinessWorkspaceProvider>
  );
}
