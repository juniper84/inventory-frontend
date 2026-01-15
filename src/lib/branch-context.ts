'use client';

import { useEffect, useState } from 'react';

export type ActiveBranch = { id: string; name?: string | null };

const ACTIVE_BRANCH_KEY = 'nvi.activeBranch';
const BRANCH_EVENT = 'nvi-branch-change';

export function getActiveBranch(): ActiveBranch | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(ACTIVE_BRANCH_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ActiveBranch;
  } catch {
    return null;
  }
}

export function setActiveBranch(branch: ActiveBranch | null) {
  if (typeof window === 'undefined') {
    return;
  }
  if (branch) {
    window.localStorage.setItem(ACTIVE_BRANCH_KEY, JSON.stringify(branch));
  } else {
    window.localStorage.removeItem(ACTIVE_BRANCH_KEY);
  }
  window.dispatchEvent(new CustomEvent(BRANCH_EVENT, { detail: branch }));
}

export function useActiveBranch() {
  const [activeBranch, setActiveBranchState] = useState<ActiveBranch | null>(() =>
    getActiveBranch(),
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<ActiveBranch | null>;
      setActiveBranchState(custom.detail ?? null);
    };
    window.addEventListener(BRANCH_EVENT, handler);
    return () => window.removeEventListener(BRANCH_EVENT, handler);
  }, []);

  return activeBranch;
}
