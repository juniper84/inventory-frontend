export type BranchMode = 'required' | 'defaulted' | 'ignored';

type BranchPolicyRule = {
  mode: BranchMode;
  paths: string[];
};

const BRANCH_POLICY_RULES: BranchPolicyRule[] = [
  {
    mode: 'ignored',
    paths: [
      '/login',
      '/signup',
      '/invite',
      '/verify-email',
      '/password-reset',
      '/platform',
      '/platform/*',
      '/onboarding',
    ],
  },
  {
    mode: 'required',
    paths: [
      '/pos',
      '/receipts',
      '/stock/adjustments',
      '/stock/counts/wizard',
      '/transfers/wizard',
      '/purchase-orders/wizard',
      '/shifts',
    ],
  },
  {
    mode: 'defaulted',
    paths: [
      '/',
      '/reports',
      '/reports/*',
      '/stock',
      '/stock/*',
      '/purchases',
      '/purchase-orders',
      '/transfers',
      '/supplier-returns',
      '/receiving',
      '/expenses',
      '/exports',
      '/catalog/*',
      '/customers',
      '/notifications',
      '/notes',
      '/audit-logs',
      '/approvals',
      '/search',
      '/offline',
      '/offline/*',
      '/settings/*',
      '/attachments',
      '/suppliers',
      '/price-lists',
      '/price-lists/*',
    ],
  },
];

const normalizePathname = (pathname: string) => {
  if (!pathname || pathname === '/') {
    return '/';
  }
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    return '/';
  }
  const [, ...rest] = segments;
  if (!rest.length) {
    return '/';
  }
  return `/${rest.join('/')}`;
};

const matchesRule = (path: string, rulePath: string) => {
  if (rulePath.endsWith('/*')) {
    const prefix = rulePath.slice(0, -2);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return path === rulePath;
};

export const getBranchModeForPathname = (pathname: string): BranchMode => {
  const normalized = normalizePathname(pathname);
  for (const rule of BRANCH_POLICY_RULES) {
    if (rule.paths.some((rulePath) => matchesRule(normalized, rulePath))) {
      return rule.mode;
    }
  }
  return 'defaulted';
};

export const resolveBranchIdForMode = ({
  mode,
  selectedBranchId,
  activeBranchId,
}: {
  mode: BranchMode;
  selectedBranchId?: string | null;
  activeBranchId?: string | null;
}) => {
  const selected = selectedBranchId?.trim() ?? '';
  const active = activeBranchId?.trim() ?? '';
  if (mode === 'ignored') {
    return '';
  }
  if (mode === 'required') {
    return selected || active;
  }
  return selected || active;
};

export const isBranchSelectorVisible = (pathname: string) =>
  getBranchModeForPathname(pathname) !== 'ignored';
