import manualEn from '@/data/manual/manual.en.json';
import manualSw from '@/data/manual/manual.sw.json';

export type ManualLocale = 'en' | 'sw';

type ManualRelatedPage = {
  id: string;
  route: string;
  reason: string;
  order: 'before' | 'after' | 'parallel';
};

type ManualError = {
  error_code: string;
  error_symptom: string;
  likely_cause: string;
  fix_steps: string[];
  related_route?: string;
};

type ManualPrerequisite = {
  check: string;
  required: boolean;
  where_to_do_it?: string;
};

type ManualWorkflowStep = {
  step: string;
  expected_result?: string;
  if_blocked?: string;
};

export type ManualEntry = {
  id: string;
  route: string;
  module: string;
  locale: ManualLocale;
  title: string;
  purpose: string;
  audience: string[];
  prerequisites: ManualPrerequisite[];
  workflow: ManualWorkflowStep[];
  common_errors: ManualError[];
  related_pages: ManualRelatedPage[];
  permissions_required: string[];
  last_reviewed_at: string;
  review_owner: string;
};

type ManualDataset = {
  version: string;
  locale: ManualLocale;
  scope: {
    included_routes: number;
    excluded_prefixes: string[];
  };
  entries: ManualEntry[];
};

const DATASETS: Record<ManualLocale, ManualDataset> = {
  en: manualEn as ManualDataset,
  sw: manualSw as ManualDataset,
};

const DYNAMIC_SEGMENT = /^\[[^\]]+\]$/;

function normalizePathname(pathname: string) {
  const base = pathname.split('?')[0].split('#')[0];
  if (base === '/') {
    return '/';
  }
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function toLocalePattern(pathname: string) {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) {
    return '/{locale}';
  }
  const [, ...rest] = segments;
  return rest.length ? `/{locale}/${rest.join('/')}` : '/{locale}';
}

function isRouteMatch(pattern: string, concrete: string) {
  const patternSegments = pattern.split('/').filter(Boolean);
  const concreteSegments = concrete.split('/').filter(Boolean);
  if (patternSegments.length !== concreteSegments.length) {
    return false;
  }
  for (let i = 0; i < patternSegments.length; i += 1) {
    if (DYNAMIC_SEGMENT.test(patternSegments[i])) {
      continue;
    }
    if (patternSegments[i] !== concreteSegments[i]) {
      return false;
    }
  }
  return true;
}

export function getManualDataset(locale: ManualLocale) {
  return DATASETS[locale] ?? DATASETS.en;
}

export function resolveManualEntry(pathname: string, locale: ManualLocale) {
  const dataset = getManualDataset(locale);
  const concretePattern = toLocalePattern(pathname);

  const exact = dataset.entries.find((entry) => entry.route === concretePattern);
  if (exact) {
    return exact;
  }

  return (
    dataset.entries.find((entry) => isRouteMatch(entry.route, concretePattern)) ??
    null
  );
}

export function materializeLocaleRoute(route: string, locale: ManualLocale) {
  return route.replace('/{locale}', `/${locale}`);
}

export function isManualInScopePath(pathname: string) {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 1) {
    return false;
  }
  return segments[1] !== 'platform';
}
