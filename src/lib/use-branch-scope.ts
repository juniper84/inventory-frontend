'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { useActiveBranch } from '@/lib/branch-context';
import {
  getBranchModeForPathname,
  resolveBranchIdForMode,
  type BranchMode,
} from '@/lib/branch-policy';

export function useBranchScope() {
  const pathname = usePathname();
  const activeBranch = useActiveBranch();
  const mode: BranchMode = useMemo(
    () => getBranchModeForPathname(pathname),
    [pathname],
  );

  const resolveBranchId = (selectedBranchId?: string | null) =>
    resolveBranchIdForMode({
      mode,
      selectedBranchId,
      activeBranchId: activeBranch?.id ?? '',
    });

  return {
    mode,
    activeBranch,
    resolveBranchId,
  };
}
