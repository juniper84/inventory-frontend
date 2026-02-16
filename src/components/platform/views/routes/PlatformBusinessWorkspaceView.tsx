'use client';

import { PlatformConsole } from '@/components/platform/PlatformConsole';

export function PlatformBusinessWorkspaceView({
  businessId,
}: {
  businessId: string;
}) {
  return <PlatformConsole view="businesses" focusBusinessId={businessId} />;
}
